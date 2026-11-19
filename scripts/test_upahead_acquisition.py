"""Acquisition uses real publication time, category intent and full ranges."""
import unittest
from calendar import timegm
from time import gmtime
from unittest.mock import patch
from types import SimpleNamespace

import fetch_upahead_events as collector
from enrich_upahead_contract import DAY_MS

NOW = 1794677700000


class AcquisitionRecovery(unittest.TestCase):
    def test_common_feed_item_keeps_its_range_end_and_source_date(self):
        entry = dict(title='Chennai expo November 15 to 17, 2026',
                     summary='Register for the exhibition', link='https://example.org/expo',
                     published_parsed=gmtime(NOW / 1000))
        with patch.object(collector, '_safe_feed_parse', return_value=SimpleNamespace(entries=[entry])):
            items, health = collector.fetch_category_items('events', 'Chennai', [('https://example.org/rss', 'Example', 'example')], NOW)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]['publishedAt'], timegm(entry['published_parsed']) * 1000)
        self.assertEqual(items[0]['eventEndAt'] - items[0]['eventStartAt'], 3 * DAY_MS)
        # The day keys stay UTC carriers. Expiry is midnight in Chennai.
        self.assertEqual(items[0]['expiryAt'], items[0]['eventEndAt'] - int(5.5 * 3_600_000))
        self.assertEqual(collector.acquisition_summary(health, NOW)['byCategory']['events']['successfulSources'], 1)

    def test_old_missing_and_future_publication_times_are_not_invented(self):
        for entry in ({}, {'published_parsed': gmtime((NOW - 8 * DAY_MS) / 1000)},
                      {'published_parsed': gmtime((NOW + DAY_MS) / 1000)}):
            self.assertIsNone(collector.recent_publication_ms(entry, NOW))

    def test_general_city_news_is_not_an_actionable_alert(self):
        self.assertFalse(collector.has_category_intent('alerts', 'Chennai minister attends film awards'))
        self.assertTrue(collector.has_category_intent('alerts', 'Chennai power shutdown tomorrow'))
        self.assertTrue(collector.has_category_intent('weather_alerts', 'Heavy rain warning for Chennai'))
        self.assertTrue(collector.has_category_intent('airlines', 'Oman Air launches fare sale'))
        self.assertFalse(collector.has_category_intent('shopping', 'Every day is a sale day as India picks up shopping occasions'))
        self.assertFalse(collector.has_category_intent('shopping', 'Amazon adapter vanished after going on sale'))

    def test_date_only_today_and_ongoing_ranges_remain_plannable(self):
        item = dict(category='events', eventStartAt=NOW - 12 * 3_600_000,
                    datePrecision='day', expiryAt=NOW + DAY_MS, localityScore=1)
        self.assertTrue(collector.is_planner_eligible(item, NOW))
        item.update(eventStartAt=NOW - 2 * DAY_MS, eventEndAt=NOW + DAY_MS)
        self.assertTrue(collector.is_planner_eligible(item, NOW))

    def test_source_failures_are_not_overwritten_by_same_publisher_group(self):
        feeds = [('https://example.org/good', 'Good', 'same'), ('https://example.org/bad', 'Bad', 'same')]
        with patch.object(collector, '_safe_feed_parse', side_effect=[SimpleNamespace(entries=[]), RuntimeError('unavailable')]):
            _items, health = collector.fetch_category_items('events', 'Chennai', feeds, NOW)
        summary = collector.acquisition_summary(health, NOW)
        self.assertEqual((summary['attemptedSources'], summary['successfulSources'], summary['failedSources']), (2, 1, 1))
        self.assertEqual(summary['status'], 'partial')


if __name__ == '__main__':
    unittest.main()
