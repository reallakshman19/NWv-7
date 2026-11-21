"""Fail-closed mirror contracts; no network or Cloudflare account access required."""
import copy
import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("mirror_cloudflare_sections.py")
spec = importlib.util.spec_from_file_location("mirror_cloudflare_sections", SCRIPT)
mirror_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mirror_module)

NOW = 1_795_229_000_000
DIGEST = "d" * 64


def example(generation=4, epoch="live-good", **overrides):
    record = {
        "schemaVersion": 2,
        "fetchedAt": NOW - 10 * 60_000,
        "contentHash": DIGEST[:12],
        "sections": {
            "entertainment": [
                {
                    "title": "Verified entertainment publication",
                    "url": "https://publisher.example/story",
                    "source": "Example publisher",
                    "publishedAt": NOW - 30 * 60_000,
                    "timestampConfidence": "high",
                }
            ],
            "world": [],
        },
        "preview": {
            "dataSource": "cloudflare_d1",
            "mode": "cloudflare_preview",
            "servingAuthority": "github_static",
            "evidenceVerified": True,
            "projectionSource": "committed_evidence",
            "epochId": epoch,
            "pointerGeneration": generation,
            "committedAt": NOW - 20 * 60_000,
            "decisionOutputDigest": DIGEST,
        },
    }
    record.update(overrides)
    return record


def body(record):
    return json.dumps(record, separators=(",", ":"), sort_keys=True).encode()


class CloudflareMirrorContractTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        folder = Path(self.temp.name)
        self.snap = folder / "sections_cloudflare_latest.json"
        self.manifest = folder / "sections_cloudflare_manifest.json"

    def publish(self, data):
        return mirror_module.mirror(body(data), NOW, self.snap, self.manifest)

    def reject(self, data):
        with self.assertRaises(mirror_module.MirrorRejected):
            self.publish(data)

    def test_publishes_exact_source_bytes_and_digest(self):
        source = body(example())
        self.assertEqual(mirror_module.mirror(source, NOW, self.snap, self.manifest), "UPDATED")
        self.assertEqual(self.snap.read_bytes(), source)
        manifest = json.loads(self.manifest.read_text())
        self.assertEqual(manifest["sha256"], hashlib.sha256(source).hexdigest())
        self.assertEqual(manifest["epochId"], "live-good")
        self.assertEqual(manifest["sectionCounts"]["entertainment"], 1)
        self.assertEqual(manifest["usableStoryCount"], 1)
        self.assertEqual(manifest["servingAuthority"], "github_static")

    def test_same_epoch_immutable_no_op(self):
        self.assertEqual(self.publish(example()), "UPDATED")
        before = self.manifest.read_bytes()
        self.assertEqual(self.publish(example()), "UNCHANGED")
        self.assertEqual(self.manifest.read_bytes(), before)

    def test_rejects_unauthorized_or_uncommitted_preview(self):
        for mutation in [
            {"evidenceVerified": False},
            {"mode": "cloudflare_primary"},
            {"dataSource": "github_static"},
            {"servingAuthority": "cloudflare"},
            {"projectionSource": "incomplete"},
            {"epochId": ""},
            {"decisionOutputDigest": "ab"},
        ]:
            with self.subTest(mutation=mutation):
                candidate = example()
                candidate["preview"].update(mutation)
                self.reject(candidate)

    def test_rejects_stale_future_and_empty(self):
        self.reject(example(fetchedAt=NOW - 13 * 3600_000))
        self.reject(example(fetchedAt=NOW + 10 * 60_000))
        self.reject(example(sections={"entertainment": []}))
        old = example()
        old["sections"]["entertainment"][0]["publishedAt"] = NOW - 40 * 3600_000
        self.reject(old)

    def test_rejects_stale_committed_epoch_even_if_fetched_at_is_recent(self):
        candidate = example()
        candidate["preview"]["committedAt"] = NOW - 13 * 3600_000
        self.reject(candidate)

    def test_rejects_bad_digest_prefix(self):
        self.reject(example(contentHash="bad"))

    def test_rollbacks_and_changed_same_epoch_preserve_previous_files(self):
        self.publish(example())
        original = self.snap.read_bytes()
        original_manifest = self.manifest.read_bytes()

        older = example(generation=3, epoch="older")
        self.reject(older)

        changed = example()
        changed["sections"]["entertainment"][0]["title"] = "Changed after commit"
        self.reject(changed)

        forged = example(generation=4, epoch="other-epoch")
        self.reject(forged)

        self.assertEqual(self.snap.read_bytes(), original)
        self.assertEqual(self.manifest.read_bytes(), original_manifest)

    def test_next_committed_epoch_advances(self):
        self.publish(example())
        new = example(generation=5, epoch="next-epoch")
        new["preview"]["committedAt"] = NOW - 5 * 60_000
        new["preview"]["decisionOutputDigest"] = "a" * 64
        new["contentHash"] = "a" * 12
        self.assertEqual(self.publish(new), "UPDATED")
        self.assertEqual(json.loads(self.manifest.read_text())["epochId"], "next-epoch")

    def test_tampered_previous_snapshot_rejected(self):
        self.publish(example())
        self.snap.write_bytes(b"tampered")
        self.reject(example(generation=5, epoch="next"))

    def test_previous_partial_mirror_rejected(self):
        self.manifest.write_text("{}")
        self.reject(example())


if __name__ == "__main__":
    unittest.main()
