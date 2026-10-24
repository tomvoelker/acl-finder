"""Checks for source fidelity, ambiguous assignments, and reproducible imports."""

from collections import Counter
import csv
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from import_schedule import HEADER, build_dataset, clean, normalize_row, parse_schedule


class ParsingTests(unittest.TestCase):
    def test_explicit_cet_range(self):
        self.assertEqual(parse_schedule("2026-10-25", "12:30-14:00 CET", ""),
                         ("2026-10-25", "12:30", "14:00"))
        self.assertEqual(parse_schedule("2026-10-26", "07:00–08:30 CET", None),
                         ("2026-10-26", "07:00", "08:30"))

    def test_missing_cells_remain_unknown(self):
        for placeholder in (None, "", " ", "#N/A", "N/A", "NA", "None", "null", "TBC", "TBD"):
            self.assertIsNone(clean(placeholder))
        paper = normalize_row(["42-FIND", "A real title", "Not Presenting", "Not presenting", "NA"], 2)
        self.assertEqual(paper["status"], "not presenting")
        for key in ("date", "start", "end", "room", "session", "presenter"):
            self.assertIsNone(paper[key])
        self.assertNotIn("authors", paper)
        self.assertNotIn("abstract", paper)

    def test_conflicting_end_is_not_guessed(self):
        row = ["42-MAIN", "Conflicted", "Poster", "In-Person", "Someone", "Hall H",
               "Session 5", "Poster Session C", "2026-10-25", "18:00-19:30 CET", "10:30"]
        dataset, audit = build_dataset([HEADER, row], "2026-10-23")
        paper = dataset["papers"][0]
        self.assertEqual(paper["start"], "18:00")
        self.assertIsNone(paper["end"])
        self.assertEqual(paper["status"], "unscheduled")
        self.assertIn("10:30", paper["scheduleNote"])
        self.assertIn("18:00-19:30 CET", paper["scheduleNote"])
        self.assertTrue(any(issue["id"] == paper["id"] and issue["type"] == "conflicting times" for issue in audit["issues"]))

    def test_inactive_status_takes_precedence_over_stale_assignment(self):
        for presentation, expected_status in (("Not Presenting", "not presenting"), ("Withdrawn", "withdrawn"),
                                               ("Desk Reject", "desk rejected")):
            row = ["42-FIND", "Inactive paper", presentation, presentation, "Someone", "Hall H",
                   "Session 2", "Poster Session A", "2026-10-25", "11:00", "12:30"]
            dataset, audit = build_dataset([HEADER, row], "2026-10-23")
            paper = dataset["papers"][0]
            self.assertEqual(paper["status"], expected_status)
            self.assertEqual(paper["date"], "2026-10-25")
            self.assertTrue(any(issue["id"] == paper["id"] and issue["type"] == "inactive paper retains assignment" for issue in audit["issues"]))

    def test_desk_rejection_in_either_source_column_is_inactive_without_missing_assignment(self):
        for presentation, mode in (("Desk Reject", ""), ("", "Desk Reject")):
            dataset, audit = build_dataset([HEADER, ["42-FIND", "Rejected paper", presentation, mode]], "2026-10-24")
            self.assertEqual(dataset["papers"][0]["status"], "desk rejected")
            self.assertNotIn("missing assignment", audit["issueCounts"])

    def test_presenter_title_errors_are_not_displayed_as_names(self):
        row = ["42-MAIN", "Repeated title", "Oral", "In-Person", "Repeated title", "F6",
               "Session 5", "Topic", "2026-10-26", "09:00", "10:30"]
        dataset, audit = build_dataset([HEADER, row], "2026-10-23")
        paper = dataset["papers"][0]
        self.assertIsNone(paper["presenter"])
        self.assertIn("repeats the paper title", paper["presenterNote"])
        self.assertEqual(audit["issueCounts"]["presenter repeats title"], 1)

    def test_presentation_format_and_attendance_mode_stay_independent(self):
        paper = normalize_row(["42-IND", "Virtual oral", "Oral", "Virtual", "Someone", "G1-3",
                               "Session 5", "Topic", "2026-10-26", "09:00", "10:30"], 2)
        self.assertEqual(paper["presentation"], "Oral")
        self.assertEqual(paper["mode"], "Virtual")
        self.assertEqual(paper["room"], "G1-3")

    def test_unusual_source_values_are_preserved(self):
        paper = normalize_row(["42-FIND", "Unusual assignment", "TBC", "In-Person", "Someone", "Hall",
                               "Session 9", "Poster Session E", "2026-10-26", "16:46", "18:15"], 2)
        self.assertEqual(paper["start"], "16:46")
        self.assertEqual(paper["room"], "Hall")
        self.assertIsNone(paper["presentation"])
        self.assertEqual(parse_schedule("2026-10-27", "11:00", "12:00"),
                         ("2026-10-27", "11:00", "12:00"))

    def test_invalid_times_and_timezones_fail(self):
        for start, end in (("24:00", "25:00"), ("9:00", "10:30"), ("11:00", "10:30")):
            with self.assertRaises(ValueError):
                parse_schedule("2026-10-25", start, end)
        with self.assertRaises(ValueError):
            parse_schedule("2026-10-24", "12:30-14:00 CET", None)

    def test_duplicate_ids_are_never_silently_dropped(self):
        row = ["1-MAIN", "Title", "Not Presenting", "Not presenting", "Person"]
        with self.assertRaisesRegex(ValueError, "Duplicate ID 1-MAIN at rows 2 and 3"):
            build_dataset([HEADER, row, row], "2026-10-23")

    def test_wrong_sheet_fails_before_output(self):
        with self.assertRaisesRegex(ValueError, "Unexpected CSV header"):
            build_dataset([["ID", "Title"]], "2026-10-23")


class SourceSnapshotTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with (ROOT / "data/source.csv").open(newline="", encoding="utf-8") as source:
            cls.rows = list(csv.reader(source))
        cls.committed = json.loads((ROOT / "data/papers.json").read_text(encoding="utf-8"))
        cls.dataset, cls.audit = build_dataset(cls.rows, cls.committed["conference"]["updatedAt"])
        cls.papers = {paper["id"]: paper for paper in cls.dataset["papers"]}

    def test_every_source_id_and_row_is_preserved_once(self):
        source_count = len(self.rows) - 1
        self.assertGreater(source_count, 0)
        self.assertEqual(len(self.papers), source_count)
        self.assertEqual([row[0] for row in self.rows[1:]], [paper["id"] for paper in self.dataset["papers"]])
        self.assertEqual([paper["sourceRow"] for paper in self.dataset["papers"]], list(range(2, len(self.rows) + 1)))
        self.assertEqual(self.audit["sourceRows"], source_count)
        self.assertEqual(Counter(paper["status"] for paper in self.papers.values()), self.audit["countsByStatus"])

    def test_output_is_reproducible(self):
        self.assertEqual(self.dataset, self.committed)
        self.assertEqual(self.audit, json.loads((ROOT / "data/audit.json").read_text(encoding="utf-8")))

    def test_featured_paper_has_the_source_assignment(self):
        featured_id = self.dataset["conference"]["featuredPaperId"]
        paper = self.papers[featured_id]
        row = list(next(row for row in self.rows[1:] if row[0] == featured_id))
        row += [""] * (len(HEADER) - len(row))
        self.assertEqual(paper["title"], row[1].strip())
        self.assertEqual((paper["date"], paper["start"], paper["end"]), parse_schedule(*row[8:11]))
        self.assertEqual(paper["session"], clean(row[6]))
        expected_room = clean(row[5])
        if expected_room and expected_room.casefold() == "zoom":
            expected_room = "Zoom"
        self.assertEqual(paper["room"], expected_room)

    def test_schema_keeps_presenters_distinct_from_authors(self):
        required_fields = {
            "id", "title", "track", "trackCode", "presentation", "mode", "presenter", "presenterNote",
            "room", "session", "topic", "date", "start", "end", "timeZone", "status", "sourceRow", "scheduleNote",
        }
        for paper in self.papers.values():
            self.assertEqual(set(paper), required_fields)
            self.assertIn(paper["status"], {"scheduled", "unscheduled", "not presenting", "withdrawn", "desk rejected"})


if __name__ == "__main__":
    unittest.main()
