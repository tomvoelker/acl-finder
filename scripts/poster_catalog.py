"""Poster locations from the official schedule's Board # column and timeline."""

from collections import defaultdict
from datetime import datetime
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
TIMELINE_TAB_ID = "1321480317"
INACTIVE = {"not presenting", "withdrawn", "desk rejected"}


def timeline_sessions(rows):
    """Read explicitly labelled poster slots, without inferring from nearby papers."""
    sessions, day = {}, None
    for row_number, row in enumerate(rows, 1):
        cells = list(row) + [""] * max(0, 4 - len(row))
        heading = cells[0].strip()
        if re.fullmatch(r"\w+, October \d{1,2}, 2026", heading):
            day = datetime.strptime(heading, "%A, %B %d, %Y").date().isoformat()
        match = re.search(r"\bOrals?/Posters? ([A-G])\b", cells[3])
        if not match:
            continue
        sid = match[1]
        if not day or sid in sessions:
            raise ValueError(f"Timeline row {row_number}: missing date or duplicate poster session {sid}")
        start, end = [datetime.strptime(value.strip(), "%H:%M").strftime("%H:%M") for value in cells[1:3]]
        if start >= end:
            raise ValueError(f"Timeline row {row_number}: invalid poster interval")
        sessions[sid] = {"id": sid, "label": f"Poster Session {sid}", "date": day,
                         "start": start, "end": end, "room": "Hall H", "sourceRow": row_number}
        if sid == "D":
            sessions[sid]["aliases"] = ["Industry6"]
    if set(sessions) != set("ABCDEFG"):
        raise ValueError("Conference Timeline must explicitly list poster sessions A–G")
    return [sessions[sid] for sid in sorted(sessions)]


def create_catalog(dataset, timeline_rows, source_text, timeline_text):
    sessions = timeline_sessions(timeline_rows)
    slots = {slot["id"]: slot for slot in sessions}
    entries, issues, grouped = [], [], defaultdict(list)
    for paper in dataset["papers"]:
        board = paper.get("board")
        demo = isinstance(board, str) and re.fullmatch(r"D(?:[1-9]|1[0-2])", board)
        if board is None or not (board.isdigit() or demo):
            continue
        session_pattern = r"Demo Session ([A-G])" if demo else r"Poster(?: Session)? ([A-G])"
        match = re.fullmatch(session_pattern, paper.get("topic") or "", re.IGNORECASE)
        if not match:
            issues.append({"kind": "unconfirmed-poster-session", "paperId": paper["id"], "sourceRow": paper["sourceRow"]})
            continue
        sid = match[1].upper()
        slot = slots[sid]
        entry = {"session": sid, "board": board if demo else int(board), "paperId": paper["id"], "title": paper["title"],
                 "authors": [], "sourceRow": paper["sourceRow"], "verified": True}
        problems = []
        if paper["status"] in INACTIVE:
            problems.append("The schedule marks this paper as inactive.")
        if paper["presentation"] not in (("Demo",) if demo else ("Poster", None)):
            problems.append(f"The schedule does not mark this entry as a {'demo' if demo else 'poster'}.")
        differences = {key: {"schedule": paper[key], "timeline": slot[key]}
                       for key in ("date", "start", "end") if paper[key] != slot[key]}
        if differences or paper.get("scheduleNote"):
            problems.append("The schedule row's date or time differs from the Conference Timeline. Check the source before attending.")
            entry["scheduleDifferences"] = differences
        if paper["room"] != "Hall H":
            problems.append("The schedule row does not confirm Hall H for this board.")
        if problems:
            entry.update(verified=False, issue=" ".join(problems))
            issues.append({"kind": "unconfirmed-assignment", "paperId": paper["id"], "sourceRow": paper["sourceRow"], "note": entry["issue"]})
        entries.append(entry)
        grouped[(sid, entry["board"])].append(entry)
    for (sid, board), occupants in grouped.items():
        if len(occupants) > 1:
            note = f"The schedule assigns board {board} to more than one paper in Poster Session {sid}. Its location is unconfirmed."
            for entry in occupants:
                entry.update(verified=False, conflict=True, issue=" ".join(filter(None, [entry.get("issue"), note])))
            issues.append({"kind": "duplicate-board", "session": sid, "board": board,
                           "paperIds": [entry["paperId"] for entry in occupants]})
    source_url = dataset["conference"]["sourceUrl"]
    catalog = {"version": 2, "source": {"url": source_url, "sheet": "Author Presentations ", "column": "L",
                "updatedAt": dataset["conference"]["updatedAt"], "sha256": hashlib.sha256(source_text.encode()).hexdigest(),
                "timelineUrl": re.sub(r"gid=\d+", f"gid={TIMELINE_TAB_ID}", source_url),
                "timelineSHA256": hashlib.sha256(timeline_text.encode()).hexdigest()},
               "sessions": sessions, "entries": entries, "sourceIssues": issues}
    validate_catalog(catalog)
    return catalog


def validate_catalog(catalog):
    if catalog.get("version") != 2:
        raise ValueError("Expected a version 2 schedule board catalog")
    sessions = {slot["id"]: slot for slot in catalog["sessions"]}
    if not sessions or len(sessions) != len(catalog["sessions"]):
        raise ValueError("Missing or duplicate poster session IDs")
    seen_papers, positions = set(), defaultdict(list)
    for entry in catalog["entries"]:
        board = entry["board"]
        valid_board = (type(board) is int and 1 <= board <= 424) or (isinstance(board, str) and re.fullmatch(r"D(?:[1-9]|1[0-2])", board))
        if entry["session"] not in sessions or not valid_board:
            raise ValueError("Invalid board or poster session")
        if not entry["title"] or not isinstance(entry["paperId"], str) or entry["paperId"] in seen_papers:
            raise ValueError("Missing title or duplicate poster paper ID")
        seen_papers.add(entry["paperId"])
        if type(entry.get("sourceRow")) is not int or entry["sourceRow"] < 2 or type(entry.get("verified")) is not bool:
            raise ValueError("Every board needs a source row and explicit verification state")
        slot = sessions[entry["session"]]
        positions[tuple(slot[key] for key in ("date", "start", "end", "room")) + (entry["board"],)].append(entry)
    for occupants in positions.values():
        if len(occupants) > 1 and any(entry["verified"] or not entry.get("conflict") for entry in occupants):
            raise ValueError("Conflicting physical board assignments must be explicitly unverified")
    return catalog


def load_catalog(path=ROOT / "data/poster-boards.json"):
    return validate_catalog(json.loads(Path(path).read_text()))
