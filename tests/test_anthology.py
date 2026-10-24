"""Verify publication matches without guessing URLs or changing schedule data."""

import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from import_anthology import AnthologyParser, match_papers, normalize_title, parse_catalog


def paper(paper_id="1-MAIN", title="A paper", track="MAIN"):
    return {"id": paper_id, "title": title, "trackCode": track, "status": "scheduled"}


def catalog(*entries):
    return {"updatedAt": "2026-10-24", "sources": ["https://aclanthology.org/events/emnlp-2026/"],
            "papers": [{"id": paper_id, "title": title, "authors": []} for paper_id, title in entries]}


class AnthologyTests(unittest.TestCase):
    def test_parse_nested_titles_and_authors_without_front_matter_or_workshops(self):
        parser = AnthologyParser()
        parser.feed('''
            <a class="align-middle" href="/2026.emnlp-main.0/">Front matter</a>
            <a href="/people/editor/">Editor</a>
            <a class="align-middle" href="/2026.emnlp-main.1/">A <span>S</span>eq2Seq &amp; NLP paper</a>
            <a href="/people/one/">Jan <span>Pfister</span></a>
            <a href="/people/two/">Tom Völker</a>
            <a href="/2026.emnlp-main.1.pdf">pdf</a>
            <a class="align-middle" href="/2026.workshop.1/">Workshop paper</a>
            <a href="/people/three/">Workshop author</a>
            <a class="align-middle" href="/2026.findings-emnlp.2/">Another paper</a>
            <a href="/people/four/">Another author</a>
        ''')
        self.assertEqual(parser.papers, [
            {"id": "2026.emnlp-main.1", "title": "A Seq2Seq & NLP paper", "authors": ["Jan Pfister", "Tom Völker"]},
            {"id": "2026.findings-emnlp.2", "title": "Another paper", "authors": ["Another author"]},
        ])

    def test_empty_source_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "No paper records"):
            parse_catalog({"event": "<html>Try again later</html>"}, "2026-10-24")

    def test_normalizes_typography_and_tex_without_fuzzy_matching(self):
        self.assertEqual(normalize_title(r"\texttt{Café}: $\Delta$-\mathbb{S}, \lambda & \sigma"),
                         normalize_title("CAFE — ΔS λ σ"))
        self.assertNotEqual(normalize_title("A rational explanation"), normalize_title("An irrational explanation"))

    def test_unique_title_matches_only_within_its_track(self):
        data = catalog(("2026.emnlp-main.1", "A Paper"), ("2026.findings-emnlp.1", "A Paper"))
        links, audit = match_papers([paper(title="A paper!"), paper("2-IND", track="IND")], data, {})
        self.assertEqual(links, {"1-MAIN": "2026.emnlp-main.1"})
        self.assertEqual([p["id"] for p in audit["unmatched"]], ["2-IND"])

    def test_ambiguous_and_similar_titles_stay_unmatched(self):
        data = catalog(("2026.emnlp-main.1", "A paper"), ("2026.emnlp-main.2", "A paper"),
                       ("2026.emnlp-main.3", "A renamed paper"))
        links, audit = match_papers([paper(), paper("2-MAIN", "A renamed paper with more words")], data, {})
        self.assertEqual(links, {})
        self.assertEqual([p["reason"] for p in audit["unmatched"]], ["Ambiguous title", "No verified match"])

    def test_reviewed_title_change_is_guarded_against_source_changes(self):
        data = catalog(("2026.emnlp-main.1", "The published title"))
        overrides = {"1-MAIN": {"anthologyId": "2026.emnlp-main.1", "scheduleTitle": "The schedule title",
                                 "anthologyTitle": "The published title"}}
        links, audit = match_papers([paper(title="The schedule title")], data, overrides)
        self.assertEqual(links, {"1-MAIN": "2026.emnlp-main.1"})
        self.assertEqual(audit["reviewedTitleChanges"], ["1-MAIN"])
        for source, publications in [([paper(title="A changed title")], data),
                                     ([paper(title="The schedule title")], catalog(("2026.emnlp-main.1", "A changed title")))]:
            with self.subTest(source=source, publications=publications):
                with self.assertRaisesRegex(ValueError, "Reviewed titles changed"):
                    match_papers(source, publications, overrides)

    def test_reviewed_match_cannot_cross_tracks(self):
        overrides = {"1-MAIN": {"anthologyId": "2026.findings-emnlp.1", "scheduleTitle": "A paper", "anthologyTitle": "A paper"}}
        with self.assertRaisesRegex(ValueError, "Track mismatch"):
            match_papers([paper()], catalog(("2026.findings-emnlp.1", "A paper")), overrides)

    def test_invalid_or_duplicate_publication_ids_are_rejected(self):
        for entries in [[("2026.emnlp-main.0", "Front matter")], [("../../elsewhere", "A paper")],
                        [("2026.emnlp-main.1", "A paper"), ("2026.emnlp-main.1", "A second paper")]]:
            with self.subTest(entries=entries):
                with self.assertRaisesRegex(ValueError, "Invalid or duplicate"):
                    match_papers([paper()], catalog(*entries), {})

    def test_multiple_schedule_rows_cannot_use_the_same_publication(self):
        with self.assertRaisesRegex(ValueError, "Multiple schedule entries"):
            match_papers([paper(), paper("2-MAIN")], catalog(("2026.emnlp-main.1", "A paper")), {})

    def test_committed_audit_is_reproducible_and_featured_paper_is_correct(self):
        read = lambda name: json.loads((ROOT / "data" / name).read_text())
        links, audit = match_papers(read("papers.json")["papers"], read("anthology-catalog.json"), read("anthology-overrides.json"))
        self.assertEqual(audit, read("anthology-audit.json"))
        self.assertEqual(links["9736-FIND"], "2026.findings-emnlp.2464")
        self.assertEqual(len(links) + len(audit["unmatched"]), audit["total"])


if __name__ == "__main__":
    unittest.main()
