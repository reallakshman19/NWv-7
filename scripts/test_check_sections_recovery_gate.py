"""Deterministic negative tests for scheduled Sections publication safety."""
import unittest

from check_sections_recovery_gate import validate_recovery

NOW = 1792998000000


def article(section, index=1, group="bbc", published_at=NOW - 60_000):
    return {
        "id": f"{section}-{index}-{group}",
        "title": f"{section} genuine news {index}",
        "url": f"https://example.com/{section}/{index}/{group}",
        "sourceGroup": group,
        "publishedAt": published_at,
        "publishedAtSource": "published_parsed",
        "timestampConfidence": "high",
    }


def snapshot():
    sections = {
        section: [article(section)] for section in
        ("topStories", "india", "tn", "muscat", "technology", "business")
    }
    sections["world"] = [article("world", 1, "bbc"), article("world", 2, "the_hindu")]
    return {
        "schemaVersion": 2,
        "fetchedAt": NOW - 60_000,
        "contentHash": "real-hash-from-data",
        "sections": sections,
    }


class PublicationSafetyTests(unittest.TestCase):
    def test_current_multi_source_snapshot_passes(self):
        self.assertEqual(validate_recovery(snapshot(), NOW), [])

    def test_july_stale_snapshot_is_rejected(self):
        data = snapshot()
        data["fetchedAt"] = NOW - 90 * 24 * 60 * 60 * 1000
        self.assertTrue(validate_recovery(data, NOW))

    def test_future_snapshot_is_rejected(self):
        data = snapshot()
        data["fetchedAt"] = NOW + 10 * 60 * 1000
        self.assertTrue(validate_recovery(data, NOW))

    def test_empty_world_rejected_even_when_snapshot_header_fresh(self):
        data = snapshot()
        data["sections"]["world"] = []
        self.assertTrue(any("World insufficient" in e for e in validate_recovery(data, NOW)))

    def test_same_source_world_rejected(self):
        data = snapshot()
        data["sections"]["world"] = [article("world", 1), article("world", 2)]
        self.assertTrue(any("World insufficient" in e for e in validate_recovery(data, NOW)))

    def test_old_world_items_rejected(self):
        data = snapshot()
        data["sections"]["world"] = [
            article("world", 1, "bbc", NOW - 40 * 60 * 60 * 1000),
            article("world", 2, "the_hindu", NOW - 40 * 60 * 60 * 1000),
        ]
        self.assertTrue(any("World insufficient" in e for e in validate_recovery(data, NOW)))

    def test_synthetic_fetched_timestamp_rejected(self):
        data = snapshot()
        data["sections"]["world"][0]["publishedAtSource"] = "fetch_time_fallback"
        self.assertTrue(any("World insufficient" in e for e in validate_recovery(data, NOW)))

    def test_all_other_sections_empty_rejected(self):
        data = snapshot()
        data["sections"] = {"world": data["sections"]["world"]}
        self.assertTrue(any("sections have current" in e for e in validate_recovery(data, NOW)))

    def test_missing_or_non_https_story_rejected(self):
        data = snapshot()
        data["sections"]["world"][0]["url"] = "http://example.com/not-secure"
        self.assertTrue(any("World insufficient" in e for e in validate_recovery(data, NOW)))

    def test_malformed_sections_rejected(self):
        data = snapshot()
        data["sections"] = []
        self.assertTrue(validate_recovery(data, NOW))


if __name__ == "__main__":
    unittest.main()
