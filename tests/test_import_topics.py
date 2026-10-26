"""Verify identity joins, snapshot integrity and offline reproduction."""
import csv
import gzip
import io
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import import_topics
import build


class AtlasImportTests(unittest.TestCase):
    def test_reproduces_published_data_and_audit_without_network(self):
        with patch.object(import_topics, "urlopen", side_effect=AssertionError("Network is not needed")):
            data, audit = import_topics.create_dataset()
        self.assertEqual(data, json.loads((ROOT / "data/poster-topics.json").read_text()))
        self.assertEqual(audit, json.loads((ROOT / "data/atlas/audit.json").read_text()))
        self.assertEqual((audit["atlasPapers"], audit["posters"], audit["matched"]), (5534, 2831, 2803))
        self.assertEqual(len(audit["unclassified"]), 0)
        self.assertEqual(audit["programme"]["matched"], 5532)
        self.assertEqual(len(audit["programme"]["unclassified"]), 0)
        self.assertEqual(len(data["papers"]), 5534)
        self.assertEqual(audit["programme"]["localAssigned"],71)
        self.assertEqual(audit["programme"]["titleOnly"],7)
        self.assertEqual(audit["localAssigned"],28)
        local=json.loads((ROOT / "data/atlas/local-areas.json").read_text())
        self.assertEqual(sum(bool(row.get("abstract")) for row in local["assignments"]),64)
        alias=next(row for row in data["sessions"]["E"]["assignments"] if row["board"]==371)
        self.assertIsNone(alias["paperId"])
        self.assertIsNone(alias["topic"])
        self.assertEqual(alias["area"],1)
        self.assertEqual(data["source"]["author"], "Hadi Mohammadi")

    def test_topic_labels_are_joined_by_anthology_identity_only(self):
        # Schedule changes and a renamed title cannot change Atlas identity.
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in import_topics.INPUTS:
                target = root / name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(ROOT / name, target)
            labels = json.loads((root / "data/atlas/labels_2026.json").read_text())
            index = gzip.decompress((root / "data/atlas/papers_index.csv.gz").read_bytes())
            rows = list(csv.DictReader(io.StringIO(index.decode())))
            expected = import_topics.read_atlas(index, labels)
            for row in rows:
                row.update(title="Changed title", room="Wrong room", when="Wrong time", pres="Oral")
            output = io.StringIO()
            writer = csv.DictWriter(output, fieldnames=rows[0].keys())
            writer.writeheader(); writer.writerows(rows)
            self.assertEqual(import_topics.read_atlas(output.getvalue().encode(), labels), expected)

    def test_duplicate_ids_and_conflicting_topic_parents_are_rejected(self):
        index = gzip.decompress((ROOT / "data/atlas/papers_index.csv.gz").read_bytes())
        labels = json.loads((ROOT / "data/atlas/labels_2026.json").read_text())
        rows = list(csv.DictReader(io.StringIO(index.decode())))
        def encoded(items):
            output = io.StringIO()
            writer = csv.DictWriter(output, fieldnames=rows[0].keys())
            writer.writeheader(); writer.writerows(items)
            return output.getvalue().encode()
        with self.assertRaisesRegex(ValueError, "Duplicate Atlas paper"):
            import_topics.read_atlas(encoded(rows + [rows[0]]), labels)
        changed = {**rows[0], "anthology": "https://aclanthology.org/2026.test.1/",
                   "area": next(value["name"] for value in labels["broad"].values() if value["name"] != rows[0]["area"])}
        with self.assertRaisesRegex(ValueError, "multiple areas"):
            import_topics.read_atlas(encoded(rows + [changed]), labels)

    def test_corrupt_snapshot_cannot_overwrite_the_deployed_data(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in import_topics.INPUTS + ["data/poster-topics.json"]:
                target = root / name; target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(ROOT / name, target)
            before = (root / "data/poster-topics.json").read_bytes()
            with (root / "data/atlas/labels_2026.json").open("a") as file:
                file.write(" ")
            with self.assertRaisesRegex(ValueError, "checksum mismatch"):
                import_topics.import_topics(root)
            self.assertEqual((root / "data/poster-topics.json").read_bytes(), before)
            self.assertNotEqual(import_topics.input_hash(root), import_topics.input_hash())

    def test_local_area_review_cannot_silently_follow_a_changed_paper(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            for name in import_topics.INPUTS:
                target=root/name; target.parent.mkdir(parents=True,exist_ok=True)
                shutil.copyfile(ROOT/name,target)
            path=root/"data/atlas/local-areas.json"
            review=json.loads(path.read_text())
            review["assignments"][0]["title"]="Different paper"
            path.write_text(json.dumps(review))
            with self.assertRaisesRegex(ValueError,"Local area identity changed"):
                import_topics.create_dataset(root)

    def test_build_rejects_stale_topic_inputs_before_replacing_the_site(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "site"
            output.mkdir()
            (output / "sentinel").write_text("previous deployment")
            with patch.object(build, "OUTPUT", output), patch.object(build, "input_hash", return_value="changed"):
                with self.assertRaisesRegex(ValueError, "import_topics.py"):
                    build.build()
            self.assertEqual((output / "sentinel").read_text(), "previous deployment")


if __name__ == "__main__":
    unittest.main()
