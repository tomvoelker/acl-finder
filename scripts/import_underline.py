"""Import public Underline paper metadata and match direct presentation links.

Refresh: python3 scripts/import_underline.py --fetch
Recheck the committed catalog: python3 scripts/import_underline.py
"""

import argparse
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime
from html import unescape
import json
from pathlib import Path
import re
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from import_anthology import match_papers, normalize_title

ROOT = Path(__file__).resolve().parents[1]
EVENT_ID = "535"
SOURCE = f"https://underline.io/events/{EVENT_ID}/schedule"
API = "https://app.underline.io/api/v1/thin_lectures"


def title_key(title):
    # Underline renders these TeX angle delimiters as Unicode characters.
    return normalize_title(re.sub(r"\\text[lr]angle\b", "", unescape(title)))


def parse_catalog(pages, updated_at):
    date.fromisoformat(updated_at)
    expected = pages[0]["meta"]["total_count"]
    if len(pages) != pages[0]["meta"]["total_pages"]:
        raise ValueError("Incomplete Underline pagination")
    papers, seen = [], set()
    for number, page in enumerate(pages, 1):
        meta = page["meta"]
        if meta["current_page"] != number or meta["total_count"] != expected:
            raise ValueError("Underline catalog changed during import; retry the snapshot")
        for row in page["data"]:
            attrs = row["attributes"]
            relationships = row["relationships"]
            if row["type"] != "thin_lectures" or str(attrs["event_id"]) != EVENT_ID or relationships["event"]["data"]["id"] != EVENT_ID:
                raise ValueError("Unexpected record outside the EMNLP Underline event")
            if row["id"] in seen:
                raise ValueError(f"Duplicate Underline ID: {row['id']}")
            seen.add(row["id"])
            session = relationships["event_session"]["data"]
            papers.append({"id": row["id"], "title": attrs["title"], "slug": attrs["slug"],
                           "sessionId": session["id"] if session else None, "published": attrs["published"]})
    if not papers or len(papers) != expected:
        raise ValueError("Incomplete Underline catalog")
    return {"updatedAt": updated_at, "source": SOURCE, "papers": sorted(papers, key=lambda p: int(p["id"]))}


def presentation_url(entry):
    if not re.fullmatch(r"[1-9]\d*", entry["id"]) or not re.fullmatch(r"[a-z0-9_-]+", entry["slug"]):
        raise ValueError("Invalid Underline paper ID or slug")
    if type(entry["published"]) is not bool:
        raise ValueError("Invalid Underline publication status")
    session = entry["sessionId"]
    if session is not None and not re.fullmatch(r"[1-9]\d*", session):
        raise ValueError("Invalid Underline session ID")
    # Underline itself does not offer a schedule link until the record is published
    # and assigned to a session. Do not invent links to unpublished records.
    if not entry["published"] or session is None:
        return None
    return f"{SOURCE}/sessions/{session}/lecture/{entry['id']}-{entry['slug']}"


def match_presentations(papers, catalog, publication_titles, overrides):
    if catalog["source"] != SOURCE:
        raise ValueError("Unexpected Underline event")
    by_title, by_id = defaultdict(list), {}
    for entry in catalog["papers"]:
        if entry["id"] in by_id or not title_key(entry["title"]):
            raise ValueError("Duplicate Underline ID or empty title")
        presentation_url(entry)
        by_id[entry["id"]] = entry
        by_title[title_key(entry["title"])].append(entry["id"])
    links, unmatched, unavailable, reviewed, used = {}, [], [], [], set()
    counts = Counter()
    for paper in papers:
        keys = {title_key(paper["title"])}
        if paper["id"] in publication_titles:
            keys.add(title_key(publication_titles[paper["id"]]))
        candidates = {entry_id for key in keys for entry_id in by_title[key]}
        override = overrides.get(paper["id"])
        if override:
            entry = by_id.get(override["underlineId"])
            if not entry or paper["title"] != override["scheduleTitle"] or entry["title"] != override["underlineTitle"]:
                raise ValueError(f"Reviewed titles changed for {paper['id']}; review its Underline match again")
            reviewed.append(paper["id"])
        elif len(candidates) == 1:
            entry = by_id[next(iter(candidates))]
        else:
            unmatched.append({"id": paper["id"], "title": paper["title"],
                              "reason": "Ambiguous title" if candidates else "No verified match"})
            continue
        if entry["id"] in used:
            raise ValueError("Multiple schedule entries matched the same Underline paper")
        used.add(entry["id"])
        url = presentation_url(entry)
        if url:
            links[paper["id"]] = url
            counts[paper["trackCode"]] += 1
        else:
            unavailable.append({"id": paper["id"], "underlineId": entry["id"], "status": paper["status"],
                                "reason": "Not published" if not entry["published"] else "No session assigned"})
    return links, {"updatedAt": catalog["updatedAt"], "source": SOURCE, "catalogEntries": len(by_id),
                   "total": len(papers), "matched": len(used), "linked": len(links),
                   "linkedByTrack": dict(sorted(counts.items())), "reviewedTitleChanges": reviewed,
                   "unmatched": unmatched, "unavailable": unavailable}


def fetch_page(number):
    query = urlencode({"filter[event_id]": EVENT_ID, "filter[scope]": "all", "sort": "id",
                       "page[size]": "500", "page[number]": str(number)})
    request = Request(f"{API}?{query}", headers={"Accept": "application/vnd.api+json", "Content-Type": "application/vnd.api+json"})
    with urlopen(request, timeout=60) as response:
        return json.load(response)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    inputs = parser.add_mutually_exclusive_group()
    inputs.add_argument("--fetch", action="store_true")
    inputs.add_argument("--source-dir", type=Path, help="Read saved underline-api-page-N.json responses")
    parser.add_argument("--updated-at", help="Retrieval date for saved responses")
    args = parser.parse_args()
    read = lambda name: json.loads((ROOT / "data" / name).read_text())
    if args.fetch:
        if args.updated_at:
            parser.error("--fetch records today's retrieval date")
        first = fetch_page(1)
        with ThreadPoolExecutor(max_workers=3) as pool:
            pages = [first, *pool.map(fetch_page, range(2, first["meta"]["total_pages"] + 1))]
        catalog = parse_catalog(pages, datetime.now(ZoneInfo("Europe/Budapest")).date().isoformat())
    elif args.source_dir:
        if not args.updated_at:
            parser.error("--source-dir requires --updated-at")
        first = json.loads((args.source_dir / "underline-api-page-1.json").read_text())
        pages = [first, *(json.loads((args.source_dir / f"underline-api-page-{n}.json").read_text())
                          for n in range(2, first["meta"]["total_pages"] + 1))]
        catalog = parse_catalog(pages, args.updated_at)
    else:
        catalog = read("underline-catalog.json")
    papers, anthology = read("papers.json")["papers"], read("anthology-catalog.json")
    anthology_links, _ = match_papers(papers, anthology, read("anthology-overrides.json"))
    publications = {p["id"]: p for p in anthology["papers"]}
    titles = {pid: publications[aid]["title"] for pid, aid in anthology_links.items()}
    links, audit = match_presentations(papers, catalog, titles, read("underline-overrides.json"))
    (ROOT / "data/underline-catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + "\n")
    (ROOT / "data/underline-audit.json").write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n")
    print(f"Linked {len(links):,} of {len(papers):,} schedule entries; {len(audit['unmatched'])} unmatched; {len(audit['unavailable'])} without a published session page.")


if __name__ == "__main__":
    main()
