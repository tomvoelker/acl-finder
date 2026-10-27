"""Snapshot ACL Anthology titles and abstracts for the catalogued papers.

Fetch the source XML at the current acl-anthology revision:
    python3 scripts/import_abstracts.py --fetch
Rebuild the snapshot from previously downloaded XML files:
    python3 scripts/import_abstracts.py --source-dir work/anthology-xml/<revision> --revision <revision>
"""

import argparse
import gzip
import hashlib
import json
import re
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data/embeddings/abstracts.json.gz"
REPOSITORY = "acl-org/acl-anthology"
REVISION = re.compile(r"[0-9a-f]{40}")


def collections(catalog):
    # 2026.emnlp-main.1 lives in data/xml/2026.emnlp.xml; 2025.tacl-1.5 in 2025.tacl.xml.
    return sorted({paper["id"].split("-", 1)[0] for paper in catalog["papers"]})


def text(element):
    return " ".join("".join(element.itertext()).split()) if element is not None else ""


def parse_collection(name, xml):
    papers = {}
    for volume in ET.fromstring(xml).iter("volume"):
        for paper in volume.iter("paper"):
            anthology_id = f"{name}-{volume.get('id')}.{paper.get('id')}"
            papers[anthology_id] = {"title": text(paper.find("title")), "abstract": text(paper.find("abstract"))}
    return papers


def create_snapshot(sources, revision, catalog):
    if not REVISION.fullmatch(revision):
        raise ValueError(f"Expected a full Git revision, got {revision!r}")
    parsed = {}
    for name, xml in sources.items():
        parsed.update(parse_collection(name, xml))
    wanted = [paper["id"] for paper in catalog["papers"]]
    missing = [paper_id for paper_id in wanted if paper_id not in parsed]
    if missing:
        raise ValueError(f"{len(missing)} catalogued papers are missing from the Anthology XML, e.g. {missing[:3]}")
    return {
        "source": {"repository": REPOSITORY, "revision": revision,
                   "files": {f"data/xml/{name}.xml": hashlib.sha256(xml).hexdigest() for name, xml in sorted(sources.items())}},
        "papers": {paper_id: parsed[paper_id] for paper_id in sorted(wanted)},
    }


def write_snapshot(snapshot):
    raw = (json.dumps(snapshot, ensure_ascii=False, indent=1) + "\n").encode()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_bytes(gzip.compress(raw, mtime=0))


def fetch(url, accept=None):
    request = urllib.request.Request(url, headers={"Accept": accept} if accept else {})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    inputs = parser.add_mutually_exclusive_group(required=True)
    inputs.add_argument("--fetch", action="store_true", help="download the XML at the current upstream revision")
    inputs.add_argument("--source-dir", type=Path, help="directory containing <collection>.xml files")
    parser.add_argument("--revision", help="acl-anthology revision of the files in --source-dir")
    args = parser.parse_args()
    catalog = json.loads((ROOT / "data/anthology-catalog.json").read_text())
    names = collections(catalog)
    if args.fetch:
        revision = fetch(f"https://api.github.com/repos/{REPOSITORY}/commits/master", "application/vnd.github.sha").decode().strip()
        sources = {name: fetch(f"https://raw.githubusercontent.com/{REPOSITORY}/{revision}/data/xml/{name}.xml") for name in names}
        cache = ROOT / "work/anthology-xml" / revision
        cache.mkdir(parents=True, exist_ok=True)
        for name, xml in sources.items():
            (cache / f"{name}.xml").write_bytes(xml)
    else:
        if not args.revision:
            parser.error("--source-dir requires --revision")
        revision = args.revision
        sources = {name: (args.source_dir / f"{name}.xml").read_bytes() for name in names}
    snapshot = create_snapshot(sources, revision, catalog)
    write_snapshot(snapshot)
    with_abstract = sum(1 for paper in snapshot["papers"].values() if paper["abstract"])
    print(f"Wrote {len(snapshot['papers']):,} papers at {revision[:12]}; {with_abstract:,} have an abstract.")


if __name__ == "__main__":
    main()
