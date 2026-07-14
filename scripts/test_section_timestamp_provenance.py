import calendar
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))

from fetch_sections_stories import (
    filter_retained_stories,
    parse_entry_timestamp,
)
from prefetch_common import normalize_basic_story


def assert_true(condition, message):
    if not condition:
        raise AssertionError(message)


def test_feed_timestamp_is_utc_and_high_confidence():
    parsed = time.gmtime(1_700_000_000)
    timestamp, source, confidence = parse_entry_timestamp({
        'published_parsed': parsed,
    })
    assert_true(timestamp == calendar.timegm(parsed) * 1000, 'timestamp must use UTC')
    assert_true(source == 'published_parsed', 'published timestamp source missing')
    assert_true(confidence == 'high', 'feed timestamp should be high confidence')


def test_missing_timestamp_is_not_replaced_with_fetch_time():
    timestamp, source, confidence = parse_entry_timestamp({})
    assert_true(timestamp == 0, 'missing timestamp must stay zero')
    assert_true(source == 'missing', 'missing timestamp provenance required')
    assert_true(confidence == 'low', 'missing timestamp must be low confidence')

    item = normalize_basic_story(
        {'title': 'Old resurfaced row', 'publishedAt': 0},
        'Example',
        'example',
        allow_fetch_time_fallback=False,
    )
    assert_true(item['publishedAt'] == 0, 'normalizer must not freshness-launder the row')
    assert_true(item['publishedAtSource'] == 'missing', 'missing provenance required')
    assert_true(item['timestampConfidence'] == 'low', 'low confidence required')


def test_fetch_time_fallback_is_explicit_when_legacy_callers_allow_it():
    before = int(time.time() * 1000)
    item = normalize_basic_story({}, 'Example', 'example')
    after = int(time.time() * 1000)
    assert_true(before <= item['publishedAt'] <= after, 'legacy fallback timestamp expected')
    assert_true(item['publishedAtSource'] == 'fetch_time_fallback', 'fallback provenance required')
    assert_true(item['timestampConfidence'] == 'low', 'fallback must never be high confidence')


def test_retention_rejects_undated_rows():
    rows = [
        {'id': 'missing', 'publishedAt': 0},
        {'id': 'fresh', 'publishedAt': 2_000},
    ]
    retained = filter_retained_stories(rows, 1_000)
    assert_true([row['id'] for row in retained] == ['fresh'], 'undated row must be removed')


if __name__ == '__main__':
    test_feed_timestamp_is_utc_and_high_confidence()
    test_missing_timestamp_is_not_replaced_with_fetch_time()
    test_fetch_time_fallback_is_explicit_when_legacy_callers_allow_it()
    test_retention_rejects_undated_rows()
    print('PASS: section timestamp provenance tests')
