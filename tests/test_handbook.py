"""Protect literal board attribution, source provenance, and title matching."""

from copy import deepcopy
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from import_anthology import normalize_title
from import_handbook import (extract_boards, import_catalog, load_catalog,
                             match_entries, validate_catalog)


HEADER = "Main Conference, Day 1, Sunday, October 25, 2026\n"
HEADING = "Poster Session A, Day 1, 11:00–12:30\nPoster Session A\n11:00–12:30 (Hall H)\n"


def fixture(text, *titles):
    return extract_boards(HEADER + HEADING + text, {normalize_title(t) for t in titles})


def paper(paper_id="1-MAIN", title="A paper", **changes):
    return {"id": paper_id, "title": title, "trackCode": "MAIN", "status": "scheduled",
            "presentation": "Poster", "date": "2026-10-25", "start": "11:00", "end": "12:30",
            "room": "Hall H", **changes}


def slot(session="A", **changes):
    return {"id": session, "label": f"Poster Session {session}", "date": "2026-10-25",
            "start": "11:00", "end": "12:30", "room": "Hall H", **changes}


def entry(session="A", board=1, title="A paper", paper_id=None):
    return {"session": session, "board": board, "title": title, "authors": "Author One and Author Two",
            "page": 1, "boardPage": 1, "paperId": paper_id, "verified": True}


PUBLICATIONS = {"papers": [], "sources": [], "updatedAt": "2026-10-24"}


class HandbookTests(unittest.TestCase):
    def test_explicit_board_not_list_order_with_wrapped_title(self):
        sessions, entries, issues = fixture(
            "Long Title: Local Pri-\nvacy\nAuthor One and Author Two             Board 158\n\n"
            "Second title\nThird Author                           Board 160\n",
            "Long Title: Local Privacy", "Second title")
        self.assertEqual([e["board"] for e in entries], [158, 160])
        self.assertEqual(entries[0]["title"], "Long Title: Local Privacy")
        self.assertEqual(entries[0]["authors"], "Author One and Author Two")
        self.assertEqual(sessions[0]["date"], "2026-10-25")
        self.assertEqual(issues, [])

    def test_title_and_author_cross_page_break_without_off_by_one(self):
        _, entries, _ = fixture(
            "First paper\nFirst Author          Board 1\n\nA paper across pages\n 35\n\f" + HEADER +
            "Second Author and Third Author     Board 4\nNext paper\nFourth Author\nBoard 5\n",
            "First paper", "A paper across pages", "Next paper")
        self.assertEqual([(e["board"], e["page"], e["boardPage"]) for e in entries], [(1, 1, 1), (4, 1, 2), (5, 2, 2)])
        self.assertEqual(entries[1]["title"], "A paper across pages")
        self.assertEqual(entries[2]["authors"], "Fourth Author")

    def test_unlabelled_paper_never_inherits_next_board(self):
        _, entries, issues = fixture(
            "Missing label paper\nFirst Author\n\nCorrect paper\nSecond Author      Board 9\n",
            "Missing label paper", "Correct paper")
        self.assertEqual([(e["title"], e["board"]) for e in entries], [("Correct paper", 9)])
        self.assertEqual(issues[0]["title"], "Missing label paper")
        self.assertEqual(issues[0]["kind"], "missing-board-label")

    def test_unlabelled_final_paper_is_reported_at_section_boundary(self):
        _, entries, issues = fixture(
            "Correct paper\nSecond Author      Board 9\nMissing label paper\nFirst Author\n"
            "Main Conference, Day 1, 16:00–17:30\nAn oral paper\nOral Author\n",
            "Missing label paper", "Correct paper", "An oral paper")
        self.assertEqual(len(entries), 1)
        self.assertEqual([i["title"] for i in issues], ["Missing label paper"])

    def test_abstract_does_not_become_the_next_title(self):
        _, entries, issues = fixture(
            "First paper\nAuthor One      Board 1\nA long abstract with arbitrary words.\n"
            "It can continue across many lines.\nSecond paper\nAuthor Two       Board 2\n",
            "First paper", "Second paper")
        self.assertEqual(entries[1]["title"], "Second paper")
        self.assertEqual(entries[1]["authors"], "Author Two")
        self.assertEqual(issues, [])

    def test_unknown_or_malformed_record_fails_instead_of_guessing(self):
        for text, message in [("Unknown title\nAn Author     Board 4\n", "Unverified title"),
                              ("A paper\nAn Author    Board ??\n", "Malformed board")]:
            with self.subTest(text=text), self.assertRaisesRegex(ValueError, message):
                fixture(text, "A paper")

    def test_cannot_import_another_pdf_with_original_source_metadata(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / "other.pdf"
            source.write_bytes(b"another source")
            with self.assertRaisesRegex(ValueError, "Handbook source changed"):
                import_catalog(source)

    def test_industry_heading_uses_source_date_slot_and_room(self):
        text = (HEADER + HEADING + "A paper\nAuthor      Board 158\n" +
                "Industry Track, Session 6: Poster Session, Day 1, 11:00–12:30\n"
                "Industry Track Session 6: Poster Session\n11:00–12:30 (Hall H)\n"
                "Another paper\nOther Author          Board 1\n")
        sessions, entries, _ = extract_boards(text, {normalize_title(t) for t in ("A paper", "Another paper")})
        self.assertEqual(sessions[1], {**slot("Industry6"), "label": "Industry Track Session 6: Poster Session", "page": 1})
        self.assertEqual([e["session"] for e in entries], ["A", "Industry6"])

    def test_same_title_collision_resolves_only_inside_explicit_session(self):
        entries = [entry()]
        papers = [paper(), paper("2-MAIN", date="2026-10-26")]
        match_entries(entries, [slot()], papers, PUBLICATIONS, {})
        self.assertEqual(entries[0]["paperId"], "1-MAIN")
        self.assertEqual(entries[0]["matchMethod"], "exact-title-and-session")
        entries = [entry()]
        match_entries(entries, [slot()], [paper(), paper("2-MAIN")], PUBLICATIONS, {})
        self.assertIsNone(entries[0]["paperId"])
        self.assertEqual(entries[0]["matchIssue"], "ambiguous-title")

    def test_unique_title_preserves_schedule_discrepancy(self):
        entries = [entry()]
        schedule = [paper(date="2026-10-26", room="Zoom", presentation="Virtual")]
        before = deepcopy(schedule)
        match_entries(entries, [slot()], schedule, PUBLICATIONS, {})
        self.assertEqual(entries[0]["paperId"], "1-MAIN")
        self.assertEqual(entries[0]["scheduleDifferences"]["room"], {"schedule": "Zoom", "handbook": "Hall H"})
        self.assertEqual(schedule, before)

    def test_near_match_stays_unmatched(self):
        entries = [entry(title="A renamed paper")]
        match_entries(entries, [slot()], [paper()], PUBLICATIONS, {})
        self.assertIsNone(entries[0]["paperId"])

    def test_exact_publication_title_can_bridge_a_reviewed_schedule_title(self):
        entries = [entry(title="The published title")]
        publications = {**PUBLICATIONS, "papers": [
            {"id": "2026.emnlp-main.1", "title": "The published title", "authors": ["Author"]}]}
        overrides = {"1-MAIN": {"anthologyId": "2026.emnlp-main.1", "scheduleTitle": "A paper",
                                  "anthologyTitle": "The published title"}}
        match_entries(entries, [slot()], [paper()], publications, overrides)
        self.assertEqual(entries[0]["paperId"], "1-MAIN")

    def test_reviewed_pdf_glyph_omission_is_guarded_against_title_changes(self):
        source_title = "Cross-Version -Transfer of QLoRA-Trained Adapters"
        schedule_title = r"Cross-Version $\Delta$-Transfer of QLoRA-Trained Adapters"
        entries = [entry("C", 206, source_title)]
        match_entries(entries, [slot("C")], [paper("3907-MAIN", schedule_title)], PUBLICATIONS, {})
        self.assertEqual(entries[0]["paperId"], "3907-MAIN")
        self.assertEqual(entries[0]["matchMethod"], "reviewed-source-title")
        with self.assertRaisesRegex(ValueError, "Reviewed handbook title changed"):
            match_entries([entry("C", 206, source_title)], [slot("C")],
                          [paper("3907-MAIN", "A different title")], PUBLICATIONS, {})

    def test_duplicate_physical_board_detected_across_session_labels(self):
        data = {"version": 1, "sessions": [slot(), slot("Industry6")],
                "entries": [entry(paper_id="1-MAIN"), entry("Industry6", paper_id="2-IND")]}
        self.assertEqual(validate_catalog(data), [{"kind": "duplicate-board", "entryIndices": [0, 1]}])
        data["sessions"][1]["date"] = "2026-10-26"
        self.assertEqual(validate_catalog(data), [])

    def test_duplicate_paper_and_out_of_bounds_board_detected(self):
        data = {"version": 1, "sessions": [slot()],
                "entries": [entry(paper_id="1-MAIN"), entry(board=2, paper_id="1-MAIN")]}
        self.assertEqual(validate_catalog(data)[0]["kind"], "duplicate-paper")
        data["entries"][1]["board"] = 425
        with self.assertRaisesRegex(ValueError, "Invalid board"):
            validate_catalog(data)

    def test_conflicting_entries_require_explicit_unverified_state(self):
        data = {"version": 1, "sessions": [slot()], "entries": [entry(), entry()]}
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / "catalog.json"
            target.write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError, "Unmarked"):
                load_catalog(target)
            for e in data["entries"]:
                e["conflict"] = True
            target.write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError, "must not be verified"):
                load_catalog(target)
            for e in data["entries"]:
                e["verified"] = False
            target.write_text(json.dumps(data))
            self.assertEqual(load_catalog(target), data)



if __name__ == "__main__":
    unittest.main()
