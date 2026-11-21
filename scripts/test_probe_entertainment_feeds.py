import time
import unittest
from probe_entertainment_feeds import (
    assess, count_current_entries, valid_publisher_link,
)


class EntertainmentFeedProbeTests(unittest.TestCase):
    def test_direct_publisher_host_is_required(self):
        self.assertTrue(valid_publisher_link("https://www.variety.com/2026/film/article/", "variety"))
        self.assertTrue(valid_publisher_link("https://www.bbc.com/culture/articles/example", "bbc"))
        self.assertFalse(valid_publisher_link("https://variety.com.evil.example/story", "variety"))
        self.assertFalse(valid_publisher_link("https://news.google.com/rss/articles/xyz", "deadline"))
        self.assertFalse(valid_publisher_link("javascript:alert(1)", "deadline"))
        self.assertFalse(valid_publisher_link("https://deadline.com/article", "variety"))

    def test_fresh_publisher_dated_articles_only(self):
        now = 1_800_000_000
        rows = [
            {"published_parsed": time.gmtime(now - 3600),
             "link": "https://variety.com/2026/film/new"},
            {"published_parsed": time.gmtime(now - 37 * 3600),
             "link": "https://variety.com/2026/film/stale"},
            {"published_parsed": time.gmtime(now + 3600),
             "link": "https://variety.com/2026/film/future"},
            {"link": "https://variety.com/2026/film/undated"},
            {"published_parsed": time.gmtime(now - 3600),
             "link": "https://unrelated.example/story"},
        ]
        self.assertEqual(count_current_entries(rows, "variety", now), 1)

    def test_hollywood_source_and_independent_publisher_both_required(self):
        single = [{"sourceGroup": "ndtv", "ok": True}]
        self.assertFalse(assess(single)["passed"])
        no_hollywood = [{"sourceGroup": "ndtv", "ok": True},
                        {"sourceGroup": "bbc", "ok": True}]
        self.assertFalse(assess(no_hollywood)["passed"])
        enough = [*no_hollywood, {"sourceGroup": "deadline", "ok": True}]
        self.assertTrue(assess(enough)["passed"])
        self.assertEqual(assess(enough)["hollywoodPublisherCount"], 1)
        failed_hollywood = [*no_hollywood, {"sourceGroup": "deadline", "ok": False}]
        self.assertFalse(assess(failed_hollywood)["passed"])


if __name__ == "__main__":
    unittest.main()
