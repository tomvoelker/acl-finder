"""Keep reviewed groups reproducible and prevent stale labels from replacing them."""
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
EXPERIMENT = ROOT / 'experiments/poster-topics'
spec = importlib.util.spec_from_file_location('topic_export', EXPERIMENT / 'export.py')
exporter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(exporter)


class TopicExportTests(unittest.TestCase):
    def test_committed_corpus_is_the_reviewed_input_for_every_session(self):
        rows = json.loads(gzip.decompress((EXPERIMENT / 'corpus.json.gz').read_bytes()))
        labels = json.loads((EXPERIMENT / 'labels.json').read_text())
        metrics = json.loads((EXPERIMENT / 'metrics.json').read_text())
        fingerprint = hashlib.sha256(json.dumps(rows, sort_keys=True).encode()).hexdigest()
        self.assertEqual(fingerprint, labels['corpusSHA256'])
        self.assertEqual(fingerprint, metrics['corpusSHA256'])
        self.assertEqual(len(rows), metrics['papers'])
        self.assertEqual(sum(bool(row['abstract']) for row in rows), metrics['withAbstract'])
        self.assertEqual({row['session'] for row in rows}, set(labels['sessions']))

    def test_changed_memberships_cannot_overwrite_the_published_dataset(self):
        public = json.loads((EXPERIMENT / 'assignments.json').read_text())
        candidates = {f'embeddings-{s}-12': {'assignments': data['assignments']} for s, data in public['sessions'].items()}
        candidates['embeddings-A-12']['assignments'][0]['group'] = (candidates['embeddings-A-12']['assignments'][0]['group'] + 1) % 12
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'data').mkdir()
            (root / 'experiments/poster-topics').mkdir(parents=True)
            board_fixture = b'reviewed experiment board catalog'
            (root / 'data/poster-boards.json').write_bytes(board_fixture)
            output = root / 'experiments/poster-topics/assignments.json'
            output.write_text('previous deployment')
            (root / 'experiments/poster-topics/labels.json').write_bytes((EXPERIMENT / 'labels.json').read_bytes())
            metrics = json.loads((EXPERIMENT / 'metrics.json').read_text())
            # Isolate the membership guard from later changes to the live board source.
            metrics['handbookSHA256'] = hashlib.sha256(board_fixture).hexdigest()
            (root / 'metrics.json').write_text(json.dumps(metrics))
            (root / 'candidates.json').write_text(json.dumps(candidates))
            with self.assertRaisesRegex(ValueError, 'Cluster memberships changed'):
                exporter.export(root, root=root)
            self.assertEqual(output.read_text(), 'previous deployment')


if __name__ == '__main__':
    unittest.main()
