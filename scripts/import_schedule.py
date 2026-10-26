#!/usr/bin/env python3
"""Import the EMNLP 2026 author-presentation sheet without inventing missing data.

Refresh: python3 scripts/import_schedule.py --fetch
Reproduce the committed snapshot:
  python3 scripts/import_schedule.py --source data/source.csv --timeline data/timeline.csv --updated-at 2026-10-26

The source lists presenters, not complete author lists, and contains no abstracts.
Only the Python standard library is required.
"""

import argparse
from collections import Counter, defaultdict
import csv
from datetime import date, datetime, timezone
import io
import json
from pathlib import Path
import re
from urllib.request import urlopen
from zoneinfo import ZoneInfo

from poster_catalog import create_catalog, TIMELINE_TAB_ID

ROOT = Path(__file__).resolve().parents[1]
SHEET_ID = "1aXGTy_7Xeh-OXIs3iJSbDpUsZ6YhbfA76b17kBZH0Yk"
TAB_ID = "943432490"
SOURCE_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit?gid={TAB_ID}#gid={TAB_ID}"
CSV_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={TAB_ID}"
TIMELINE_CSV_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={TIMELINE_TAB_ID}"
TIME_ZONE = "Europe/Budapest"
HEADER = [
    "Paper ID #-track)", "Title", "Assigned Pres Type", "Presentation Mode",
    "Presenters Name", "Room Location", "Session", "Sub-session", "Session Date",
    "Session Start Time", "Session End Time", "Board #",
]
TRACKS = {
    "MAIN": "Main conference", "FIND": "Findings", "IND": "Industry",
    "DEMO": "Systems demonstrations", "TACL": "TACL", "CL": "Computational Linguistics",
}
PRESENTATIONS = {
    "oral": "Oral", "poster": "Poster", "demo": "Demo", "virtual pres": "Virtual",
    "virtual pres-demo": "Virtual demo", "not presenting": "Not presenting",
    "withdrawn": "Withdrawn", "desk reject": "Desk rejected",
}
MODES = {
    "in-person": "In person", "virtual": "Virtual", "not presenting": "Not presenting",
    "withdrawn": "Withdrawn", "desk reject": "Desk rejected",
}
UNKNOWN = {"", "na", "n/a", "#n/a", "none", "null", "tbd", "tbc"}
TIME_RE = re.compile(r"\d{2}:\d{2}")
RANGE_RE = re.compile(r"(\d{2}:\d{2})\s*[-–]\s*(\d{2}:\d{2})\s+CET", re.IGNORECASE)


def clean(value):
    """Normalize blank/placeholder cells; preserve spelling of substantive values."""
    if value is None:
        return None
    value = str(value).strip()
    return None if value.casefold() in UNKNOWN else value


def enum(value, values, field, row):
    value = clean(value)
    if value is None:
        return None
    if value.casefold() not in values:
        raise ValueError(f"Row {row}: unknown {field} {value!r}; update the explicit mapping")
    return values[value.casefold()]


def parse_time(value):
    value = clean(value)
    if value is None:
        return None
    if not TIME_RE.fullmatch(value):
        raise ValueError(f"Invalid time {value!r}; expected HH:MM")
    datetime.strptime(value, "%H:%M")
    return value


def parse_schedule(date_value, start_value, end_value):
    """Keep local wall times; split the source's explicit CET virtual ranges."""
    day = clean(date_value)
    if day is not None:
        if date.fromisoformat(day).isoformat() != day:
            raise ValueError(f"Invalid ISO date {day!r}")
    start_value = clean(start_value)
    end_value = clean(end_value)
    interval = RANGE_RE.fullmatch(start_value) if start_value else None
    if interval:
        start, end = (parse_time(value) for value in interval.groups())
        if end_value is not None and parse_time(end_value) != end:
            # Both ends are explicit source values; neither can be preferred safely.
            end = None
        if day and datetime.fromisoformat(f"{day}T{start}").replace(tzinfo=ZoneInfo(TIME_ZONE)).tzname() != "CET":
            raise ValueError(f"Explicit CET time on {day} differs from Budapest local time")
    else:
        start, end = parse_time(start_value), parse_time(end_value)
    if start and end and end <= start:
        raise ValueError(f"End time {end} must follow start time {start}")
    return day, start, end


def parse_board(value, row):
    value = clean(value)
    if value is None:
        return None
    if re.fullmatch(r"[1-9]\d*", value) and 1 <= int(value) <= 424:
        return value
    if re.fullmatch(r"D(?:[1-9]|10)", value):
        return value
    raise ValueError(f"Row {row}: invalid Board # {value!r}; expected 1–424 or demo position D1–D10")


def normalize_row(row, source_row):
    if len(row) > len(HEADER):
        raise ValueError(f"Row {source_row}: expected at most {len(HEADER)} cells, got {len(row)}")
    cells = list(row) + [None] * (len(HEADER) - len(row))
    paper_id, title = clean(cells[0]), clean(cells[1])
    if not paper_id or not title:
        raise ValueError(f"Row {source_row}: paper ID and title are required")
    track_code = paper_id.rsplit("-", 1)[-1]
    if track_code not in TRACKS:
        raise ValueError(f"Row {source_row}: unknown track in {paper_id!r}")
    presentation = enum(cells[2], PRESENTATIONS, "presentation", source_row)
    mode = enum(cells[3], MODES, "mode", source_row)
    try:
        day, start, end = parse_schedule(*cells[8:11])
    except ValueError as error:
        raise ValueError(f"Row {source_row} ({paper_id}): {error}") from error
    if "Desk rejected" in (presentation, mode):
        status = "desk rejected"
    elif "Withdrawn" in (presentation, mode):
        status = "withdrawn"
    elif "Not presenting" in (presentation, mode):
        status = "not presenting"
    else:
        status = "scheduled" if all((day, start, end)) else "unscheduled"
    room = clean(cells[5])
    if room and room.casefold() == "zoom":
        room = "Zoom"
    topic = clean(cells[7])
    if topic and topic.casefold().startswith("virtual presentations "):
        topic = "Virtual Presentations " + topic.split()[-1]
    interval = RANGE_RE.fullmatch(clean(cells[9])) if clean(cells[9]) else None
    conflict = bool(interval and clean(cells[10]) and clean(cells[10]) != interval.group(2))
    presenter = clean(cells[4])
    presenter_repeats_title = presenter == title
    return {
        "id": paper_id, "title": title, "track": TRACKS[track_code], "trackCode": track_code,
        "presentation": presentation, "mode": mode, "presenter": None if presenter_repeats_title else presenter,
        "presenterNote": "The source repeats the paper title in its presenter field." if presenter_repeats_title else None,
        "room": room, "session": clean(cells[6]), "topic": topic,
        "date": day, "start": start, "end": end, "timeZone": TIME_ZONE,
        "status": status, "sourceRow": source_row,
        "scheduleNote": f"The source lists {clean(cells[9])} and a conflicting end time of {clean(cells[10])}. Check the source sheet." if conflict else None,
        "board": parse_board(cells[11], source_row),
    }


def build_dataset(rows, updated_at):
    """Reject ambiguous structural changes and keep every source paper, in source order."""
    date.fromisoformat(updated_at)
    rows = list(rows)
    if not rows or [" ".join(str(cell).split()) for cell in rows[0]] != HEADER:
        raise ValueError("Unexpected CSV header; refusing to import a different sheet or shifted columns")
    papers, seen = [], {}
    for source_row, row in enumerate(rows[1:], start=2):
        paper = normalize_row(row, source_row)
        if paper["id"] in seen:
            raise ValueError(f"Duplicate ID {paper['id']} at rows {seen[paper['id']]} and {source_row}; resolve the source conflict explicitly")
        seen[paper["id"]] = source_row
        papers.append(paper)
    if not papers:
        raise ValueError("The source contains no papers")
    dataset = {
        "conference": {
            "name": "EMNLP 2026", "location": "Budapest, Hungary", "timezone": TIME_ZONE,
            "startDate": "2026-10-25", "endDate": "2026-10-27",
            "sourceUrl": SOURCE_URL, "sourceSheet": "Author Presentations",
            "updatedAt": updated_at,
            "timeNote": "All times are Budapest local time (CET, UTC+1) during the main conference.",
            "dataNote": "The source lists presenters, not complete author lists. It does not include abstracts. Missing assignments remain unknown.",
        },
        "papers": papers,
    }
    return dataset, audit_papers(papers, updated_at)


def audit_papers(papers, updated_at):
    """Expose source gaps and uncommon assignments without silently repairing them."""
    issues = []
    for paper in papers:
        missing = [key for key in ("date", "start", "end", "session", "room") if paper[key] is None]
        if paper["status"] not in ("not presenting", "withdrawn", "desk rejected") and missing:
            issues.append({"id": paper["id"], "sourceRow": paper["sourceRow"], "type": "missing assignment", "fields": missing})
        if paper["presenterNote"]:
            issues.append({"id": paper["id"], "sourceRow": paper["sourceRow"], "type": "presenter repeats title", "note": paper["presenterNote"]})
        if paper["status"] in ("not presenting", "withdrawn", "desk rejected") and any(paper[key] for key in ("date", "start", "end", "session", "room")):
            issues.append({"id": paper["id"], "sourceRow": paper["sourceRow"], "type": "inactive paper retains assignment", "status": paper["status"]})
        if paper["scheduleNote"]:
            issues.append({"id": paper["id"], "sourceRow": paper["sourceRow"], "type": "conflicting times", "note": paper["scheduleNote"]})
        if paper["presentation"] is None:
            issues.append({"id": paper["id"], "sourceRow": paper["sourceRow"], "type": "presentation unconfirmed"})
        if paper["room"] == "Hall":
            issues.append({"id": paper["id"], "sourceRow": paper["sourceRow"], "type": "incomplete room name", "value": "Hall"})
    groups = defaultdict(list)
    for paper in papers:
        if paper["status"] in ("scheduled", "unscheduled") and paper["session"] and paper["date"]:
            groups[paper["session"]].append(paper)
    for session, group in groups.items():
        common = Counter((paper["date"], paper["start"], paper["end"]) for paper in group).most_common(1)[0][0]
        for paper in group:
            if (paper["date"], paper["start"], paper["end"]) != common:
                issues.append({"id": paper["id"], "sourceRow": paper["sourceRow"], "type": "unusual session assignment", "session": session, "sourceDate": paper["date"], "sourceTime": [paper["start"], paper["end"]], "usualDate": common[0], "usualTime": list(common[1:])})
    return {
        "updatedAt": updated_at, "sourceUrl": SOURCE_URL,
        "sourceRows": len(papers), "uniqueIds": len({paper["id"] for paper in papers}),
        "countsByStatus": dict(sorted(Counter(paper["status"] for paper in papers).items())),
        "countsByTrack": dict(sorted(Counter(paper["track"] for paper in papers).items())),
        "missingPresenters": sum(paper["presenter"] is None for paper in papers),
        "boardAssignments": {"posters": sum(bool(paper["board"] and paper["board"].isdigit()) for paper in papers),
                             "demos": sum(bool(paper["board"] and paper["board"].startswith("D")) for paper in papers)},
        "issueCounts": dict(sorted(Counter(issue["type"] for issue in issues).items())),
        "note": "Source values are retained. An unusual assignment may be intentional; no times or rooms are inferred from neighboring rows.",
        "issues": sorted(issues, key=lambda issue: (issue["sourceRow"], issue["type"])),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    inputs = parser.add_mutually_exclusive_group(required=True)
    inputs.add_argument("--fetch", action="store_true", help="Download the current public author-presentation CSV")
    inputs.add_argument("--source", type=Path, help="Read a local source CSV")
    parser.add_argument("--timeline", type=Path, help="Local Conference Timeline CSV (required with --source)")
    parser.add_argument("--updated-at", help="Source retrieval date, YYYY-MM-DD (required for local CSV)")
    args = parser.parse_args()
    if args.fetch:
        if args.updated_at:
            parser.error("--fetch records today's retrieval date; omit --updated-at")
        with urlopen(CSV_URL, timeout=60) as response:
            source_text = response.read().decode("utf-8-sig")
        with urlopen(TIMELINE_CSV_URL, timeout=60) as response:
            timeline_text = response.read().decode("utf-8-sig")
        updated_at = datetime.now(timezone.utc).date().isoformat()
    else:
        if not args.updated_at:
            parser.error("--source requires --updated-at with the date that source was retrieved")
        if not args.timeline:
            parser.error("--source requires --timeline with the Conference Timeline snapshot")
        with args.source.open(encoding="utf-8-sig", newline="") as source:
            source_text = source.read()
        with args.timeline.open(encoding="utf-8-sig", newline="") as source:
            timeline_text = source.read()
        updated_at = args.updated_at
    rows = list(csv.reader(io.StringIO(source_text)))
    dataset, audit = build_dataset(rows, updated_at)
    catalog = create_catalog(dataset, csv.reader(io.StringIO(timeline_text)), source_text, timeline_text)
    audit["boardIssues"] = catalog["sourceIssues"]
    data_dir = ROOT / "data"
    data_dir.mkdir(exist_ok=True)
    # Validate everything before replacing any committed data.
    (data_dir / "source.csv").write_text(source_text, encoding="utf-8")
    (data_dir / "timeline.csv").write_text(timeline_text, encoding="utf-8")
    (data_dir / "papers.json").write_text(json.dumps(dataset, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    (data_dir / "audit.json").write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (data_dir / "poster-boards.json").write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Imported {len(dataset['papers']):,} papers from source retrieved {updated_at}.")
    print(json.dumps({"statuses": audit["countsByStatus"], "sourceIssues": audit["issueCounts"]}, indent=2))


if __name__ == "__main__":
    main()
