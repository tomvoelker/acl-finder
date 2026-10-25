"""Check safe title matching, link eligibility, and complete Underline imports."""

from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from import_anthology import match_papers
from import_underline import SOURCE, match_presentations, parse_catalog, title_key


def paper(pid="1-MAIN", title="A paper"):
    return {"id": pid, "title": title, "trackCode": "MAIN", "status": "scheduled"}


def entry(uid="123", title="A paper", **changes):
    return {"id": uid, "title": title, "slug": "a-paper", "sessionId": "456", "published": True, **changes}


def catalog(*entries):
    return {"source": SOURCE, "updatedAt": "2026-10-25", "papers": list(entries)}


class MatchingTests(unittest.TestCase):
    def test_typographic_and_tex_variations_match(self):
        self.assertEqual(title_key(r"$\textlangle \tt /think \textrangle$ Doesn’t Stop"), title_key("⟨/think⟩ Doesn't Stop"))
        self.assertEqual(title_key("A &amp; B"), title_key("A & B"))
        links, _ = match_presentations([paper(title="A: Paper!")], catalog(entry()), {}, {})
        self.assertEqual(links["1-MAIN"], f"{SOURCE}/sessions/456/lecture/123-a-paper")

    def test_verified_publication_title_can_supply_a_unique_match(self):
        links, _ = match_presentations([paper(title="Earlier title")], catalog(entry()), {"1-MAIN": "A paper"}, {})
        self.assertIn("1-MAIN", links)

    def test_ambiguous_titles_and_conflicting_aliases_never_choose_arbitrarily(self):
        for entries, titles in [([entry(), entry("124")], {}),
                                ([entry(), entry("124", "Another paper")], {"1-MAIN": "Another paper"})]:
            links, audit = match_presentations([paper()], catalog(*entries), titles, {})
            self.assertEqual(links, {})
            self.assertEqual(audit["unmatched"][0]["reason"], "Ambiguous title")

    def test_unpublished_and_unassigned_records_do_not_get_dead_links(self):
        for changes in [{"published": False}, {"sessionId": None}]:
            links, audit = match_presentations([paper()], catalog(entry(**changes)), {}, {})
            self.assertEqual(links, {})
            self.assertEqual(audit["matched"], 1)
            self.assertEqual(len(audit["unavailable"]), 1)

    def test_invalid_urls_and_duplicate_mappings_are_rejected(self):
        for changes in [{"slug": "../../elsewhere"}, {"id": "123?x=1"}, {"sessionId": "456/other"}, {"published": "true"}]:
            with self.assertRaises(ValueError):
                match_presentations([paper()], catalog(entry(**changes)), {}, {})
        with self.assertRaisesRegex(ValueError, "Multiple schedule entries"):
            match_presentations([paper(), paper("2-MAIN")], catalog(entry()), {}, {})

    def test_reviewed_match_expires_when_either_title_changes(self):
        overrides = {"1-MAIN": {"underlineId": "123", "scheduleTitle": "Earlier title", "underlineTitle": "A paper"}}
        links, audit = match_presentations([paper(title="Earlier title")], catalog(entry()), {}, overrides)
        self.assertIn("1-MAIN", links)
        self.assertEqual(audit["reviewedTitleChanges"], ["1-MAIN"])
        for p, e in [(paper(title="Changed"), entry()), (paper(title="Earlier title"), entry(title="Changed"))]:
            with self.assertRaisesRegex(ValueError, "Reviewed titles changed"):
                match_presentations([p], catalog(e), {}, overrides)

    def test_committed_audit_is_reproducible(self):
        read = lambda name: json.loads((ROOT / "data" / name).read_text())
        papers, anthology = read("papers.json")["papers"], read("anthology-catalog.json")
        anthology_links, _ = match_papers(papers, anthology, read("anthology-overrides.json"))
        publications = {p["id"]: p for p in anthology["papers"]}
        titles = {pid: publications[aid]["title"] for pid, aid in anthology_links.items()}
        links, audit = match_presentations(papers, read("underline-catalog.json"), titles, read("underline-overrides.json"))
        self.assertEqual(audit, read("underline-audit.json"))
        self.assertEqual(len(links) + len(audit["unavailable"]) + len(audit["unmatched"]), len(papers))
        self.assertIn("/lecture/167222-", links["9295-TACL"])
        self.assertIn("/lecture/162510-", links["6513-MAIN"])
        self.assertNotIn("2792-FIND", links)


class PaginationTests(unittest.TestCase):
    def test_incomplete_duplicate_and_wrong_event_responses_are_rejected(self):
        row = {"id": "123", "type": "thin_lectures", "attributes": {"title": "A paper", "slug": "a-paper", "event_id": "535", "published": True},
               "relationships": {"event": {"data": {"id": "535"}}, "event_session": {"data": {"id": "456"}}}}
        page = {"meta": {"current_page": 1, "total_count": 1, "total_pages": 1}, "data": [row]}
        self.assertEqual(parse_catalog([page], "2026-10-25")["papers"], [entry()])
        bad = deepcopy(page); bad["meta"]["total_pages"] = 2
        with self.assertRaisesRegex(ValueError, "pagination"):
            parse_catalog([bad], "2026-10-25")
        bad = deepcopy(page); bad["meta"]["total_count"] = 2
        with self.assertRaisesRegex(ValueError, "Incomplete"):
            parse_catalog([bad], "2026-10-25")
        bad["data"].append(deepcopy(row))
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            parse_catalog([bad], "2026-10-25")
        bad = deepcopy(page); bad["data"][0]["attributes"]["event_id"] = "999"
        with self.assertRaisesRegex(ValueError, "outside"):
            parse_catalog([bad], "2026-10-25")


if __name__ == "__main__":
    unittest.main()
