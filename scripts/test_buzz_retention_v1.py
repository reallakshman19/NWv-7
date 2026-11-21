"""Buzz rolling retention: 36h freshness, true source-only renewal, 7d cap, outage and byte limits."""
from __future__ import annotations

import copy
import unittest

from build_buzz_retained import (
    DAY, H, MAX_BYTES, MAX_ITEMS, RetentionRejected, build, deadlines, json_bytes,
)
from validate_buzz_retained import validate

NOW = 1_800_000_000_000


def story(ident="s", *, section="entertainment", hours_old=1, **fields):
    result = {
        "id": ident, "title": "Verified publisher entertainment article " + ident,
        "url": "https://publisher.example/buzz/" + ident,
        "publishedAt": NOW - hours_old * H,
        "source": "Publisher RSS", "sourceGroup": "publisher",
        "publishedAtSource": "feed_timestamp", "timestampConfidence": "high",
        "category": section,
    }
    result.update(fields)
    return result


def source(items=None, when=NOW, section="entertainment"):
    return {"schemaVersion": 2, "fetchedAt": when, "contentHash": "fixture",
            "sections": {section: items if items is not None else []}}


class BuzzRetentionTests(unittest.TestCase):
    def publish(self, source_data, old=None, when=NOW):
        snapshot, report = build(source_data, old or {}, when)
        self.assertFalse(validate(snapshot, report, when), "publication must qualify")
        return snapshot, report

    def test_first_collection_keeps_original_clock(self):
        result, report = self.publish(source([story()]))
        self.assertEqual(len(result["items"]), 1)
        row = result["items"][0]
        self.assertEqual(row["publishedAt"], NOW - H)
        self.assertEqual(row["lastVerifiedAt"], NOW)
        self.assertEqual(row["retention"]["freshUntil"], NOW + 35 * H)
        self.assertEqual(row["retention"]["displayUntil"], NOW + 36 * H)

    def test_feed_goes_empty_overnight_but_eligible_row_survives(self):
        first, _ = self.publish(source([story()]))
        second, report = self.publish(source([], when=NOW + 8 * H), first, NOW + 8 * H)
        self.assertEqual(second["items"][0]["publishedAt"], NOW - H)
        self.assertEqual(second["items"][0]["lastVerifiedAt"], NOW)
        self.assertEqual(report["sourceReverifiedRows"], 0)
        self.assertEqual(report["retainedAcrossSourceGap"], 1)

    def test_reappearance_renews_but_never_publisher_timestamp(self):
        first, _ = self.publish(source([story(hours_old=30)]))
        repeated = source([story(hours_old=30, title="Publisher updates headline")], when=NOW + 29 * H)
        renewed, report = self.publish(repeated, first, NOW + 29 * H)
        self.assertEqual(renewed["items"][0]["publishedAt"], NOW - 30 * H)
        self.assertEqual(renewed["items"][0]["retention"]["displayUntil"], NOW + 65 * H)
        self.assertEqual(report["sourceReverifiedRows"], 1)
        replay, replay_report = self.publish(repeated, renewed, NOW + 30 * H)
        self.assertEqual(replay["items"][0]["lastVerifiedAt"], NOW + 29 * H)
        self.assertEqual(replay_report["sourceReverifiedRows"], 0)

    def test_cap_never_exceeds_seven_days(self):
        first, _ = self.publish(source([story(hours_old=150)]))
        self.assertLessEqual(first["items"][0]["retention"]["displayUntil"], NOW + 18 * H)
        # A renewed source observation near the seventh day cannot extend the hard ceiling.
        row = first["items"][0]
        row["lastVerifiedAt"] = NOW + 15 * H
        self.assertEqual(deadlines(row)["displayUntil"], row["publishedAt"] + 7 * DAY)

    def test_social_caps_to_three_days(self):
        social = story(section="social", title="Viral social media trend", hours_old=70)
        first, _ = self.publish(source([social], section="social"))
        self.assertEqual(first["items"][0]["retention"]["displayUntil"], NOW + 2 * H)

    def test_explicit_expiry_and_withdrawal(self):
        row = story(expiryAt=NOW + H)
        first, _ = self.publish(source([row]))
        self.assertEqual(first["items"][0]["retention"]["displayUntil"], NOW + H)
        with self.assertRaises(RetentionRejected):
            self.publish(source([{**row, "status": "withdrawn"}], when=NOW + H), first, NOW + H)

    def test_stale_or_future_source_cannot_reverify_evidence(self):
        first, _ = self.publish(source([story(hours_old=12)]))
        retained, report = self.publish(
            source([story(hours_old=12)], when=NOW - 16 * H), first, NOW + 8 * H)
        self.assertEqual(retained["items"][0]["lastVerifiedAt"], NOW)
        self.assertFalse(report["source"]["eligible"])
        with self.assertRaises(RetentionRejected):
            build(source([story()], when=NOW + H), {}, NOW)

    def test_no_fabricated_timestamps_and_untrusted_urls(self):
        bad = [
            story(publishedAt=0), story(timestampConfidence="low"),
            story(publishedAtSource="fetch_time_fallback"),
            story(url="javascript:alert(1)"),
            story(publishedAt=NOW + H),
        ]
        with self.assertRaises(RetentionRejected):
            build(source(bad), {}, NOW)

    def test_bounded_400_and_byte_budget(self):
        many = [story(str(i)) for i in range(MAX_ITEMS + 15)]
        result, report = self.publish(source(many))
        self.assertEqual(len(result["items"]), MAX_ITEMS)
        self.assertEqual(result["metrics"]["rejectedByCapacity"], 15)
        self.assertLessEqual(len(json_bytes(result)), MAX_BYTES)
        self.assertEqual(report["metrics"]["accepted"], MAX_ITEMS)

    def test_byte_budget_counts_actual_formatted_json(self):
        large = [story(str(i), summary="A" * 180_000) for i in range(30)]
        result, report = self.publish(source(large))
        self.assertLess(len(result["items"]), 30)
        self.assertGreater(result["metrics"]["rejectedByBytes"], 0)
        self.assertLessEqual(len(json_bytes(result)), MAX_BYTES)

    def test_validator_finds_tampering(self):
        result, report = self.publish(source([story()]))
        altered = copy.deepcopy(result)
        altered["items"][0]["publishedAt"] += H
        self.assertIn("item_digest_mismatch", validate(altered, report, NOW))
        altered = copy.deepcopy(result)
        altered["items"][0]["retention"]["displayUntil"] += H
        self.assertIn("stored_lifecycle_deadline_mismatch", validate(altered, report, NOW))


if __name__ == "__main__":
    unittest.main()
