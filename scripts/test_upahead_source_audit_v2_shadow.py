"""P3-B source custody, negative controls and exact 98+11 original data replay."""
from __future__ import annotations

import json
import os
import pathlib
import tempfile
import subprocess
import unittest

from upahead_identity.source_audit import (
    audit_full_source_snapshot, load_frozen_snapshot, potential_review_clusters,
    review_title_key, read_pinned_git_blob,
)

ROOT = pathlib.Path(__file__).resolve().parents[1]
PATH = ROOT / "public" / "data" / "up_ahead.json"
# Exact file as published in the PR #201 branch; upstream Git content has NBSPs.
# Never substitute the normalized Google Docs text or a parsed/re-serialized copy.
SHA256 = "7bb3d491cf4df3c8ef1f57c479655e3e58141a5cd7bd95012bfc6b70f6d2d2f3"
BLOB = "7642efed72b6e733c7f9e5891c6a644317f71d16"
COMMIT = "c9c5420bdaa31fb5e91c4940d7af9b0b01347a82"


def member(identifier: str, title: str = "IoT and Robotics ROS 2-Day Workshop", **fields):
    return dict({"id": identifier, "title": title, "category": "events",
                 "sourceGroup": "organizer-feed", "source": "Organizer", "city": "Chennai",
                 "eventStartAt": 1795235400000, "expiryAt": 1795372200000}, **fields)


class FullSnapshotAuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # In CI, read immutable history, not the latest publisher output.
        source = read_pinned_git_blob(ROOT, git_blob=BLOB) if (ROOT / ".git").exists() else PATH
        cls.snapshot = load_frozen_snapshot(source, sha256=SHA256, git_blob=BLOB)

    def test_full_raw_bytes_readback_exact_file(self):
        self.assertEqual(self.snapshot["schemaVersion"], 1)
        self.assertEqual(len(self.snapshot["items"]), 98)
        self.assertEqual(len(self.snapshot["pendingItems"]), 11)
        self.assertEqual(len(self.snapshot["retiredRevisions"]), 321)
        self.assertEqual(self.snapshot["fetchedAt"], 1795310618380)

    def test_actual_python_resolver_and_shadow_publisher_replay_all_109(self):
        report = audit_full_source_snapshot(self.snapshot, source_sha256=SHA256,
                                            source_git_blob=BLOB, source_commit=COMMIT)
        self.assertEqual(report["inputCounts"], {"active": 98, "pending": 11,
                                                   "retiredRevisionMetadata": 321,
                                                   "totalReplayed": 109})
        self.assertEqual(report["unverifiedObservationCount"], 109)
        self.assertEqual(report["verifiedActive"], 0)
        self.assertEqual(report["verifiedPending"], 0)
        self.assertEqual(report["identityMergeCount"], 0)
        self.assertEqual(report["missingSessionIdCount"], 109)
        self.assertEqual(report["missingVerifiedClockCount"], 109)
        self.assertEqual(report["authorization"], "WITHHELD_UNTIL_ORIGINAL_ISSUER_EVIDENCE_AND_INDEPENDENT_ADJUDICATION")

    def test_real_snapshot_has_five_workshop_triples_only_review_candidates(self):
        report = audit_full_source_snapshot(self.snapshot, source_sha256=SHA256,
                                            source_git_blob=BLOB, source_commit=COMMIT)
        candidates = [r for r in report["reviewOnlyClusters"] if r["count"] == 3]
        self.assertEqual(len(candidates), 5)
        self.assertEqual(sum(r["count"] for r in candidates), 15)
        self.assertEqual(len({source for r in candidates for source in r["sourceIds"]}), 15)
        self.assertTrue(all(x["status"].startswith("REVIEW_ONLY") for x in candidates))
        self.assertEqual(sum(r["count"] for r in report["reviewOnlyClusters"]), 15)

    def test_source_order_does_not_change_shadow_generation_or_review_groups(self):
        fwd = audit_full_source_snapshot(self.snapshot, source_sha256=SHA256,
                                         source_git_blob=BLOB, source_commit=COMMIT)
        back = {**self.snapshot, "items": list(reversed(self.snapshot["items"])),
                "pendingItems": list(reversed(self.snapshot["pendingItems"]))}
        rev = audit_full_source_snapshot(back, source_sha256=SHA256,
                                         source_git_blob=BLOB, source_commit=COMMIT)
        self.assertEqual(fwd, rev)

    def test_replacing_even_one_source_byte_fails_custody(self):
        raw = read_pinned_git_blob(ROOT, git_blob=BLOB) if (ROOT / ".git").exists() else PATH.read_bytes()
        with self.assertRaisesRegex(ValueError, "differ from both pinned"):
            load_frozen_snapshot(raw.replace(b"schemaVersion", b"schEmaVersion", 1),
                                 sha256=SHA256, git_blob=BLOB)
        with self.assertRaisesRegex(ValueError, "differ from both pinned"):
            load_frozen_snapshot(raw.replace(b"\xc2\xa0", b" "), sha256=SHA256, git_blob=BLOB)

    def test_formatting_change_even_if_semantically_equal_fails_custody(self):
        raw = read_pinned_git_blob(ROOT, git_blob=BLOB) if (ROOT / ".git").exists() else PATH.read_bytes()
        obj = json.loads(raw)
        reformatted = json.dumps(obj).encode("utf-8")
        with self.assertRaisesRegex(ValueError, "differ from both pinned"):
            load_frozen_snapshot(reformatted, sha256=SHA256, git_blob=BLOB)

    def test_invalid_pins_missing_collections_and_empty_records_fail_closed(self):
        raw = read_pinned_git_blob(ROOT, git_blob=BLOB) if (ROOT / ".git").exists() else PATH.read_bytes()
        for kwargs in ({"sha256": "bad", "git_blob": BLOB}, {"sha256": SHA256, "git_blob": "bad"}):
            with self.assertRaisesRegex(ValueError, "pins are mandatory"):
                load_frozen_snapshot(raw, **kwargs)
        malformed = {"schemaVersion": 1, "fetchedAt": 1800000000000,
                     "items": [member("one")], "pendingItems": [], "retiredRevisions": None}
        blob = json.dumps(malformed).encode()
        import hashlib
        sha = hashlib.sha256(blob).hexdigest()
        git = hashlib.sha1(b"blob " + str(len(blob)).encode() + b"\x00" + blob).hexdigest()
        with self.assertRaisesRegex(ValueError, "Missing published source collection"):
            load_frozen_snapshot(blob, sha256=sha, git_blob=git)

    def test_review_only_group_does_not_cross_source_or_category(self):
        a = member("a")
        rows = [a, member("b", sourceGroup="different-feed"),
                member("c", category="movies"), member("d", city="Muscat")]
        self.assertEqual(potential_review_clusters(rows), [])

    def test_same_title_different_explicit_sessions_not_even_grouped(self):
        rows = [member("a", sessionId="session-A"), member("b", sessionId="session-B")]
        self.assertEqual(potential_review_clusters(rows), [])

    def test_same_venue_different_title_not_grouped(self):
        rows = [member("a", title="IoT and Robotics ROS Workshop", venue="Research Park"),
                member("b", title="Paludarium Workshop", venue="Research Park")]
        self.assertEqual(potential_review_clusters(rows), [])

    def test_time_shift_and_day_change_do_not_group(self):
        rows = [member("a"), member("b", eventStartAt=1795325400000)]
        self.assertEqual(potential_review_clusters(rows), [])

    def test_review_index_is_normalized_but_never_an_authoritative_id(self):
        self.assertEqual(review_title_key("IoT and Robotics (ROS) – 2 Days Workshop"),
                         review_title_key("IoT and Robotics – ROS Workshop"))
        self.assertNotEqual(review_title_key("IoT and Robotics – ROS Workshop"),
                            review_title_key("AI in Film Making Workshop"))

    def test_duplicate_id_is_rejected_even_across_pending_boundary(self):
        case = {"schemaVersion": 1, "fetchedAt": 1800000000000,
                "items": [member("same")], "pendingItems": [member("same")], "retiredRevisions": []}
        raw = json.dumps(case).encode()
        import hashlib
        sha = hashlib.sha256(raw).hexdigest()
        git = hashlib.sha1(b"blob " + str(len(raw)).encode()+b"\x00"+raw).hexdigest()
        with self.assertRaisesRegex(ValueError, "Duplicate source ID"):
            load_frozen_snapshot(raw, sha256=sha, git_blob=git)

    def test_retired_legacy_ids_are_unique_and_not_resurrected(self):
        rows = self.snapshot["items"] + self.snapshot["pendingItems"]
        current = {(x["category"], x["id"]) for x in rows}
        retired = [tuple(x["identity"]) for x in self.snapshot["retiredRevisions"]]
        self.assertEqual(len(retired), 321)
        self.assertEqual(len(set(retired)), 321)
        self.assertFalse(current.intersection(retired))

    def test_conflicting_legacy_retirement_fails_closed(self):
        import hashlib
        sample = {"schemaVersion": 1, "fetchedAt": 1800000000000,
                  "items": [member("one")], "pendingItems": [],
                  "retiredRevisions": [{"identity": ["events", "one"],
                                         "retiredAt": 1800000000000}]}
        def pinned(o):
            b = json.dumps(o).encode()
            digest = hashlib.sha256(b).hexdigest()
            git = hashlib.sha1(b"blob " + str(len(b)).encode()+b"\0"+b).hexdigest()
            return b,digest,git
        raw,sha,blob = pinned(sample)
        with self.assertRaisesRegex(ValueError,"Retired legacy identity"):
            load_frozen_snapshot(raw,sha256=sha,git_blob=blob)
        sample["retiredRevisions"] = [
            {"identity": ["events", "two"]},
            {"identity": ["events", "two"]}]
        raw,sha,blob = pinned(sample)
        with self.assertRaisesRegex(ValueError,"Duplicate retired revision identity"):
            load_frozen_snapshot(raw,sha256=sha,git_blob=blob)

    def test_snapshot_not_mutated_by_replay(self):
        before = json.dumps(self.snapshot, ensure_ascii=False, sort_keys=True)
        audit_full_source_snapshot(self.snapshot, source_sha256=SHA256,
                                   source_git_blob=BLOB, source_commit=COMMIT)
        self.assertEqual(json.dumps(self.snapshot, ensure_ascii=False, sort_keys=True), before)


if __name__ == "__main__":
    unittest.main()
