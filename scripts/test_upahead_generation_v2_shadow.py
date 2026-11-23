"""Shadow-only immutable UpAhead v2 publisher regression and opposite cases."""
from __future__ import annotations

import copy
import hashlib
import subprocess
import itertools
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from upahead_identity import binding_alias, resolve_observations
from upahead_identity.generation import (
    build_generation, canonical_generation_payload, commit_generation,
    read_current, resolve_and_build,
)

NOW = 1_800_000_000_000
DAY = 86_400_000
SHA = "a" * 40


def row(n=1, **patch):
    return {"id": f"story-{n}", "url": f"https://source.example/event/{n}",
            "source": "listed-events", "category": "events",
            "title": f"Workshop {n}", "sourceAuthority": "event_listing",
            "eventStartAt": NOW + DAY, "expiryAt": NOW + 2 * DAY,
            "publishedAt": NOW - DAY, "lastVerifiedAt": NOW - 1000, **patch}


def bind(*rows):
    return {binding_alias(r): {"authorityRole": "organizer",
            "authorityNamespace": "test-organizer", "authorityOccurrenceId": "session-001",
            "evidenceRefs": ["https://organizer.example/sessions/001"],
            "adjudicatedBy": "fixture-only"} for r in rows}


def generate(rows, bindings=None, prior=None, stamp=NOW):
    return resolve_and_build(rows, source_commit=SHA, observed_at=stamp - 1000,
                             published_at=stamp, trusted_bindings=bindings, prior_ledger=prior)


class GenerationTests(unittest.TestCase):
    def test_unverified_rows_quarantine_and_do_not_surface_as_verified(self):
        result = generate([row(1), row(2)])
        self.assertEqual(result["payload"]["items"], [])
        self.assertEqual(len(result["payload"]["quarantine"]), 2)
        self.assertEqual(result["manifest"]["recordCounts"]["active"], 0)

    def test_verified_aliases_merge_with_custodial_links_preserved(self):
        rows = [row(1), row(2, title="Workshop 1, revised listing")]
        result = generate(rows, bind(*rows))
        self.assertEqual(len(result["payload"]["items"]), 1)
        self.assertEqual(len(result["payload"]["sourceAliases"]), 2)
        self.assertEqual(result["manifest"]["recordCounts"]["aliases"], 2)

    def test_source_order_determinism(self):
        rows = [row(1), row(2), row(3)]
        keys = set()
        for variant in itertools.permutations(rows):
            res = generate(list(variant), bind(*rows))
            keys.add((res["manifest"]["generationId"], res["manifest"]["semanticDigest"],
                      canonical_generation_payload(res["payload"])))
        self.assertEqual(len(keys), 1)

    def test_generation_changes_on_date_revision_but_id_preserved(self):
        r = row(1)
        first = generate([r], bind(r))
        moved = row(1, eventStartAt=NOW + 3*DAY, expiryAt=NOW + 4*DAY)
        next_gen = generate([moved], bind(r), first["ledger"], stamp=NOW+DAY)
        self.assertEqual(first["payload"]["items"][0]["canonicalOccurrenceId"],
                         next_gen["payload"]["items"][0]["canonicalOccurrenceId"])
        self.assertNotEqual(first["manifest"]["generationId"], next_gen["manifest"]["generationId"])

    def test_cancelled_stays_retired_across_reappearance(self):
        r = row(1)
        first = generate([r], bind(r))
        gone = row(1, status="CANCELLED")
        canceled = generate([gone], bind(r), first["ledger"])
        self.assertFalse(canceled["payload"]["items"])
        self.assertEqual(canceled["payload"]["retiredOccurrences"][0]["status"], "CANCELLED")
        again = generate([r], bind(r), canceled["ledger"])
        self.assertFalse(again["payload"]["items"])
        self.assertEqual(again["payload"]["retiredOccurrences"][0]["status"], "CANCELLED")

    def test_cancellation_survives_binding_promotion(self):
        original = row(1)
        cancelled = generate([row(1, status="CANCELLED")])

        promoted = generate([original], bind(original), cancelled["ledger"])

        self.assertEqual(promoted["payload"]["items"], [])
        retired, = promoted["payload"]["retiredOccurrences"]
        self.assertEqual(retired["status"], "CANCELLED")
        self.assertEqual(binding_alias(original), promoted["payload"]["sourceAliases"][0]["alias"])
        self.assertEqual(retired["canonicalOccurrenceId"],
                         promoted["payload"]["sourceAliases"][0]["canonicalOccurrenceId"])

    def test_cancellation_follows_a_verified_alias_without_reobserving_the_cancelled_listing(self):
        cancelled = row(1, sessionId="session-001", status="CANCELLED")
        corroborating = row(2, sessionId="session-001")
        separate = row(3, sessionId="session-002")
        bindings = bind(cancelled, corroborating, separate)
        bindings[binding_alias(separate)]["authorityOccurrenceId"] = "session-002"
        prior = json.loads(json.dumps(generate([cancelled])["ledger"]))

        result = generate([corroborating, separate], bindings, prior)
        self.assertEqual([item["title"] for item in result["payload"]["items"]], [separate["title"]])
        retired, = result["payload"]["retiredOccurrences"]
        self.assertEqual(retired["status"], "CANCELLED")
        aliases = {item["alias"]: item["canonicalOccurrenceId"] for item in result["payload"]["sourceAliases"]}
        self.assertEqual(aliases[binding_alias(corroborating)], retired["canonicalOccurrenceId"])

    def test_newer_same_alias_observation_cannot_hide_cancellation(self):
        original = row(1, revisionAt=NOW - 1)
        cancelled = row(1, revisionAt=NOW - 2, status="CANCELLED")
        result = generate([original, cancelled], bind(original))

        self.assertEqual(result["payload"]["items"], [])
        self.assertEqual(result["payload"]["retiredOccurrences"][0]["status"], "CANCELLED")

    def test_expired_does_not_get_new_validity_clock(self):
        r = row(1, eventStartAt=NOW - DAY, expiryAt=NOW - 100)
        result = generate([r], bind(r))
        self.assertEqual(result["payload"]["items"], [])
        self.assertEqual(result["payload"]["retiredOccurrences"][0]["status"], "EXPIRED")

    def test_verified_future_goes_pending_not_active(self):
        r = row(1, eventStartAt=NOW + 8*DAY, expiryAt=NOW+9*DAY)
        result = generate([r], bind(r))
        self.assertEqual(len(result["payload"]["pendingItems"]), 1)
        self.assertFalse(result["payload"]["items"])

    def test_beyond_pending_horizon_quarantined(self):
        r = row(1, eventStartAt=NOW + 190*DAY, expiryAt=NOW + 191*DAY)
        result = generate([r], bind(r))
        self.assertFalse(result["payload"]["pendingItems"])
        self.assertEqual(result["payload"]["quarantine"][0]["reason"], "BEYOND_PENDING_HORIZON")

    def test_missing_verified_expiry_fails_not_publishes(self):
        r = row(1, expiryAt=None)
        with self.assertRaisesRegex(ValueError, "expiryAt"):
            generate([r], bind(r))

    def test_untrusted_feed_claim_cannot_become_verified(self):
        r = row(1, verified=True, occurrenceId="free-text-feed-claim")
        self.assertFalse(generate([r])["payload"]["items"])

    def test_nonstandard_unicode_and_fractional_values_fail_canonicalization(self):
        p = generate([row(1)], bind(row(1)))["payload"]
        p["float"] = .1
        with self.assertRaises(ValueError):
            canonical_generation_payload(p)
        p.pop("float")
        p["unicode-é"] = "text"
        with self.assertRaises(ValueError):
            canonical_generation_payload(p)

    def test_invalid_commit_and_clock_refused(self):
        r = resolve_observations([row(1)], trusted_bindings=bind(row(1)))
        with self.assertRaisesRegex(ValueError, "Source commit"):
            build_generation(r, source_commit="HEAD", published_at=NOW, observed_at=NOW-1000)
        with self.assertRaisesRegex(ValueError, "Observation clock"):
            build_generation(r, source_commit=SHA, published_at=NOW, observed_at=NOW+1)

    def test_atomic_pointer_survives_interrupted_generation(self):
        one = generate([row(1)], bind(row(1)))
        two = generate([row(2)], bind(row(2)), stamp=NOW+1000)
        with tempfile.TemporaryDirectory() as td:
            first = commit_generation(td, one)
            for phase in ("after-ledger", "after-payload", "after-manifest"):
                with self.assertRaisesRegex(RuntimeError, "Injected"):
                    commit_generation(td, two, expected_current_generation=first, inject_failure=phase)
                self.assertEqual(read_current(td)["manifest"]["generationId"], first)
            second = commit_generation(td, two, expected_current_generation=first)
            self.assertEqual(read_current(td)["manifest"]["generationId"], second)
            self.assertNotEqual(first, second)

    def test_immutable_ledger_recovery_from_pointer(self):
        one = generate([row(1)], bind(row(1)))
        with tempfile.TemporaryDirectory() as td:
            generation_id = commit_generation(td, one)
            directory_name = generation_id.replace(":", "-")
            self.assertTrue((Path(td) / "generations" / directory_name / "manifest.json").is_file())
            restored = read_current(td)
            self.assertEqual(restored["ledger"], one["ledger"])
            self.assertEqual(restored["manifest"], one["manifest"])

    def test_detects_pointer_tampering_and_refuses_to_initialize_over_it(self):
        one = generate([row(1)], bind(row(1)))
        with tempfile.TemporaryDirectory() as td:
            commit_generation(td, one)
            target = Path(td) / "current.json"
            pointer = json.loads(target.read_text())
            pointer["payloadDigest"] = "sha256:" + "0"*64
            target.write_text(json.dumps(pointer))
            with self.assertRaisesRegex(ValueError, "mismatched payload"):
                read_current(td)
            with self.assertRaisesRegex(ValueError, "mismatched payload"):
                commit_generation(td, one)

    def test_rejects_stale_writer_after_other_generation_committed(self):
        one = generate([row(1)], bind(row(1)))
        two = generate([row(2)], bind(row(2)), stamp=NOW+1000)
        with tempfile.TemporaryDirectory() as td:
            first = commit_generation(td, one)
            commit_generation(td, two, expected_current_generation=first)
            with self.assertRaisesRegex(ValueError, "fencing mismatch"):
                commit_generation(td, one, expected_current_generation=first)

    def test_lock_file_blocks_concurrent_writer(self):
        one = generate([row(1)], bind(row(1)))
        with tempfile.TemporaryDirectory() as td:
            (Path(td) / ".generation-writer.lock").write_text("locked")
            with self.assertRaisesRegex(RuntimeError, "publisher lock"):
                commit_generation(td, one)

    def test_immutable_artifact_refuses_divergent_contents(self):
        one = generate([row(1)], bind(row(1)))
        with tempfile.TemporaryDirectory() as td:
            commit_generation(td, one)
            directory_name = one["manifest"]["generationId"].replace(":", "-")
            path = Path(td) / "generations" / directory_name / "payload.json"
            path.write_text("{}")
            with self.assertRaisesRegex(ValueError, "mismatched payload"):
                read_current(td)

    def test_cli_sha_pin_required_and_dry_run_is_non_mutating(self):
        r = row(1)
        with tempfile.TemporaryDirectory() as td:
            fixture = Path(td) / "observation.json"
            raw = json.dumps([r], ensure_ascii=False).encode("utf8")
            fixture.write_bytes(raw)
            args = [sys.executable, str(Path(__file__).parent / "build_upahead_v2_shadow.py"),
                "--observations", str(fixture), "--observations-sha256", "sha256:"+hashlib.sha256(raw).hexdigest(),
                "--source-commit", SHA, "--observed-at-ms", str(NOW-1000),
                "--published-at-ms", str(NOW), "--output", str(Path(td) / "generated")]
            dry = subprocess.run([*args, "--dry-run"], text=True, capture_output=True)
            self.assertEqual(dry.returncode, 0, dry.stderr)
            self.assertFalse((Path(td) / "generated" / "current.json").exists())
            bad = args.copy()
            bad[bad.index("--observations-sha256") + 1] = "sha256:" + "0"*64
            denied = subprocess.run(bad, text=True, capture_output=True)
            self.assertNotEqual(denied.returncode, 0)
            self.assertFalse((Path(td) / "generated" / "current.json").exists())
            written = subprocess.run(args, text=True, capture_output=True)
            self.assertEqual(written.returncode, 0, written.stderr)
            self.assertEqual(len(read_current(Path(td)/"generated")["payload"]["items"]), 0)
            repeat = subprocess.run(args, text=True, capture_output=True)
            self.assertNotEqual(repeat.returncode, 0)
            self.assertIn("Expected current generation", repeat.stderr)

    def test_realistic_float_metadata_in_ledger_is_supported_without_float_in_public_payload(self):
        r = row(1, localityScore=.8, actionabilityScore=.75)
        gen = generate([r], bind(r))
        self.assertIn("ledgerDigest", gen["manifest"])
        with tempfile.TemporaryDirectory() as td:
            commit_generation(td, gen)
            self.assertEqual(read_current(td)["ledger"], gen["ledger"])

    def test_no_independent_url_or_portable_issuer_authority_in_hash(self):
        # Cryptographic consistency is NOT trusted publisher/curator identity.
        r = row(1)
        result = generate([r], bind(r))
        self.assertIn("semanticDigest", result["manifest"])
        self.assertNotIn("sourceVerified", result["manifest"])


if __name__ == "__main__":
    unittest.main()
