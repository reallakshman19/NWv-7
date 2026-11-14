import unittest
from unittest.mock import patch

import fetch_sections_stories as publisher


PERU = 'Study Links Climate And Violence: Peru skeletons show low conflict; ritual sacrifice stays distinct'
CALIFORNIA = 'After 17 years, California pier walk raises record $3.3 million with celebrity supporters in 2026'
TAMIL_NADU_RAIN = 'Low-pressure area likely to form over Bay of Bengal, ease rain deficit in State'
TAMIL_NADU_SUMMARY = 'Regional Meteorological Centre watches next weather system likely for rainfall prospects over Tamil Nadu'
TOI = 'https://timesofindia.indiatimes.com'
HINDU = 'https://www.thehindu.com'
NOW = 1_800_000_000_000


def story(title, path, *, source_group='times_of_india', summary='', age=0, category='india'):
    host = TOI if source_group == 'times_of_india' else HINDU
    return {
        'id': path,
        'title': title,
        'summary': summary,
        'url': host + path,
        'sourceGroup': source_group,
        'category': category,
        'publishedAt': NOW - age,
    }


class SectionsRoutingTests(unittest.TestCase):
    def test_geographic_evidence_preserves_domestic_and_multistate_coverage(self):
        cases = [
            (story('Schools reopen after repairs', '/india/schools/articleshow/100.cms'), 'india'),
            (story('Three Indian seafarers aboard tanker hit in Strait of Hormuz', '/world/middle-east/tanker'), 'india'),
            (story('Indian archaeologists discover new burial site, compare findings with Peru', '/science/archaeology/findings'), 'india'),
            (story('ISRO launches satellite to monitor crop health', '/science/space/satellite'), 'india'),
            (story('Researchers map a new burial site', '/science/india/archaeology'), 'india'),
            (story('Taylor Swift’s castle sells at auction', '/real-estate/news/castle'), None),
            (story('Local charity hosts a fundraiser - Times of India', '/world/us/charity'), None),
            (story(TAMIL_NADU_RAIN, '/india/weather', summary=TAMIL_NADU_SUMMARY), 'tn'),
            (story('IMD issues rain alerts for Odisha, West Bengal and Tamil Nadu', '/india/rain'), 'india'),
            (story('IMD issues rain alerts in 11 states, including Tamil Nadu', '/india/rain'), 'india'),
            (story('Monsoon patterns shift as oceans warm', '/india/weather', summary='The study includes data from Tamil Nadu.'), 'india'),
        ]
        for item, expected in cases:
            with self.subTest(title=item['title']):
                self.assertEqual(publisher.india_story_destination(item), expected)

    def test_publisher_routes_before_capping_and_keeps_source_health(self):
        peru = story(PERU, '/science/archaeology/peru/articleshow/100.cms')
        california = story(CALIFORNIA, '/world/us/california/articleshow/101.cms')
        rain = story(TAMIL_NADU_RAIN, '/news/national/tamil-nadu/bay-of-bengal/article.ece',
                     source_group='the_hindu', summary=TAMIL_NADU_SUMMARY)
        state_update = story('Cabinet approves reservoir repairs', '/news/national/tamil-nadu/reservoir/article.ece',
                             source_group='the_hindu')
        national = [story(f'Cabinet decision {index}', f'/india/{index}', age=100 + index)
                    for index in range(publisher.MAX_STORIES_PER_SECTION + 1)]
        native_tn = {**rain, 'category': 'tn'}
        world = story('Independent World feed story', '/news/international/world/article.ece',
                      source_group='the_hindu', category='world')
        india_items = [peru, california, rain, state_update, *national]
        india_health = {'times_of_india': {'ok': True, 'items': len(india_items), 'section': 'india'}}
        feeds = {'india': [], 'tn': [], 'world': []}
        feed_results = [(india_items, india_health), ([native_tn], {}), ([world], {})]

        with (
            patch.object(publisher, 'SECTION_FEEDS', feeds),
            patch.object(publisher, 'now_ms', return_value=NOW),
            patch.object(publisher, 'fetch_section', side_effect=feed_results),
            patch.object(publisher, 'read_json', return_value={'sources': {}}),
            patch.object(publisher, 'write_json') as write_json,
            patch.object(publisher, 'write_section_source_policy_report'),
        ):
            publisher.main()

        outputs = dict(call.args for call in write_json.call_args_list)
        snapshot = outputs[publisher.SECTIONS_PATH]
        self.assertEqual(snapshot['sections']['india'], national[:publisher.MAX_STORIES_PER_SECTION])
        self.assertEqual(snapshot['sections']['tn'], [native_tn, {**state_update, 'category': 'tn'}])
        self.assertEqual(snapshot['sections']['world'], [world])
        self.assertEqual(snapshot['sectionQuality']['tn']['storyCount'], 2)
        self.assertEqual(outputs[publisher.SOURCE_HEALTH_PATH]['sources']['times_of_india']['items'], len(india_items))


if __name__ == '__main__':
    unittest.main()
