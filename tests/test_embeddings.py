"""Check the abstract snapshot parser and the committed SPECTER2 vectors without ML packages."""

import gzip
import hashlib
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from import_abstracts import collections, create_snapshot

REVISION = "c" * 40


class AbstractSnapshotTests(unittest.TestCase):
    def test_parse_ids_and_plain_text_from_nested_markup(self):
        xml = b'''<collection id="2026.findings"><volume id="emnlp">
            <frontmatter><url>2026.findings-emnlp.0</url></frontmatter>
            <paper id="7"><title><fixed-case>BERT</fixed-case> Paper</title>
              <abstract>Speeds up by <tex-math>7\\times</tex-math>
                over   baselines.</abstract></paper>
            <paper id="8"><title>No abstract</title></paper>
        </volume></collection>'''
        catalog = {"papers": [{"id": "2026.findings-emnlp.7"}, {"id": "2026.findings-emnlp.8"}]}
        self.assertEqual(collections(catalog), ["2026.findings"])
        snapshot = create_snapshot({"2026.findings": xml}, REVISION, catalog)
        self.assertEqual(snapshot["papers"], {
            "2026.findings-emnlp.7": {"title": "BERT Paper", "abstract": "Speeds up by 7\\times over baselines."},
            "2026.findings-emnlp.8": {"title": "No abstract", "abstract": ""},
        })
        self.assertEqual(snapshot["source"]["files"], {"data/xml/2026.findings.xml": hashlib.sha256(xml).hexdigest()})

    def test_rejects_missing_papers_and_short_revisions(self):
        xml = b'<collection id="2026.tacl"><volume id="1"><paper id="1"><title>T</title></paper></volume></collection>'
        with self.assertRaisesRegex(ValueError, "missing"):
            create_snapshot({"2026.tacl": xml}, REVISION, {"papers": [{"id": "2026.tacl-1.2"}]})
        with self.assertRaisesRegex(ValueError, "revision"):
            create_snapshot({"2026.tacl": xml}, "main", {"papers": [{"id": "2026.tacl-1.1"}]})


class CommittedEmbeddingTests(unittest.TestCase):
    def test_vectors_match_their_metadata(self):
        metadata = json.loads((ROOT / "data/embeddings/specter2.json").read_text())
        data = (ROOT / "data/embeddings/specter2.f32").read_bytes()
        abstracts = (ROOT / "data/embeddings/abstracts.json.gz").read_bytes()
        self.assertEqual(len(data), metadata["count"] * metadata["dimensions"] * 4)
        self.assertEqual(hashlib.sha256(data).hexdigest(), metadata["sha256"])
        self.assertEqual(hashlib.sha256(abstracts).hexdigest(), metadata["abstractsSha256"])
        ids = [paper_id for paper_id, _, _ in metadata["papers"]]
        self.assertEqual(len(ids), metadata["count"])
        self.assertEqual(len(set(ids)), len(ids))
        snapshot = json.loads(gzip.decompress(abstracts))["papers"]
        for _, anthology_id, has_abstract in metadata["papers"]:
            if anthology_id:
                self.assertEqual(has_abstract, bool(snapshot[anthology_id]["abstract"]))


if __name__ == "__main__":
    unittest.main()
