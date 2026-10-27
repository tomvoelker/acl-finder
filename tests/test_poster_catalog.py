"""Check sheet board authority, exact timeline agreement, and physical conflicts."""
from copy import deepcopy
import csv
import hashlib
import io
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from poster_catalog import create_catalog, load_catalog, validate_catalog
from build import enrich_poster_boards


class PosterCatalogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads((ROOT / "data/papers.json").read_text())
        cls.source = (ROOT / "data/source.csv").read_bytes().decode("utf-8-sig")
        cls.timeline = (ROOT / "data/timeline.csv").read_bytes().decode("utf-8-sig")
        cls.catalog = load_catalog()

    def catalog_for(self, data):
        return create_catalog(data, csv.reader(io.StringIO(self.timeline)), self.source, self.timeline)

    def test_committed_catalog_reproduces_sheet_and_timeline_with_source_rows(self):
        self.assertEqual(self.catalog_for(self.data), self.catalog)
        self.assertEqual(self.catalog["version"], 2)
        self.assertEqual(self.catalog["source"]["column"], "L")
        self.assertEqual(self.catalog["source"]["updatedAt"], "2026-10-27")
        self.assertEqual(self.catalog["source"]["sha256"], hashlib.sha256(self.source.encode()).hexdigest())
        self.assertEqual(self.catalog["source"]["timelineSHA256"], hashlib.sha256(self.timeline.encode()).hexdigest())
        self.assertEqual(len(self.catalog["entries"]), 2876)
        self.assertEqual(sum(e["verified"] for e in self.catalog["entries"]), 2865)
        numeric = [e for e in self.catalog["entries"] if type(e["board"]) is int]
        self.assertEqual(len(numeric), 2806)
        self.assertEqual(sum(e["verified"] for e in numeric), 2795)
        papers = {p["id"]: p for p in self.data["papers"]}
        virtual = papers["3310-FIND"]
        self.assertEqual((virtual["presentation"], virtual["mode"], virtual["room"], virtual["session"], virtual["board"]),
                         ("Virtual", "Virtual", "Zoom", "Virtual 5", None))
        self.assertEqual((virtual["date"], virtual["start"], virtual["end"]), ("2026-10-27", "12:30", "14:00"))
        self.assertNotIn(virtual["id"], {entry["paperId"] for entry in self.catalog["entries"]})
        temps = papers["9349-MAIN"]
        self.assertEqual((temps["presentation"], temps["mode"], temps["room"], temps["session"], temps["board"]),
                         ("Virtual", "Virtual", "Zoom", "Virtual 4", None))
        self.assertEqual((temps["date"], temps["start"], temps["end"]), ("2026-10-26", "12:30", "14:00"))
        self.assertNotIn(temps["id"], {entry["paperId"] for entry in self.catalog["entries"]})
        for entry in self.catalog["entries"]:
            paper = papers[entry["paperId"]]
            self.assertEqual(entry["board"], paper["board"] if paper["board"].startswith("D") else int(paper["board"]))
            self.assertEqual(entry["sourceRow"], paper["sourceRow"])
            self.assertEqual(entry["authors"], [])
            self.assertNotIn("boardPage", entry)

    def test_demos_map_verified_literal_positions_to_the_existing_sessions(self):
        demos = [p for p in self.data["papers"] if (p["board"] or "").startswith("D")]
        self.assertEqual(len(demos), 70)
        self.assertEqual({p["board"] for p in demos}, {f"D{i}" for i in range(1, 11)})
        mapped = {e["paperId"]: e for e in self.catalog["entries"] if type(e["board"]) is str}
        self.assertEqual(set(mapped), {p["id"] for p in demos})
        for paper in demos:
            entry = mapped[paper["id"]]
            self.assertEqual(entry["board"], paper["board"])
            self.assertEqual(entry["session"], paper["topic"][-1])
            self.assertTrue(entry["verified"])
        self.assertEqual({e["board"] for e in mapped.values()}, {f"D{i}" for i in range(1, 11)})
        data = deepcopy(self.data)
        enrich_poster_boards(data, deepcopy(self.catalog))
        demo = next(p for p in data["papers"] if p["id"] == demos[0]["id"])
        self.assertEqual(demo["board"], demos[0]["board"])
        self.assertEqual(demo["posterBoard"], demos[0]["board"])

    def test_demo_verification_rejects_mismatches_inactive_and_duplicate_rows(self):
        changes = [{"start": "11:01"}, {"date": "2026-10-26"}, {"end": "12:31"},
                   {"room": "Other"}, {"status": "withdrawn"}, {"presentation": "Poster"},
                   {"scheduleNote": "Time needs confirmation"}]
        for change in changes:
            with self.subTest(change=change):
                data = deepcopy(self.data)
                demo = next(p for p in data["papers"] if p["board"] == "D1")
                demo.update(change)
                entry = next(e for e in self.catalog_for(data)["entries"] if e["paperId"] == demo["id"])
                self.assertFalse(entry["verified"])
        data = deepcopy(self.data)
        demo = next(p for p in data["papers"] if p["board"] == "D1")
        duplicate = {**demo, "id": "duplicate-DEMO", "sourceRow": 9999}
        data["papers"].append(duplicate)
        occupants = [e for e in self.catalog_for(data)["entries"] if e["session"] == "A" and e["board"] == "D1"]
        self.assertEqual(len(occupants), 2)
        self.assertTrue(all(not e["verified"] and e["conflict"] for e in occupants))

    def test_demo_and_poster_session_labels_cannot_be_interchanged(self):
        for board, topic in [("D1", "Poster Session A"), ("1", "Demo Session A")]:
            with self.subTest(board=board):
                data = deepcopy(self.data)
                paper = next(p for p in data["papers"] if p["board"] == board)
                paper["topic"] = topic
                self.assertNotIn(paper["id"], {e["paperId"] for e in self.catalog_for(data)["entries"]})

    def test_board_union_validates_demo_range_and_keeps_numeric_positions_distinct(self):
        catalog = deepcopy(self.catalog)
        numeric = next(e for e in catalog["entries"] if e["session"] == "A" and e["board"] == 1)
        demo = next(e for e in catalog["entries"] if e["session"] == "A" and e["board"] == "D1")
        catalog["entries"] = [numeric, demo]
        self.assertEqual(validate_catalog(catalog), catalog)
        for board in ["D1", "D10", "D11", "D12", 1, 424]:
            single = deepcopy(catalog)
            single["entries"] = [{**demo, "board": board}]
            validate_catalog(single)
        for board in ["D0", "D13", "D01", "d1", "1", True, 0, 425, None]:
            with self.subTest(board=board):
                single = deepcopy(catalog)
                single["entries"] = [{**demo, "board": board}]
                with self.assertRaisesRegex(ValueError, "Invalid board"):
                    validate_catalog(single)

    def test_blank_board_removes_a_previous_handbook_location(self):
        data = deepcopy(self.data)
        paper = next(p for p in data["papers"] if p["id"] == "9736-FIND")
        paper["board"] = None
        catalog = self.catalog_for(data)
        self.assertNotIn(paper["id"], {e["paperId"] for e in catalog["entries"]})
        enrich_poster_boards(data, catalog)
        self.assertNotIn("posterBoard", paper)
        self.assertNotIn("posterClaimedBoard", paper)

    def test_conflicts_retain_exact_row_values_and_never_confirm_a_location(self):
        unverified = [e for e in self.catalog["entries"] if not e["verified"]]
        duplicate = [e for e in unverified if e.get("conflict")]
        self.assertEqual({(e["session"], e["board"], e["paperId"]) for e in duplicate},
                         {("D", 311, "2638-MAIN"), ("D", 311, "6137-MAIN")})
        singletons = [e for e in unverified if not e.get("conflict")]
        self.assertEqual(len(singletons), 9)
        minute = next(e for e in singletons if e["paperId"] == "425-FIND")
        self.assertEqual(minute["scheduleDifferences"], {"start": {"schedule": "16:46", "timeline": "16:45"}})
        room = next(e for e in singletons if e["paperId"] == "2167-FIND")
        self.assertIn("does not confirm Hall H", room["issue"])
        data = deepcopy(self.data)
        enrich_poster_boards(data, deepcopy(self.catalog))
        papers = {p["id"]: p for p in data["papers"]}
        for entry in unverified:
            paper = papers[entry["paperId"]]
            self.assertNotIn("posterBoard", paper)
            self.assertEqual(paper["posterClaimedBoard"], entry["board"])
        self.assertEqual(papers["425-FIND"]["start"], "16:46")

    def test_collision_validation_uses_physical_slot_across_session_labels(self):
        catalog = deepcopy(self.catalog)
        first = next(e for e in catalog["entries"] if e["verified"] and e["session"] == "A")
        other = next(e for e in catalog["entries"] if e["verified"] and e["session"] == "B")
        catalog["entries"] = [first, other]
        first_slot = next(s for s in catalog["sessions"] if s["id"] == "A")
        other_slot = next(s for s in catalog["sessions"] if s["id"] == "B")
        other["board"] = first["board"]
        validate_catalog(catalog)  # Reuse in a different physical slot is permitted.
        for key in ("date", "start", "end", "room"):
            other_slot[key] = first_slot[key]
        with self.assertRaisesRegex(ValueError, "Conflicting physical board"):
            validate_catalog(catalog)
        for entry in catalog["entries"]:
            entry.update(verified=False, conflict=True)
        self.assertEqual(validate_catalog(catalog), catalog)


if __name__ == "__main__":
    unittest.main()
