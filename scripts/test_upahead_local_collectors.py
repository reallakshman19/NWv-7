"""Independent expectations for structured schedules/official source statuses."""
from datetime import datetime
from unittest import TestCase
from unittest.mock import patch
import json

import upahead_local_collectors as local
from fetch_upahead_events import has_category_intent, fetch_category_items
from time import gmtime
from types import SimpleNamespace
from enrich_upahead_contract import merge_upahead_snapshot

NOW = int(datetime.fromisoformat('2026-11-18T16:00:00+00:00').timestamp() * 1000)


def chennai_row(name='Chennai music show', day='2026-11-19', slug='music', venue='Music Academy', minute='1140'):
    return f'<li data-ev="{slug}" data-name="{name}" data-date="{day}" data-clock="7:00 PM" data-min="{minute}" data-venue="{venue}"><a href="/event/{slug}">{name}</a></li>'


def oman_row(venue='Al Qurum, Muscat', dates='20261119T150000Z/20261121T220000Z'):
    from urllib.parse import urlencode
    query = urlencode(dict(text='Classic Cars Exhibition', location=venue, dates=dates, details='Vintage cars at the exhibition.'))
    return f'<div class="card event-card"><a href="https://calendar.google.com/calendar/render?{query}">Calendar</a><a href="/events/classic-cars">Classic Cars</a></div>'


BULLETIN = '''NOWCAST FOR CHENNAI DATE 18-11-2026
TIME OF ISSUE 2030 HOURS IST VALID
FROM 2030 HOURS IST OF 18.11.2026 TO 2330 HOURS IST OF 18.11.2026
SEVERE WEATHER WARNING NIL NEXT UPDATE 2330 HOURS IST OF 18.11.2026'''


class LocalCollectors(TestCase):
    def test_chennai_source_start_uses_venue_offset_without_invented_publication_or_end(self):
        row = local.parse_chennai_calendar(chennai_row(), NOW)[0]
        self.assertEqual(row['eventStartAt'], int(datetime.fromisoformat('2026-11-19T13:30:00+00:00').timestamp() * 1000))
        self.assertIsNone(row['publishedAt'])
        self.assertIsNone(row['eventEndAt'])
        self.assertEqual(row['eventDateKey'], '2026-11-19')
        self.assertEqual(row['expiryAt'], int(datetime.fromisoformat('2026-11-19T18:30:00+00:00').timestamp() * 1000))

    def test_chennai_old_far_future_virtual_and_invalid_days_are_rejected(self):
        value = ''.join([chennai_row(day='2026-11-17'), chennai_row(day='2026-12-19'),
                         chennai_row(day='2026-02-31'), chennai_row(venue='Online via Zoom')])
        self.assertEqual(local.parse_chennai_calendar(value, NOW), [])
        with self.assertRaises(ValueError):
            local.parse_chennai_calendar('<h1>Loading events</h1>', NOW)

    def test_chennai_advertised_final_day_survives_midnight_and_year_boundary(self):
        value = chennai_row(day='2026-11-17').replace('</li>', '<span>Runs until Thu 19 Nov</span></li>')
        row = local.parse_chennai_calendar(value, NOW)[0]
        self.assertEqual(row['eventDateEndKey'], '2026-11-19')
        self.assertEqual(row['eventDateEndExclusiveKey'], '2026-11-20')
        self.assertEqual(row['expiryAt'], int(datetime.fromisoformat('2026-11-19T18:30:00Z').timestamp()*1000))
        self.assertTrue(row['plannerEligible'])
        self.assertEqual(len(merge_upahead_snapshot({}, [row], NOW, fetched=True)['items']), 1)
        clock = int(datetime.fromisoformat('2026-12-30T16:00:00Z').timestamp()*1000)
        value = chennai_row(day='2026-12-31').replace('</li>', '<span>Runs until Sun 3 Jan</span></li>')
        self.assertEqual(local.parse_chennai_calendar(value, clock)[0]['eventDateEndKey'], '2027-01-03')

    def test_oman_country_calendar_does_not_become_muscat(self):
        self.assertEqual(local.parse_oman_calendar(oman_row(venue='Bidiyah, North Al Sharqiyah'), NOW), [])
        row = local.parse_oman_calendar(oman_row(), NOW)[0]
        self.assertEqual(row['city'], 'Muscat')
        self.assertEqual(row['eventEndAt'], int(datetime.fromisoformat('2026-11-21T22:00:00+00:00').timestamp() * 1000))
        self.assertEqual(row['expiryAt'], row['eventEndAt'])
        self.assertIsNone(row['publishedAt'])

    def test_oman_expired_or_reversed_schedule_is_not_visible(self):
        for dates in ('20261115T150000Z/20261117T220000Z', '20261121T220000Z/20261119T150000Z'):
            self.assertEqual(local.parse_oman_calendar(oman_row(dates=dates), NOW), [])

    def test_imd_nil_is_current_coverage_not_an_alert(self):
        rows, status = local.parse_imd_nowcast(BULLETIN, NOW)
        self.assertEqual(rows, [])
        self.assertEqual(status['status'], 'checked_empty')
        self.assertEqual(status['issuedAt'], NOW - local.HOUR)
        self.assertEqual(status['validUntil'], NOW + 2 * local.HOUR)
        for timestamp in (NOW + 2 * local.HOUR, NOW - 2 * local.HOUR):
            with self.assertRaises(ValueError):
                local.parse_imd_nowcast(BULLETIN, timestamp)

    def test_actual_imd_warning_has_original_validity_and_source(self):
        rows, status = local.parse_imd_nowcast(BULLETIN.replace('WARNING NIL', 'WARNING Thunderstorm with lightning'), NOW)
        self.assertEqual(status['status'], 'active')
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['expiryAt'], NOW + 2 * local.HOUR)
        self.assertEqual(rows[0]['publishedAt'], NOW - local.HOUR)
        self.assertEqual(rows[0]['sourceAuthority'], 'official')

    def test_empty_tneb_page_is_distinct_from_failed_or_unreadable_page(self):
        rows, status = local.parse_tneb('SORRY, NO PRESS RELEASE ARE AVAILABLE', NOW)
        self.assertEqual(rows, [])
        self.assertEqual(status['status'], 'checked_empty')
        with self.assertRaises(ValueError):
            local.parse_tneb('<table><tr><td>Loading</td></tr></table>', NOW)
        with patch.object(local, 'read_public', side_effect=TimeoutError('Timed out')):
            rows, health = local.collect_local_source('tneb-shutdowns', NOW)
        self.assertEqual(rows, [])
        self.assertFalse(health['tneb-shutdowns']['ok'])
        self.assertEqual(health['tneb-shutdowns']['status'], 'unavailable')

    def test_tneb_rows_preserve_affected_area_identity_and_published_times(self):
        value = 'between 9.00 A.M. to 2.00 P.M. for maintenance work.<table><tr><td>19-11-2026</td><td>Adyar</td></tr><tr><td>19-11-2026</td><td>Mylapore</td></tr></table>'
        rows, _status = local.parse_tneb(value, NOW)
        self.assertEqual(len(rows), 2)
        self.assertNotEqual(rows[0]['id'], rows[1]['id'])
        self.assertEqual(rows[0]['eventEndAt'] - rows[0]['eventStartAt'], 5 * local.HOUR)
        self.assertIsNone(rows[0]['publishedAt'])

    def test_oman_public_ui_empty_response_is_qualified_but_bad_schema_fails_closed(self):
        config = 'var oman_js_object = ' + json.dumps(dict(ajax_url='https://met.caa.gov.om/wp-admin/admin-ajax.php', nonce='test-public-nonce')) + ';'
        for result, expected in ((dict(success=True, data=dict(alerts=[])), True),
                                 (dict(success=True, data={}), False), (dict(success=False), False)):
            with patch.object(local, 'read_public', side_effect=[config.encode(), json.dumps(result).encode()]):
                rows, health = local.collect_local_source('oman-warnings', NOW)
            self.assertEqual(rows, [])
            self.assertEqual(health['oman-warnings']['ok'], expected)
            self.assertNotIn('test-public-nonce', json.dumps(health))

    def test_refresh_appends_new_occurrences_deduplicates_and_expires_old(self):
        a = local.parse_chennai_calendar(chennai_row(), NOW)[0]
        b = local.parse_chennai_calendar(chennai_row(name='Art workshop', slug='art'), NOW)[0]
        first = merge_upahead_snapshot({}, [a], NOW, fetched=True)
        second = merge_upahead_snapshot(first, [a, b], NOW + 1000, fetched=True)
        self.assertEqual({row['id'] for row in second['items']}, {a['id'], b['id']})
        final = merge_upahead_snapshot(second, [], a['expiryAt'] + 1, fetched=False)
        self.assertEqual(final['items'], [])
        self.assertEqual(final['fetchedAt'], second['fetchedAt'])

    def test_civic_intent_excludes_projects_and_legal_notices_but_keeps_traffic_restrictions(self):
        for text in ('Chennai plans desalination plant to bridge water supply deficit',
                     'Madras High Court issues notice to Collector on road dispute',
                     'Chennai starts major road project next decade'):
            self.assertFalse(has_category_intent('civic', text), text)
        for text in ('Muscat truck traffic will be suspended on November 20',
                     'Chennai water supply interrupted tomorrow', 'Chennai application deadline November 21'):
            self.assertTrue(has_category_intent('civic', text), text)

    def test_source_notice_hours_are_preserved_in_the_venue_timezone(self):
        entry = dict(title='Muscat truck traffic restrictions November 20',
                     summary='Truck traffic will be suspended from 12pm to 7pm on November 20.',
                     link='https://example.org/traffic', published_parsed=gmtime(NOW/1000))
        with patch('fetch_upahead_events._safe_feed_parse', return_value=SimpleNamespace(entries=[entry])):
            items, _ = fetch_category_items('civic', 'Muscat', [('https://example.org/feed', 'Publisher', 'pub')], NOW)
        self.assertEqual(len(items), 1)
        row = items[0]
        self.assertEqual(row['eventDateKey'], '2026-11-20')
        self.assertEqual(row['eventStartAt'], int(datetime.fromisoformat('2026-11-20T08:00:00+00:00').timestamp()*1000))
        self.assertEqual(row['expiryAt'], int(datetime.fromisoformat('2026-11-20T15:00:00+00:00').timestamp()*1000))

    def test_oman_cap_active_warning_requires_named_city_and_genuine_zoned_validity(self):
        info = dict(language='en-GB', area=[dict(areaDesc='Muscat Governorate')],
                    onset='2026-11-18T15:00:00+00:00', expires='2026-11-18T20:00:00+04:00',
                    headline='Thunderstorm warning', description='Heavy rain and lightning.', instruction='Avoid wadis.')
        # End at NOW is expired; no grace period creates a current warning.
        alert = dict(identifier='cap-001', status='Actual', msgType='Alert', sent='2026-11-18T14:50:00Z', info=[info])
        self.assertEqual(local.parse_oman_warnings(dict(success=True, data=dict(alerts=[alert])), NOW)[0], [])
        info['expires'] = '2026-11-18T23:00:00+04:00'
        rows, status = local.parse_oman_warnings(dict(success=True, data=dict(alerts=[alert])), NOW)
        self.assertEqual(status['status'], 'active')
        self.assertEqual(rows[0]['expiryAt'], NOW+3*local.HOUR)
        self.assertEqual(rows[0]['publishedAt'], NOW-70*60000)
        info['area'][0]['areaDesc'] = 'Dhofar Governorate'
        self.assertEqual(local.parse_oman_warnings(dict(success=True, data=dict(alerts=[alert])), NOW)[0], [])
        info['area'][0]['areaDesc'] = 'Muscat'
        info['expires'] = '2026-11-18T23:00:00'
        with self.assertRaises(ValueError):
            local.parse_oman_warnings(dict(success=True, data=dict(alerts=[alert])), NOW)

    def test_oman_cap_cancellation_retires_only_the_referenced_occurrence(self):
        info = dict(language='en', area=[dict(areaDesc='Muscat')], onset='2026-11-18T15:00:00Z',
                    expires='2026-11-18T19:00:00Z', headline='Heavy rain', description='Weather warning')
        alert = dict(identifier='old-warning', status='Actual', msgType='Alert', info=[info])
        rows, _ = local.parse_oman_warnings(dict(success=True, data=dict(alerts=[alert])), NOW)
        first = merge_upahead_snapshot({}, rows, NOW, fetched=True)
        cancel = dict(identifier='cancel-warning', status='Actual', msgType='Cancel',
                      references='CAA,old-warning,2026-11-18T15:00:00Z')
        changes, _ = local.parse_oman_warnings(dict(success=True, data=dict(alerts=[cancel])), NOW+1000)
        final = merge_upahead_snapshot(first, changes, NOW+1000, fetched=True)
        self.assertEqual(final['items'], [])
        replay = merge_upahead_snapshot(final, rows, NOW+2000, fetched=True)
        self.assertEqual(replay['items'], [])
        self.assertEqual(len(replay['retiredOccurrences']), 2)
        expired = merge_upahead_snapshot(final, [], NOW+8*local.DAY, fetched=False)
        self.assertNotIn('retiredOccurrences', expired)
