"""Cold-source-independent adversarial assertions for the v2 SHADOW identity engine.

This is NOT an acceptance test of the production publisher/browser/Planner.
Historical workshop titles are source-derived; curator evidence is synthetic in
positive controls and cannot be interpreted as original organizer confirmation.
"""
import copy
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from upahead_identity import binding_alias, resolve_observations

START = 1795235400000
END = 1795372200000
BASE = {"category": "events", "source": "chennai2go", "sourceGroup": "chennai-calendar",
        "sourceAuthority": "event_listing", "city": "Chennai", "venue": "IIT Madras Research Park",
        "eventStartAt": START, "eventEndAt": END, "publishedAt": 1795000000000}
TITLES = ["AI & Bioinformatics Workshop", "AI & Bioinformatics 2-Day Workshop",
          "AI & Bioinformatics – 2 Days Workshop"]
IDS = ["04af6404691c6a67e4451a6b", "29112f7ef256f8e5942e9cc4", "42b3fd69a107863bf53237af"]
URLS = ["https://chennai2go.in/event/ai-bioinformatics-workshop-20261121-15e0c7",
        "https://chennai2go.in/event/ai-bioinformatics-2-day-workshop-20261121-4e305b",
        "https://chennai2go.in/event/ai-bioinformatics-2-days-workshop-20261121-d80372"]


def row(n, **patch):
    return {**BASE, "id": IDS[n], "title": TITLES[n], "url": URLS[n], **patch}


def trusted(rows, identifier="workshop-bio-21-nov-2026", session=""):
    """Simulated externally-adjudicated bindings, NOT real organizer proof."""
    b = {"authorityRole": "organizer", "authorityNamespace": "techobytes",
         "authorityOccurrenceId": identifier, "evidenceRefs": ["https://tbytes.mojo.page/mea"],
         "adjudicatedBy": "test-curator"}
    return {binding_alias(r): copy.deepcopy(b) for r in rows}


class TestOccurrenceIdentityShadow(unittest.TestCase):
    def test_unbound_source_variants_are_not_silently_merged(self):
        result = resolve_observations([row(i) for i in range(3)])
        self.assertEqual(len(result["occurrences"]), 3)
        self.assertTrue(all(x["decision"] == "UNVERIFIED" for x in result["occurrences"]))

    def test_untrusted_raw_claims_do_not_authorize_merge(self):
        rows = [row(i, occurrenceId="invented", verified=True) for i in range(3)]
        self.assertEqual(len(resolve_observations(rows)["occurrences"]), 3)

    def test_explicit_curator_bindings_merge_with_all_sources_retained(self):
        rows = [row(i) for i in range(3)]
        result = resolve_observations(rows, trusted_bindings=trusted(rows))
        self.assertEqual(len(result["occurrences"]), 1)
        item = result["occurrences"][0]
        self.assertEqual(len(item["sourceAliases"]), 3)
        self.assertEqual(len(item["evidenceRefs"]), 1)
        self.assertEqual(len(item["sourceDigests"]), 3)
        self.assertEqual(item["decision"], "VERIFIED_BINDING")

    def test_input_permutation_is_byte_deterministic(self):
        import itertools
        rows = [row(i) for i in range(3)]
        bindings = trusted(rows)
        outputs = [json.dumps(resolve_observations(list(p), trusted_bindings=bindings), sort_keys=True)
                   for p in itertools.permutations(rows)]
        self.assertEqual(len(set(outputs)), 1)

    def test_different_program_same_venue_time_stays_separate(self):
        rows = [row(i) for i in range(3)]
        other = row(0, title="Master Generative AI - 2 Day Workshop", id="other-workshop",
                    url="https://chennai2go.in/event/master-generative-ai")
        bindings = trusted(rows)
        result = resolve_observations([other, *rows], trusted_bindings=bindings)
        self.assertEqual(len(result["occurrences"]), 2)

    def test_distinct_session_ids_with_erroneous_shared_binding_fail_closed(self):
        a, b = row(0, sessionId="cohort-A"), row(1, sessionId="cohort-B")
        result = resolve_observations([a, b], trusted_bindings=trusted([a, b]))
        self.assertEqual(len(result["occurrences"]), 2)
        self.assertTrue(all(x["decision"] == "REVIEW" for x in result["occurrences"]))
        self.assertEqual(result["reviewCandidates"][0]["reason"], "SESSION_SCOPE_CONFLICT")

    def test_known_and_unknown_session_conflict_is_not_equivalence(self):
        a, b = row(0, sessionId="cohort-A"), row(1)
        result = resolve_observations([a, b], trusted_bindings=trusted([a, b]))
        self.assertEqual(len(result["occurrences"]), 2)

    def test_absent_session_cannot_merge_without_binding(self):
        a, b = row(0, sessionId=""), row(1, sessionId="")
        result = resolve_observations([a, b])
        self.assertEqual(len(result["occurrences"]), 2)

    def test_reschedule_preserves_bound_id(self):
        a = row(0, sessionId="cohort-A", firstVisibleAt=1795000000000)
        bindings = trusted([a])
        initial = resolve_observations([a], trusted_bindings=bindings)
        moved = row(0, sessionId="cohort-A", eventStartAt=START + 7*86400000,
                    eventEndAt=END + 7*86400000, revisionAt=1795010000000)
        updated = resolve_observations([moved], trusted_bindings=bindings, prior_ledger=initial["ledger"])
        first = initial["occurrences"][0]
        second = updated["occurrences"][0]
        self.assertEqual(first["canonicalOccurrenceId"], second["canonicalOccurrenceId"])
        self.assertEqual(first["firstVisibleAt"], second["firstVisibleAt"])

    def test_cancellation_cannot_be_resurrected_by_old_feed(self):
        a = row(0)
        bind = trusted([a])
        initial = resolve_observations([a], trusted_bindings=bind)
        canceled = resolve_observations([{**a, "status": "CANCELLED", "revisionAt":1795020000000}],
                                        trusted_bindings=bind, prior_ledger=initial["ledger"])
        reissued = resolve_observations([a], trusted_bindings=bind, prior_ledger=canceled["ledger"])
        self.assertEqual(reissued["occurrences"][0]["status"], "CANCELLED")

    def test_ordinary_refresh_cannot_slide_first_visible(self):
        original = row(0, firstVisibleAt=1795000000000)
        one = resolve_observations([original])
        two = resolve_observations([row(0, firstVisibleAt=1795250000000)], prior_ledger=one["ledger"])
        self.assertEqual(two["occurrences"][0]["firstVisibleAt"], 1795000000000)

    def test_legacy_alias_change_emits_migration_proposal(self):
        a = row(0)
        prior = resolve_observations([a])
        current = resolve_observations([a], trusted_bindings=trusted([a]), prior_ledger=prior["ledger"])
        self.assertEqual(len(current["aliasRedirectProposals"]), 1)
        self.assertEqual(current["aliasRedirectProposals"][0]["status"], "NEEDS_PLANNER_MIGRATION_REVIEW")

    def test_scope_separates_categories_even_with_shared_official_identifier(self):
        a = row(0)
        b = row(1, category="weather_alerts")
        bindings = trusted([a,b], identifier="same-key-not-cross-category")
        result = resolve_observations([a,b], trusted_bindings=bindings)
        self.assertEqual(len(result["occurrences"]), 2)

    def test_broken_prior_schema_fails_closed(self):
        with self.assertRaises(ValueError):
            resolve_observations([row(0)], prior_ledger={"schemaVersion": "unknown"})

    def test_uncustodied_binding_does_not_merge(self):
        rows = [row(0), row(1)]
        b = trusted(rows)
        for item in b.values():
            item["evidenceRefs"] = []
        self.assertEqual(len(resolve_observations(rows, trusted_bindings=b)["occurrences"]), 2)

    def test_same_source_alias_conflicting_slot_fails_closed(self):
        a = row(0)
        b = row(0, eventStartAt=START + 3*86400000)
        with self.assertRaises(ValueError):
            resolve_observations([a,b])

    def test_source_article_revisions_preserve_all_digests(self):
        a = row(0)
        b = row(0, summary="updated source", revisionAt=1795200000000)
        result = resolve_observations([a,b])
        self.assertEqual(len(result["occurrences"]), 1)
        self.assertEqual(len(result["occurrences"][0]["sourceDigests"]), 2)


if __name__ == "__main__":
    unittest.main()
