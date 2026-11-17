"""Acquisition scope does not manufacture retailer/local alert applicability."""
import unittest
from time import gmtime
from types import SimpleNamespace
from unittest.mock import patch
import fetch_upahead_events as collector
from upahead_local_policy import classify_retail_offer

NOW = 1794790000000


class LocalSources(unittest.TestCase):
    def test_all_requested_retailers_and_markets_are_collected(self):
        queries = str(collector.CATEGORY_FEEDS['shopping'])
        for name in ('Amazon', 'Flipkart', 'Lulu', 'Hypermax', 'Sharaf DG', 'eXtra Oman'):
            self.assertIn(name.replace(' ', '+'), queries)

    def test_channel_and_city_are_not_inferred_from_the_search(self):
        self.assertIsNone(classify_retail_offer('Amazon USA sale', acquisition_location='online-india'))
        self.assertIsNone(classify_retail_offer('LuLu India sale in Kochi', acquisition_location='Chennai'))
        self.assertIsNone(classify_retail_offer('Hypermax Oman stores discount in Muscat', acquisition_location='online-oman'))
        self.assertEqual(classify_retail_offer('Hypermax Oman app-only offer in Seeb')['offerChannel'], 'online')
        self.assertEqual(classify_retail_offer('eXtra Oman sale across Oman')['offerChannel'], 'offline')

    def test_collector_preserves_actual_publisher_and_rejects_other_city(self):
        entries = [dict(title=title, summary='Road closure advisory', link='https://news.google.com/rss/articles/a',
                        source={'title': 'Times of Oman', 'href': 'https://timesofoman.com/'},
                        published_parsed=gmtime(NOW / 1000))
                   for title in ('Muscat road closure tomorrow', 'Salalah road closure tomorrow')]
        with patch.object(collector, '_safe_feed_parse', return_value=SimpleNamespace(entries=entries)):
            items, health = collector.fetch_category_items('alerts', 'Muscat', [('https://example.org/rss', 'Google News', 'google_news')], NOW)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]['city'], 'Muscat')
        self.assertEqual(items[0]['source'], 'Times of Oman')
        self.assertEqual(items[0]['sourceAuthority'], 'news_report')
        self.assertTrue(next(iter(health.values()))['ok'])


if __name__ == '__main__':
    unittest.main()
