"""Import explicit poster-board labels from the original conference handbook.

Reproduce: python3 scripts/import_handbook.py --source /path/to/handbook.pdf
Requires Poppler's pdftotext. The website consumes the checked-in JSON only.
"""

import argparse
from collections import Counter, defaultdict
from datetime import date
import hashlib
import json
from pathlib import Path
import re
import subprocess

from import_anthology import match_papers, normalize_title

ROOT = Path(__file__).resolve().parents[1]
SOURCE = {
    "url": "https://drive.google.com/file/d/1UGPjD7jPfax0RVaZPcb1gZhCUhK4v3ti/view",
    "title": "EMNLP 26 Digital Conference Handbook.pdf",
    "driveId": "1UGPjD7jPfax0RVaZPcb1gZhCUhK4v3ti",
    "modifiedAt": "2026-10-24T19:41:25.338Z",
}
SOURCE_SHA256 = "9ac20738a18f995d0e8e124f9e9ba8bab8fd5be82be893a0a27af4111f555a81"
# These omissions are present in the rendered PDF, not merely text extraction.
# Guard each reviewed title against both source and schedule changes.
REVIEWED_TITLES = [
    ("A", 166, "-Diffusion Language Models: Controllable Generalization of Continuous and Discrete Diffusion Dynamics",
     "4212-FIND", r"$\lambda$-Diffusion Language Models: Controllable Generalization of Continuous and Discrete Diffusion Dynamics"),
    ("C", 206, "Cross-Version -Transfer of QLoRA-Trained Adapters",
     "3907-MAIN", r"Cross-Version $\Delta$-Transfer of QLoRA-Trained Adapters"),
    ("G", 214, "/think Doesn’t Stop Reasoning: Analysis of Spurious CoT Termination",
     "6513-MAIN", r"$\textlangle \tt /think \textrangle$ Doesn’t Stop Reasoning: Analysis of Spurious CoT Termination"),
]
# Visually checked PDF page 268. This source title has no verified schedule ID.
SOURCE_ONLY_TITLES = [
    "Scale Doesn’t Compensate for the Gricean Maxims: The Impact of Reporting Bias on Vision-Language Reasoning",
]
POSTER_HEADING = re.compile(r"Poster Session ([A-Z]), Day (\d), (\d\d:\d\d)[–-](\d\d:\d\d)$")
INDUSTRY_HEADING = re.compile(r"Industry Track, Session (\d+): Poster Session, Day (\d), (\d\d:\d\d)[–-](\d\d:\d\d)$")
DAY_HEADER = re.compile(r"Main Conference, Day (\d), \w+, October (\d+), (\d{4})$")
BOARD = re.compile(r"\bBoard (\d+)\s*$")


def join_lines(lines):
    """Remove typographic line-end hyphenation, retaining source wording."""
    return re.sub(r"(?<=\w)-\s+(?=\w)", "", " ".join(lines)).strip()


def title_index(papers, publications):
    return {normalize_title(p["title"]) for p in papers + publications["papers"]} | {
        normalize_title(title) for title in SOURCE_ONLY_TITLES
    } | {normalize_title(row[2]) for row in REVIEWED_TITLES}


def title_spans(lines, known_titles):
    spans = []
    for first in range(len(lines)):
        for end in range(first + 1, len(lines)):
            title = join_lines([s for _, s in lines[first:end]])
            if normalize_title(title) in known_titles:
                spans.append((first, end, title))
    return spans


def extract_boards(text, known_titles):
    """Parse explicit labels, retaining page boundaries and recording missing labels.

    A label belongs to the final verified title before it. Earlier complete paper
    records can lack labels in this PDF and must never inherit the next label.
    Unknown title boundaries raise an error instead of guessing from line order.
    """
    sessions, entries, issues = [], [], []
    current, pending, day_dates = None, [], {}
    awaiting = None
    explicit_labels = 0

    def missing_labels(lines, session):
        if session:
            for first, _, title in title_spans(lines, known_titles):
                issues.append({"kind": "missing-board-label", "session": session["id"],
                               "page": lines[first][0], "title": title})

    for page, page_text in enumerate(text.split("\f"), 1):
        for raw in page_text.splitlines():
            line = raw.strip()
            if not line or re.fullmatch(r"\d+", line):
                continue
            header = DAY_HEADER.fullmatch(line)
            if header:
                day, day_of_month, year = header.groups()
                actual = date(int(year), 10, int(day_of_month)).isoformat()
                if day in day_dates and day_dates[day] != actual:
                    raise ValueError("Inconsistent handbook day/date headers")
                day_dates[day] = actual
                continue
            heading = POSTER_HEADING.fullmatch(line)
            industry = INDUSTRY_HEADING.fullmatch(line)
            if heading or industry:
                missing_labels(pending, current)
                number, day, start, end = (heading or industry).groups()
                if day not in day_dates:
                    raise ValueError(f"No source date for poster day {day}")
                current = {"id": number if heading else f"Industry{number}",
                           "label": f"Poster Session {number}" if heading else f"Industry Track Session {number}: Poster Session",
                           "date": day_dates[day], "start": start, "end": end, "room": None,
                           "page": page}
                if any(s["id"] == current["id"] for s in sessions):
                    raise ValueError("Duplicate poster-session heading")
                sessions.append(current)
                pending, awaiting = [], "label"
                continue
            if awaiting == "label":
                if line != current["label"]:
                    raise ValueError(f"Missing repeated label for {current['id']}")
                awaiting = "time"
                continue
            if awaiting == "time":
                slot = re.fullmatch(r"(\d\d:\d\d)[–-](\d\d:\d\d) \(([^)]+)\)", line)
                if not slot or slot.group(1, 2) != (current["start"], current["end"]):
                    raise ValueError(f"Inconsistent source session time: {line}")
                current["room"] = slot.group(3)
                awaiting = None
                continue
            # These are content headings, as opposed to repeated page furniture.
            if re.match(r"(?:Main Conference, Day \d, \d|Industry Track, Session|Birds of a Feather$)", line):
                missing_labels(pending, current)
                current, pending = None, []
            board = BOARD.search(line)
            if "Board " in line and not board:
                if current:
                    raise ValueError(f"Malformed board label on PDF page {page}: {line}")
            if board:
                explicit_labels += 1
                if current is None:
                    raise ValueError(f"Board label outside a verified poster session, page {page}")
                line = line[:board.start()].strip()
            if current is None:
                continue
            if line:
                pending.append((page, line))
            if not board:
                continue
            spans = title_spans(pending, known_titles)
            if not spans:
                raise ValueError(f"Unverified title boundary at {current['id']}/{board.group(1)}: {pending}")
            latest = max(first for first, _, _ in spans)
            selected = [span for span in spans if span[0] == latest]
            if len(selected) != 1:
                raise ValueError(f"Ambiguous title boundary on PDF page {page}")
            first, end, title = selected[0]
            for earlier_first, _, earlier_title in spans:
                if earlier_first < first:
                    issues.append({"kind": "missing-board-label", "session": current["id"],
                                   "page": pending[earlier_first][0], "title": earlier_title})
            entries.append({"session": current["id"], "board": int(board.group(1)),
                            "title": title, "authors": join_lines([s for _, s in pending[end:]]),
                            "page": pending[first][0], "boardPage": page, "paperId": None})
            pending = []
    missing_labels(pending, current)
    if awaiting or not entries:
        raise ValueError("Incomplete or empty handbook poster section")
    if len(entries) != explicit_labels:
        raise ValueError("Some explicit board labels were lost")
    return sessions, entries, issues


def match_entries(entries, sessions, papers, publications, overrides):
    publication_links, _ = match_papers(papers, publications, overrides)
    published = {p["id"]: p for p in publications["papers"]}
    by_title, by_id = defaultdict(set), {p["id"]: p for p in papers}
    for paper in papers:
        by_title[normalize_title(paper["title"])].add(paper["id"])
        if paper["id"] in publication_links:
            by_title[normalize_title(published[publication_links[paper["id"]]]["title"])].add(paper["id"])
    reviewed = {(s, b): (t, pid, expected) for s, b, t, pid, expected in REVIEWED_TITLES}
    slots = {s["id"]: s for s in sessions}
    for entry in entries:
        candidates = by_title[normalize_title(entry["title"])]
        review = reviewed.get((entry["session"], entry["board"]))
        if review:
            title, paper_id, expected = review
            if entry["title"] != title or by_id.get(paper_id, {}).get("title") != expected:
                raise ValueError(f"Reviewed handbook title changed: {entry['session']}/{entry['board']}")
            candidates = {paper_id}
            entry["matchMethod"] = "reviewed-source-title"
        slot = slots[entry["session"]]
        local = {pid for pid in candidates if by_id[pid].get("presentation") == "Poster"
                 and all(by_id[pid].get(key) == slot[key] for key in ("date", "start", "end", "room"))}
        if len(candidates) == 1 or len(local) == 1:
            paper_id = next(iter(candidates if len(candidates) == 1 else local))
            entry["paperId"] = paper_id
            entry.setdefault("matchMethod", "exact-title" if len(candidates) == 1 else "exact-title-and-session")
            paper = by_id[paper_id]
            differences = {key: {"schedule": paper.get(key), "handbook": slot[key]}
                           for key in ("date", "start", "end", "room") if paper.get(key) != slot[key]}
            if paper.get("presentation") != "Poster":
                differences["presentation"] = {"schedule": paper.get("presentation"), "handbook": "Poster"}
            if differences:
                entry["scheduleDifferences"] = differences
        else:
            entry["matchIssue"] = "ambiguous-title" if candidates else "no-verified-title-match"
            if candidates:
                entry["candidatePaperIds"] = sorted(candidates)


def validate_catalog(catalog):
    """Reject invalid data and return source conflicts without resolving them.

    Consumers must not display physical locations for entries marked conflict.
    """
    if catalog.get("version") != 1:
        raise ValueError("Unsupported poster-board catalog version")
    slots = {s["id"]: s for s in catalog["sessions"]}
    if len(slots) != len(catalog["sessions"]):
        raise ValueError("Duplicate session ID")
    boards, papers = defaultdict(list), defaultdict(list)
    for index, entry in enumerate(catalog["entries"]):
        if entry["session"] not in slots or not isinstance(entry["board"], int) or not 1 <= entry["board"] <= 424:
            raise ValueError(f"Invalid board or session: {entry}")
        if not entry["title"] or not entry["authors"] or entry["page"] < 1:
            raise ValueError("Missing title, authors, or physical PDF page")
        slot = slots[entry["session"]]
        date.fromisoformat(slot["date"])
        if slot["room"] != "Hall H":
            raise ValueError(f"Unsupported physical board room: {slot['room']}")
        boards[(slot["date"], slot["start"], slot["end"], slot["room"], entry["board"])].append(index)
        if entry["paperId"]:
            papers[(slot["date"], slot["start"], slot["end"], slot["room"], entry["paperId"])].append(index)
    conflicts = []
    for kind, grouped in [("duplicate-board", boards), ("duplicate-paper", papers)]:
        for indices in grouped.values():
            if len(indices) > 1:
                conflicts.append({"kind": kind, "entryIndices": indices})
    return conflicts


def load_catalog(path=ROOT / "data/poster-boards.json"):
    catalog = json.loads(Path(path).read_text())
    conflicts = validate_catalog(catalog)
    for issue in conflicts:
        if any(not catalog["entries"][i].get("conflict") for i in issue["entryIndices"]):
            raise ValueError("Unmarked poster-board source conflict")
        if any(catalog["entries"][i].get("verified") is not False for i in issue["entryIndices"]):
            raise ValueError("Conflicting poster-board assignments must not be verified")
    if any(type(entry.get("verified")) is not bool for entry in catalog["entries"]):
        raise ValueError("Every poster-board entry requires an explicit verification state")
    return catalog


def import_catalog(source_path):
    source_path = Path(source_path)
    digest = hashlib.sha256(source_path.read_bytes()).hexdigest()
    if digest != SOURCE_SHA256:
        raise ValueError("Handbook source changed. Review its identity, metadata, and guarded title aliases before importing.")
    text = subprocess.run(["pdftotext", "-layout", str(source_path), "-"], check=True, capture_output=True, text=True).stdout
    read = lambda name: json.loads((ROOT / "data" / name).read_text())
    papers, publications = read("papers.json")["papers"], read("anthology-catalog.json")
    sessions, entries, issues = extract_boards(text, title_index(papers, publications))
    match_entries(entries, sessions, papers, publications, read("anthology-overrides.json"))
    catalog = {"version": 1, "source": {**SOURCE, "sha256": digest,
                "pageCount": len(text.rstrip("\f").split("\f")), "pageNumbering": "physical PDF pages, one based",
                "extraction": "pdftotext -layout; explicit Board labels only"},
               "sessions": sessions, "entries": entries, "sourceIssues": issues}
    conflicts = validate_catalog(catalog)
    for entry in entries:
        entry["verified"] = True
    for issue in conflicts:
        for index in issue["entryIndices"]:
            entries[index]["conflict"] = True
            entries[index]["verified"] = False
    issues.extend(conflicts)
    return catalog


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=ROOT / "data/poster-boards.json")
    args = parser.parse_args()
    catalog = import_catalog(args.source)
    args.output.write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(json.dumps({"entriesBySession": dict(Counter(e["session"] for e in catalog["entries"])),
                      "matched": sum(e["paperId"] is not None for e in catalog["entries"]),
                      "unmatched": [e for e in catalog["entries"] if e["paperId"] is None],
                      "sourceIssues": catalog["sourceIssues"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
