"""Import Hadi Mohammadi's EMNLP Atlas topics onto verified poster boards.

Run offline against the committed snapshot. To refresh it, pass an explicit
upstream Git commit with --revision. No ML dependencies or schedule imports.
"""
import argparse
import csv
import gzip
import hashlib
import io
import json
import re
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import urlopen

from import_anthology import match_papers
from poster_catalog import load_catalog

ROOT = Path(__file__).resolve().parents[1]
SOURCE = {
    "author": "Hadi Mohammadi",
    "name": "EMNLP 2026 Atlas",
    "url": "https://mohammadi.cv/emnlp/2026/atlas.html",
    "repository": "https://github.com/mohammadi-hadi/emnlp",
}
INPUTS = ["data/poster-boards.json", "data/papers.json", "data/anthology-catalog.json",
          "data/anthology-overrides.json", "data/atlas/source.json",
          "data/atlas/papers_index.csv.gz", "data/atlas/labels_2026.json", "data/atlas/local-areas.json"]


def input_hash(root=ROOT):
    digest = hashlib.sha256()
    for name in INPUTS:
        content = (root / name).read_bytes()
        digest.update(name.encode() + b"\0" + hashlib.sha256(content).digest())
    return digest.hexdigest()


def read_atlas(csv_bytes, labels):
    """Use upstream numeric IDs and verify the fine-to-broad relationship."""
    areas = [{"id": int(key), "label": value["name"], "description": value["one_line"]}
             for key, value in labels["broad"].items()]
    topics = [{"id": int(key), "label": value["name"], "description": value["one_line"]}
              for key, value in labels["fine"].items()]
    area_ids = {row["label"]: row["id"] for row in areas}
    topic_ids = {row["label"]: row["id"] for row in topics}
    if len(area_ids) != len(areas) or len(topic_ids) != len(topics):
        raise ValueError("Duplicate Atlas labels")
    if sorted(area_ids.values()) != list(range(16)) or sorted(topic_ids.values()) != list(range(100)):
        raise ValueError("Atlas taxonomy changed: review the area palette and topic structure")
    papers, parents = {}, {}
    for row in csv.DictReader(io.StringIO(csv_bytes.decode("utf-8"))):
        url = urlparse(row["anthology"])
        if url.scheme != "https" or url.netloc != "aclanthology.org" or not re.fullmatch(r"/[a-zA-Z0-9.-]+/", url.path):
            raise ValueError(f"Invalid Anthology identity: {row['anthology']}")
        anthology_id = url.path.strip("/")
        if anthology_id in papers:
            raise ValueError(f"Duplicate Atlas paper: {anthology_id}")
        topic, area = topic_ids[row["topic"]], area_ids[row["area"]]
        if topic in parents and parents[topic] != area:
            raise ValueError(f"Atlas topic has multiple areas: {row['topic']}")
        parents[topic] = area
        papers[anthology_id] = topic
    if set(parents) != set(topic_ids.values()):
        raise ValueError("Atlas index does not cover every labelled topic")
    for topic in topics:
        topic["area"] = parents[topic["id"]]
    return sorted(areas, key=lambda row: row["id"]), sorted(topics, key=lambda row: row["id"]), papers


def refresh_snapshot(revision, root=ROOT):
    if not re.fullmatch(r"[a-f0-9]{40}", revision):
        raise ValueError("Use a full upstream Git commit SHA")
    base = f"https://raw.githubusercontent.com/mohammadi-hadi/emnlp/{revision}/"
    with urlopen(base + "outputs/papers_index.csv", timeout=60) as response:
        index = response.read()
    with urlopen(base + "data/labels/labels_2026.json", timeout=60) as response:
        labels = response.read()
    read_atlas(index, json.loads(labels))  # Validate both downloads before writing.
    directory = root / "data/atlas"
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "papers_index.csv.gz").write_bytes(gzip.compress(index, mtime=0))
    (directory / "labels_2026.json").write_bytes(labels)
    manifest = {**SOURCE, "revision": revision, "sha256": {
        "papers_index.csv": hashlib.sha256(index).hexdigest(),
        "labels_2026.json": hashlib.sha256(labels).hexdigest(),
    }}
    (directory / "source.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def create_dataset(root=ROOT):
    read = lambda name: json.loads((root / name).read_text(encoding="utf-8"))
    source = read("data/atlas/source.json")
    index = gzip.decompress((root / "data/atlas/papers_index.csv.gz").read_bytes())
    labels = (root / "data/atlas/labels_2026.json").read_bytes()
    for name, content in [("papers_index.csv", index), ("labels_2026.json", labels)]:
        if hashlib.sha256(content).hexdigest() != source["sha256"][name]:
            raise ValueError(f"Atlas snapshot checksum mismatch: {name}")
    areas, topics, atlas = read_atlas(index, json.loads(labels))
    programme = read("data/papers.json")["papers"]
    links, _ = match_papers(programme, read("data/anthology-catalog.json"), read("data/anthology-overrides.json"))
    local_review = read("data/atlas/local-areas.json")
    by_id = {paper["id"]: paper for paper in programme}
    local = {}
    for row in local_review["assignments"]:
        pid = row["paperId"]
        if pid in local or pid not in by_id or row["title"] != by_id[pid]["title"]:
            raise ValueError(f"Local area identity changed or duplicated: {pid}")
        if links.get(pid) in atlas:
            raise ValueError(f"Atlas now classifies {pid}: remove its local assignment after review")
        if type(row["area"]) is not int or row["area"] not in {area["id"] for area in areas}:
            raise ValueError(f"Invalid local area: {pid}")
        if row["basis"] not in {"title", "title-and-abstract"} or not row["reason"]:
            raise ValueError(f"Local area needs review evidence: {pid}")
        local[pid] = {"area": row["area"], "basis": row["basis"]}
    catalog = load_catalog(root / "data/poster-boards.json")
    # Same physical-session rule as poster-map/catalog.mjs: D includes Industry.
    groups = {}
    for session in catalog["sessions"]:
        key = (*[session[k] for k in ["date", "start", "end"]], "".join(session.get("room", "").split()).lower())
        groups.setdefault(key, []).append(session["id"])
    aliases = {}
    for members in groups.values():
        canonical = next((sid for sid in members if re.fullmatch("[A-G]", sid)), members[0])
        aliases.update({sid: canonical for sid in members})
    sessions = {sid: {"assignments": []} for sid in sorted(set(aliases.values()))}
    counts = Counter((aliases[e["session"]], e["board"]) for e in catalog["entries"])
    missing = []
    for entry in catalog["entries"]:
        sid = aliases[entry["session"]]
        if not entry["verified"] or counts[sid, entry["board"]] != 1:
            continue
        anthology_id = links.get(entry["paperId"])
        assignment = {k: entry[k] for k in ["board", "paperId", "title"]}
        assignment.update(anthologyId=anthology_id, topic=atlas.get(anthology_id))
        local_id = entry["paperId"]
        if assignment["topic"] is None and local_id in local:
            assignment["area"] = local[local_id]["area"]
        sessions[sid]["assignments"].append(assignment)
        if assignment["topic"] is None and "area" not in assignment:
            missing.append({"session": sid, **assignment, "reason": "No verified Anthology match" if not anthology_id else "Not in Atlas snapshot"})
    for session in sessions.values():
        session["assignments"].sort(key=lambda row: (0, row["board"]) if type(row["board"]) is int else (1, int(row["board"][1:])))
    data = {"version": 2, "source": source, "inputsSHA256": input_hash(root),
            "areas": areas, "topics": topics, "papers": atlas, "localAreas": local,
            "localSource": {k: local_review[k] for k in ["assignedBy", "reviewedAt", "method"]}, "sessions": sessions}
    total = sum(len(s["assignments"]) for s in sessions.values())
    local_posters = sum("area" in entry for s in sessions.values() for entry in s["assignments"])
    audit = {"sourceRevision": source["revision"], "atlasPapers": len(atlas), "posters": total,
             "matched": total-len(missing)-local_posters, "localAssigned": local_posters, "unclassified": missing,
             "programme": {"total": len(programme), "matched": sum(links.get(p["id"]) in atlas for p in programme),
                           "localAssigned": len(local), "titleOnly": sum(row["basis"] == "title" for row in local.values()),
                           "unclassified": [p["id"] for p in programme if links.get(p["id"]) not in atlas and p["id"] not in local]}}
    return data, audit


def import_topics(root=ROOT):
    data, audit = create_dataset(root)
    (root / "data/poster-topics.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    (root / "data/atlas/audit.json").write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Imported {audit['matched']:,} Atlas labels and {audit['localAssigned']} local areas onto {audit['posters']:,} posters; {len(audit['unclassified'])} unclassified")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--revision", help="Download a new snapshot at this full upstream Git commit SHA")
    args = parser.parse_args()
    if args.revision:
        refresh_snapshot(args.revision)
    import_topics()
