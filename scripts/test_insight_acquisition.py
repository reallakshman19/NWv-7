"""Collector boundary tests: real clocks and durable refresh, not editorial grading."""
import calendar
from datetime import datetime, timezone
from email.utils import format_datetime

import fetch_insight_stories as collector
from test_validate_insight_prefetch_output import NOW_MS, make_rich_snapshot
from validate_insight_prefetch_output import validate_snapshot


def feed(entries):
    rows = []
    for identity, published in entries:
        date = f'<pubDate>{format_datetime(datetime.fromtimestamp(published / 1000, timezone.utc))}</pubDate>' if published else ''
        rows.append(f'<item><title>{identity}</title><link>https://publisher.example/{identity}</link>{date}<description>Genuine source text</description></item>')
    return ('<rss version="2.0"><channel><title>Publisher</title>' + ''.join(rows) + '</channel></rss>').encode()


class Response:
    def __init__(self, content):
        self.content = content
    def __enter__(self):
        return self
    def __exit__(self, *_):
        pass
    def raise_for_status(self):
        pass
    def iter_content(self, _):
        yield self.content


def test_publication_dates_are_utc_and_missing_or_future_dates_are_not_fabricated(monkeypatch):
    monkeypatch.setattr(collector, 'get_active_slot_feeds', lambda: {'now': [('https://publisher.example/feed', 'Publisher', 'publisher')]})
    monkeypatch.setattr(collector.requests, 'get', lambda *a, **k: Response(feed([
        ('valid', NOW_MS - 1000), ('clockless', None), ('future', NOW_MS + 1000), ('expired', NOW_MS - 37 * collector.H_MS),
    ])))
    monkeypatch.setattr(collector.time, 'mktime', lambda *_: (_ for _ in ()).throw(AssertionError('Local timezone must not parse an RFC UTC feed clock')))
    rows, health = collector.fetch_slot_stories('now', ts=NOW_MS)
    assert len(rows) == 1
    assert rows[0]['publishedAt'] == NOW_MS - 1000
    assert rows[0]['publishedAtSource'] == 'feed_published'
    assert health['publisher']['items'] == 1


def test_duplicate_feed_requests_are_memoized_across_slots_without_mutating_their_story_lists(monkeypatch):
    calls = []
    monkeypatch.setattr(collector, 'get_active_slot_feeds', lambda: {slot: [('https://publisher.example/feed', 'Publisher', 'publisher')] for slot in collector.SLOTS})
    def get(*args, **kwargs):
        calls.append(args[0])
        return Response(feed([('valid', NOW_MS)]))
    monkeypatch.setattr(collector.requests, 'get', get)
    result, _ = collector.refresh_insight_snapshot(collector.DEFAULT_SNAPSHOT, NOW_MS)
    assert len(calls) == 1
    assert len(result['stories']) == 1
    assert result['stories'][0]['fetchedForSlots'] == sorted(collector.SLOTS)
    assert result['acquisitionSummary']['uniqueFeedRequests'] == 1


def test_google_reuters_query_does_not_authenticate_a_wire_origin(monkeypatch):
    monkeypatch.setattr(collector, 'get_active_slot_feeds', lambda: {'now': [('https://news.google.com/rss/search?q=Reuters', 'Reuters', 'reuters')]})
    monkeypatch.setattr(collector.requests, 'get', lambda *a, **k: Response(feed([('valid', NOW_MS)])))
    rows, _ = collector.fetch_slot_stories('now', ts=NOW_MS)
    assert rows[0]['sourceGroup'] == 'google_news'
    assert rows[0]['source'] == 'Google News'


def test_oversized_or_html_sources_fail_and_are_not_retried_per_slot(monkeypatch):
    monkeypatch.setattr(collector, 'get_active_slot_feeds', lambda: {'now': [('https://publisher.example/feed', 'Publisher', 'publisher')]})
    calls = []
    monkeypatch.setattr(collector.requests, 'get', lambda *a, **k: (calls.append(a[0]) or Response(b'x' * (collector.MAX_FEED_BYTES + 1))))
    cache = {}
    for _ in range(2):
        rows, health = collector.fetch_slot_stories('now', ts=NOW_MS, feed_cache=cache)
        assert not rows and not health['publisher']['ok']
    assert len(calls) == 1
    monkeypatch.setattr(collector.requests, 'get', lambda *a, **k: Response(b'<html>Challenge</html>'))
    assert not collector.fetch_slot_stories('now', ts=NOW_MS)[1]['publisher']['ok']


def test_failed_acquisition_cannot_advance_slot_or_artifact_freshness(monkeypatch):
    monkeypatch.setattr(collector, 'fetch_slot_stories', lambda *a, **k: ([], {'publisher': {'ok': False}}))
    old = {**collector.DEFAULT_SNAPSHOT, 'fetchedAt': NOW_MS - 5 * collector.H_MS}
    result, _ = collector.refresh_insight_snapshot(old, NOW_MS)
    assert result['fetchedAt'] == old['fetchedAt']
    assert all(row['fetchedAt'] == 0 for row in result['slotMeta'].values())
    assert not result['acquisitionSummary']['successfulSources']


def test_retention_rejects_fetch_time_fallback_bad_and_future_clocks():
    rows = [{'id': 'valid', 'publishedAt': NOW_MS},
            {'id': 'fallback', 'publishedAt': NOW_MS, 'publishedAtSource': 'fetch_time_fallback'},
            {'id': 'bad', 'publishedAt': 'invalid'}, {'id': 'future', 'publishedAt': NOW_MS + 1}]
    assert [row['id'] for row in collector.keep_recent_stories(rows, NOW_MS)] == ['valid']
    assert not collector.slot_is_fresh({'now': {'fetchedAt': NOW_MS + 1}}, 'now', NOW_MS)


def test_publication_gate_requires_fresh_source_evidence_without_changing_editorial_thresholds():
    snapshot = make_rich_snapshot()
    snapshot['acquisitionSummary'] = {'successfulSources': 6}
    for row in snapshot['stories']:
        row['publishedAtSource'] = 'feed_published'
    assert not validate_snapshot(snapshot, NOW_MS, require_acquisition=True)['errors']
    snapshot['fetchedAt'] -= 4 * collector.H_MS
    assert any('stale' in error for error in validate_snapshot(snapshot, NOW_MS, require_acquisition=True)['errors'])
    snapshot['fetchedAt'] = NOW_MS
    snapshot['stories'][0]['publishedAtSource'] = 'fetch_time_fallback'
    assert any('genuine' in error for error in validate_snapshot(snapshot, NOW_MS, require_acquisition=True)['errors'])
