"""Fixed-clock counterexamples for storage/view separation and stale replay."""
from enrich_upahead_contract import (
    DAY_MS, H_MS, MAX_PENDING_ITEMS, PENDING_LOOKAHEAD_DAYS,
    enrich_snapshot, lifecycle_for_item, merge_upahead_snapshot,
)
from test_upahead_lifecycle_contract import NOW, item
from validate_upahead_prefetch_output import validate_snapshot


def test_early_announcement_survives_until_visible_without_rediscovery():
    future = item(id='early', eventStartAt=NOW + 30 * DAY_MS, eventEndAt=NOW + 31 * DAY_MS)
    first = merge_upahead_snapshot({}, [future], NOW, fetched=True)
    assert not first['items']
    assert [row['id'] for row in first['pendingItems']] == ['early']
    entered = merge_upahead_snapshot(first, [], NOW + 24 * DAY_MS, fetched=False)
    assert [row['id'] for row in entered['items']] == ['early']
    assert not entered['pendingItems']
    assert entered['items'][0]['publishedAt'] == NOW
    assert entered['fetchedAt'] == NOW
    expired = merge_upahead_snapshot(entered, [], NOW + 31 * DAY_MS, fetched=False)
    assert not expired['items'] and not expired['pendingItems']


def test_pending_revision_moves_into_view_and_old_response_cannot_reverse_it():
    old = item(occurrenceId='session', observedAt=NOW, eventStartAt=NOW + 30 * DAY_MS)
    first = merge_upahead_snapshot({}, [old], NOW, fetched=True)
    revised = {**old, 'id': 'new-publication', 'observedAt': NOW + H_MS, 'eventStartAt': NOW + 2 * DAY_MS}
    moved = merge_upahead_snapshot(first, [revised], NOW + H_MS, fetched=True)
    late = merge_upahead_snapshot(moved, [old], NOW + 2 * H_MS, fetched=True)
    assert [row['id'] for row in late['items']] == ['new-publication']
    assert not late['pendingItems']


def test_expired_pending_revision_cannot_be_resurrected_by_delayed_response():
    old = item(occurrenceId='cancelled', observedAt=NOW, eventStartAt=NOW + 30 * DAY_MS)
    first = merge_upahead_snapshot({}, [old], NOW, fetched=True)
    closed = {**old, 'observedAt': NOW + H_MS, 'expiryAt': NOW + H_MS}
    cancelled = merge_upahead_snapshot(first, [closed], NOW + H_MS, fetched=True)
    late = merge_upahead_snapshot(cancelled, [old], NOW + 2 * H_MS, fetched=True)
    assert not late['items'] and not late['pendingItems']
    assert len(late['retiredRevisions']) == 1
    retired = merge_upahead_snapshot(late, [], NOW + 8 * DAY_MS, fetched=False)
    assert not retired['retiredRevisions']


def test_missing_source_clock_cannot_slide_its_fallback_deadline():
    row = item(category='alerts', publishedAt=None, eventStartAt=None)
    assert not lifecycle_for_item(row, NOW)['isActionValid']
    assert not lifecycle_for_item(row, NOW + 100 * DAY_MS)['isActionValid']
    first = enrich_snapshot({'items': [row]}, NOW)
    assert not first['items']
    assert first['quarantinedItems'][0]['item']['publishedAt'] is None
    second = enrich_snapshot(first, NOW + DAY_MS)
    assert second['quarantinedItems'][0]['quarantinedAt'] == NOW
    assert not enrich_snapshot(second, NOW + 8 * DAY_MS)['quarantinedItems']


def test_future_pool_limits_are_explicit_and_nearest_occurrences_win():
    rows = [item(id=f'future-{n}', eventStartAt=NOW + (20 + n / 100) * DAY_MS)
            for n in range(MAX_PENDING_ITEMS + 2)]
    rows.append(item(id='too-distant', eventStartAt=NOW + (PENDING_LOOKAHEAD_DAYS + 1) * DAY_MS))
    result = enrich_snapshot({'items': rows}, NOW)
    assert len(result['pendingItems']) == MAX_PENDING_ITEMS
    assert result['retention']['rejectedFutureCount'] == 3
    assert result['retention']['pendingBytes'] <= result['retention']['maxPendingBytes']


def test_validator_recomputes_pending_expiry_and_does_not_count_it_as_visible():
    result = enrich_snapshot({'schemaVersion': 1, 'fetchedAt': NOW, 'items': [
        item(), item(id='future', eventStartAt=NOW + 30 * DAY_MS),
    ]}, NOW)
    assert not validate_snapshot(result, NOW)['errors']
    result['pendingItems'][0]['expiryAt'] = NOW
    assert any('Pending occurrence' in error for error in validate_snapshot(result, NOW)['errors'])


def test_distinct_timed_sessions_and_venues_survive_publisher_deduplication():
    rows = [item(id='morning', eventStartAt=NOW + DAY_MS, venue='Hall A'),
            item(id='afternoon', eventStartAt=NOW + DAY_MS + H_MS, venue='Hall A'),
            item(id='other-venue', eventStartAt=NOW + DAY_MS, venue='Hall B')]
    assert len(merge_upahead_snapshot({}, rows, NOW, fetched=True)['items']) == 3
