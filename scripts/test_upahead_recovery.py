"""Regression cases from the November live Up Ahead audit (no network)."""
import unittest
import json
from datetime import datetime, timezone
from pathlib import Path

from enrich_upahead_contract import DAY_MS, enrich_snapshot, merge_upahead_snapshot
from validate_upahead_prefetch_output import validate_snapshot
from upahead_dates import extract_event_dates


def ms(value):
    return int(datetime.fromisoformat(value).replace(tzinfo=timezone.utc).timestamp() * 1000)


NOW = ms('2026-11-14T17:35:00')


def event(**changes):
    return dict(id='workshop', category='events', title='Chennai workshop',
                publishedAt=NOW - 6 * DAY_MS, eventStartAt=ms('2026-11-15'),
                plannerEligible=True, **changes)


class UpAheadRecovery(unittest.TestCase):
    def test_local_publisher_date_fixtures_match_browser(self):
        path = Path(__file__).resolve().parents[1] / 'src' / 'intelligence' / 'relativeDates.fixture.json'
        for case in json.loads(path.read_text(encoding='utf8')):
            with self.subTest(case=case):
                start, _end, _confidence = extract_event_dates(case['text'], ms(case['publishedAt']), case['location'])
                self.assertEqual(start, ms(case['day']) if case['day'] else None)

    def test_common_dates_and_relative_dates_anchor_to_publication(self):
        for title in ('on November 15', 'on 15 Nov', 'on 2026-11-15',
                      'tomorrow', 'on 15th November 2026', 'this Sunday'):
            with self.subTest(title=title):
                start, end, confidence = extract_event_dates('Chennai workshop ' + title, NOW)
                self.assertEqual(start, ms('2026-11-15'))
                self.assertIsNone(end)
                self.assertNotEqual(confidence, 'unknown')

    def test_ranges_keep_the_final_day(self):
        for title in ('November 15 to 17, 2026', '15–17 November 2026',
                      '15 November 2026 to 17 November 2026',
                      '2026-11-15 to 2026-11-17'):
            with self.subTest(title=title):
                start, end, confidence = extract_event_dates('Chennai expo ' + title, NOW)
                self.assertEqual((start, end, confidence),
                                 (ms('2026-11-15'), ms('2026-11-18'), 'range'))

    def test_year_boundary_and_invalid_dates(self):
        self.assertEqual(extract_event_dates('opens January 2', ms('2026-12-30'))[0], ms('2027-01-02'))
        self.assertEqual(extract_event_dates('opened November 10', NOW)[0], ms('2026-11-10'))
        self.assertEqual(extract_event_dates('opens 31 February 2026', NOW), (None, None, 'unknown'))
        self.assertEqual(extract_event_dates('Power shutdown 07-10-2026', NOW)[0], ms('2026-10-07'))
        self.assertEqual(extract_event_dates('Power shutdown 07/10/2026', NOW)[0], ms('2026-10-07'))
        self.assertEqual(extract_event_dates('Won in straight sets 6-2, 6-0', NOW), (None, None, 'unknown'))
        self.assertEqual(extract_event_dates('Workshop this weekend', NOW),
                         (ms('2026-11-14'), ms('2026-11-16'), 'range'))

    def test_expired_saved_flags_cannot_pass_release_gate(self):
        snapshot = enrich_snapshot(dict(schemaVersion=1, fetchedAt=NOW,
                                        contentHash='fixture', items=[event()]), NOW)
        report = validate_snapshot(snapshot, NOW + 150 * DAY_MS)
        self.assertEqual(report['status'], 'FAIL')
        self.assertEqual(report['visibleItemCount'], 0)
        self.assertTrue(any('stale' in error.lower() for error in report['errors']))

    def test_empty_fresh_publication_fails(self):
        report = validate_snapshot(enrich_snapshot(dict(schemaVersion=1, fetchedAt=NOW,
                                    contentHash='fixture', items=[]), NOW), NOW)
        self.assertEqual(report['status'], 'FAIL')

    def test_same_article_preserves_both_category_routes_and_revisions(self):
        snapshot = merge_upahead_snapshot({}, [event(), {**event(), 'category': 'alerts'}], NOW, fetched=True)
        self.assertEqual({row['category'] for row in snapshot['items']}, {'events', 'alerts'})
        revised = {**event(), 'title': 'Chennai workshop revised', 'eventStartAt': ms('2026-11-16')}
        result = merge_upahead_snapshot(snapshot, [revised], NOW + 1000, fetched=True)
        self.assertEqual(len(result['items']), 2)
        self.assertEqual(next(row for row in result['items'] if row['category'] == 'events')['eventStartAt'], ms('2026-11-16'))


if __name__ == '__main__':
    unittest.main()
