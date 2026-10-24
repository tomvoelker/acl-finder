"""Fetch ACL Anthology metadata and match it to the presentation schedule.

Refresh: python3 scripts/import_anthology.py --fetch
Recheck the schedule against the committed catalog: python3 scripts/import_anthology.py
"""

import argparse
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import unicodedata
from urllib.request import urlopen
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
VOLUMES = {
    "MAIN": ["2026.emnlp-main"], "FIND": ["2026.findings-emnlp"],
    "IND": ["2026.emnlp-industry"], "DEMO": ["2026.emnlp-demos"],
    "TACL": ["2025.tacl-1", "2026.tacl-1"],
    "CL": [f"2025.cl-{issue}" for issue in range(1, 5)] + ["2026.cl-1", "2026.cl-2"],
}
VOLUME_TRACKS = {volume: track for track, volumes in VOLUMES.items() for volume in volumes}
SOURCES = {"emnlp-2026": "https://aclanthology.org/events/emnlp-2026/"}
SOURCES.update({volume: f"https://aclanthology.org/volumes/{volume}/" for track in ("TACL", "CL") for volume in VOLUMES[track]})
PAPER_ID = re.compile(r"\d{4}\.[a-z0-9-]+\.[1-9]\d*")


class AnthologyParser(HTMLParser):
    """Read paper titles and adjacent author links, ignoring abstracts and front matter."""

    def __init__(self):
        super().__init__()
        self.anchor = None
        self.current = None
        self.papers = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self.anchor = {"attrs": dict(attrs), "text": []}

    def handle_data(self, text):
        if self.anchor is not None:
            self.anchor["text"].append(text)

    def handle_endtag(self, tag):
        if tag != "a" or self.anchor is None:
            return
        anchor, self.anchor = self.anchor, None
        href = anchor["attrs"].get("href", "")
        label = "".join(anchor["text"]).strip()
        if "align-middle" in anchor["attrs"].get("class", "").split() and re.fullmatch(r"/\d{4}\.[a-z0-9-]+\.\d+/", href):
            self.current = None
            paper_id = href.strip("/")
            if PAPER_ID.fullmatch(paper_id) and paper_id.rsplit(".", 1)[0] in VOLUME_TRACKS:
                self.current = {"id": paper_id, "title": label, "authors": []}
                self.papers.append(self.current)
        elif href.startswith("/people/") and self.current is not None:
            self.current["authors"].append(label)


def normalize_title(title):
    # The sheet uses TeX where the Anthology renders Unicode or plain text.
    for command, symbol in [("Delta", "Δ"), ("lambda", "λ"), ("sigma", "σ")]:
        title = re.sub(r"\\" + command + r"\b", symbol, title)
    title = re.sub(r"\\(?:texttt|textit|textbf|text|mathit|mathbf|mathbb|mathrm|textrm|tt)\b", "", title)
    return "".join(c for c in unicodedata.normalize("NFKD", title).casefold() if c.isalnum())


def match_papers(papers, catalog, overrides):
    by_title = defaultdict(list)
    by_id = {}
    for entry in catalog["papers"]:
        paper_id = entry["id"]
        if not PAPER_ID.fullmatch(paper_id) or paper_id in by_id:
            raise ValueError(f"Invalid or duplicate Anthology ID: {paper_id}")
        track = VOLUME_TRACKS[paper_id.rsplit(".", 1)[0]]
        by_id[paper_id] = entry
        by_title[(track, normalize_title(entry["title"]))].append(entry)
    links, unmatched, reviewed, counts = {}, [], [], Counter()
    for paper in papers:
        candidates = by_title[(paper["trackCode"], normalize_title(paper["title"]))]
        override = overrides.get(paper["id"])
        if override:
            entry = by_id.get(override["anthologyId"])
            if not entry or paper["title"] != override["scheduleTitle"] or entry["title"] != override["anthologyTitle"]:
                raise ValueError(f"Reviewed titles changed for {paper['id']}; review its Anthology match again")
            if VOLUME_TRACKS[entry["id"].rsplit(".", 1)[0]] != paper["trackCode"]:
                raise ValueError(f"Track mismatch for reviewed paper {paper['id']}")
            reviewed.append(paper["id"])
        elif len(candidates) == 1:
            entry = candidates[0]
        else:
            unmatched.append({"id": paper["id"], "title": paper["title"], "status": paper["status"],
                              "reason": "Ambiguous title" if candidates else "No verified match"})
            continue
        links[paper["id"]] = entry["id"]
        counts[paper["trackCode"]] += 1
    if len(set(links.values())) != len(links):
        raise ValueError("Multiple schedule entries matched the same Anthology paper; review the duplicates")
    return links, {
        "updatedAt": catalog["updatedAt"], "sources": catalog["sources"],
        "matched": len(links), "total": len(papers), "matchedByTrack": dict(sorted(counts.items())),
        "reviewedTitleChanges": reviewed, "unmatched": unmatched,
    }


def parse_catalog(pages, updated_at):
    date.fromisoformat(updated_at)
    papers = []
    for name, html in pages.items():
        parser = AnthologyParser()
        parser.feed(html)
        if not parser.papers:
            raise ValueError(f"No paper records found in {name}; the Anthology markup may have changed")
        papers.extend(parser.papers)
    return {"updatedAt": updated_at, "sources": list(SOURCES.values()), "papers": papers}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    inputs = parser.add_mutually_exclusive_group()
    inputs.add_argument("--fetch", action="store_true")
    inputs.add_argument("--source-dir", type=Path, help="Read saved source HTML files")
    parser.add_argument("--updated-at", help="Retrieval date for saved HTML")
    args = parser.parse_args()
    catalog_path = ROOT / "data/anthology-catalog.json"
    if args.fetch:
        if args.updated_at:
            parser.error("--fetch records today's retrieval date")

        def fetch(item):
            name, url = item
            with urlopen(url, timeout=60) as response:
                return name, response.read().decode("utf-8")

        with ThreadPoolExecutor(max_workers=4) as executor:
            pages = dict(executor.map(fetch, SOURCES.items()))
        catalog = parse_catalog(pages, datetime.now(ZoneInfo("Europe/Budapest")).date().isoformat())
    elif args.source_dir:
        if not args.updated_at:
            parser.error("--source-dir requires --updated-at")
        catalog = parse_catalog({name: (args.source_dir / f"{name}.html").read_text() for name in SOURCES}, args.updated_at)
    else:
        catalog = json.loads(catalog_path.read_text())
    papers = json.loads((ROOT / "data/papers.json").read_text())["papers"]
    overrides = json.loads((ROOT / "data/anthology-overrides.json").read_text())
    links, audit = match_papers(papers, catalog, overrides)
    # Validate matches before replacing the committed metadata.
    catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + "\n")
    (ROOT / "data/anthology-audit.json").write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n")
    print(f"Matched {len(links):,} of {len(papers):,} schedule entries; {len(audit['unmatched'])} have no verified link.")


if __name__ == "__main__":
    main()
