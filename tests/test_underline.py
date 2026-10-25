"""Check safe title matching, link eligibility, and complete Underline imports."""

from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from import_anthology import match_papers
from import_underline import SOURCE, match_presentations, parse_catalog, title_key, oral_timing, flag_overlapping_orals


def paper(pid="1-MAIN", title="A paper"):
    return {"id": pid, "title": title, "trackCode": "MAIN", "status": "scheduled"}


def entry(uid="123", title="A paper", **changes):
    return {"id": uid, "title": title, "slug": "a-paper", "sessionId": "456", "published": True, "startsAt": "2026-10-25T10:00:00Z", "endsAt": "2026-10-25T10:12:00Z", "poster": False, **changes}


def catalog(*entries):
    return {"source": SOURCE, "updatedAt": "2026-10-25", "papers": list(entries)}


class MatchingTests(unittest.TestCase):
    def test_typographic_and_tex_variations_match(self):
        self.assertEqual(title_key(r"$\textlangle \tt /think \textrangle$ Doesn’t Stop"), title_key("⟨/think⟩ Doesn't Stop"))
        self.assertEqual(title_key("A &amp; B"), title_key("A & B"))
        links, _ = match_presentations([paper(title="A: Paper!")], catalog(entry()), {}, {})
        self.assertEqual(links["1-MAIN"]["underlineUrl"], f"{SOURCE}/sessions/456/lecture/123-a-paper")

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
        self.assertIn("/lecture/167222-", links["9295-TACL"]["underlineUrl"])
        self.assertIn("/lecture/162510-", links["6513-MAIN"]["underlineUrl"])
        self.assertNotIn("2792-FIND", links)


class OralTimingTests(unittest.TestCase):
    def setUp(self):
        self.paper = {**paper(), "presentation": "Oral", "date": "2026-10-25", "start": "11:00", "end": "12:30"}

    def test_explicit_utc_times_become_budapest_talk_times_after_dst_change(self):
        result = oral_timing(self.paper, entry(startsAt="2026-10-25T10:39:00.000Z", endsAt="2026-10-25T10:51:00.000Z"))
        self.assertEqual(result, {"oralSlot": {"date": "2026-10-25", "start": "11:39", "end": "11:51"}})
        self.assertEqual((self.paper["start"], self.paper["end"]), ("11:00", "12:30"))

    def test_full_session_and_missing_or_reversed_times_are_not_individual_slots(self):
        for changes in [{"endsAt": "2026-10-25T11:30:00Z"}, {"startsAt": None}, {"endsAt": None},
                        {"endsAt": "2026-10-25T09:59:00Z"}, {"poster": True}]:
            result = oral_timing(self.paper, entry(**changes))
            self.assertNotIn("oralSlot", result)
            self.assertIn("oralSlotNote", result)

    def test_moved_or_overrunning_talks_are_flagged_without_overwriting_the_session(self):
        for changes in [{"startsAt": "2026-10-26T10:00:00Z", "endsAt": "2026-10-26T10:12:00Z"},
                        {"startsAt": "2026-10-25T11:31:00Z", "endsAt": "2026-10-25T11:43:00Z"}]:
            self.assertIn("outside the programme session", oral_timing(self.paper, entry(**changes))["oralSlotNote"])

    def test_only_confirmed_orals_receive_individual_times(self):
        self.assertEqual(oral_timing({**self.paper, "presentation": "Poster"}, entry()), {})
        for changes in [{"status": "withdrawn"}, {"scheduleNote": "Conflicting schedule"}, {"start": None}]:
            self.assertNotIn("oralSlot", oral_timing({**self.paper, **changes}, entry()))
        with self.assertRaisesRegex(ValueError, "timezone"):
            oral_timing(self.paper, entry(startsAt="2026-10-25T10:00:00"))

    def test_overlapping_slots_are_flagged_for_both_papers_but_parallel_rooms_are_allowed(self):
        papers = [{"id": "a", "room": "F1"}, {"id": "b", "room": "F1"}, {"id": "c", "room": "F2"}]
        slots = {"a": {"date": "2026-10-25", "start": "11:00", "end": "11:14"},
                 "b": {"date": "2026-10-25", "start": "11:13", "end": "11:27"},
                 "c": {"date": "2026-10-25", "start": "11:00", "end": "11:14"}}
        matched = {pid: {"oralSlot": slot} for pid, slot in slots.items()}
        flag_overlapping_orals(papers, matched)
        for pid in ["a", "b"]:
            self.assertNotIn("oralSlot", matched[pid])
            self.assertIn("overlapping another oral", matched[pid]["oralSlotNote"])
        self.assertEqual(matched["c"], {"oralSlot": slots["c"]})

    def test_committed_oral_slots_do_not_overlap_within_a_room(self):
        read = lambda name: json.loads((ROOT / "data" / name).read_text())
        papers = read("papers.json")["papers"]
        anthology = read("anthology-catalog.json")
        ids, _ = match_papers(papers, anthology, read("anthology-overrides.json"))
        titles = {e["id"]: e["title"] for e in anthology["papers"]}
        matched, audit = match_presentations(papers, read("underline-catalog.json"), {pid: titles[aid] for pid, aid in ids.items()}, read("underline-overrides.json"))
        slots = {}
        for p in papers:
            slot = matched.get(p["id"], {}).get("oralSlot")
            if slot:
                slots.setdefault((slot["date"], p["room"]), []).append(slot)
        for group in slots.values():
            group.sort(key=lambda slot: slot["start"])
            for before, after in zip(group, group[1:]):
                self.assertLessEqual(before["end"], after["start"])
        self.assertEqual(audit["oralSlots"], 507)
        self.assertEqual({p["id"] for p in audit["oralSlotIssues"]}, {"809-MAIN", "1530-MAIN", "8261-MAIN", "244-IND", "530-IND", "532-IND", "610-IND", "615-IND", "886-IND"})


class PaginationTests(unittest.TestCase):
    def test_incomplete_duplicate_and_wrong_event_responses_are_rejected(self):
        row = {"id": "123", "type": "thin_lectures", "attributes": {"title": "A paper", "slug": "a-paper", "event_id": "535", "published": True, "held_at": "2026-10-25T10:00:00Z", "ends_at": "2026-10-25T10:12:00Z", "poster_lecture": False},
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
