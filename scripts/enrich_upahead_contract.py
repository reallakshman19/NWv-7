"""Add explicit lifecycle/horizon metadata to public/data/up_ahead.json.

This is a post-fetch enrichment step. It intentionally does not fetch sources and
it does not decide browser rendering. The goal is to make the static snapshot's
concept auditable:
  - Up Ahead view: future/actionable, now -> 7 days, with 24h event grace
  - Pending future pool: source-dated occurrences up to 180 days ahead
  - Planner suggestions: stricter 6h past grace, never auto-persisted
  - Alerts/offers: expiry/fallback based, not 36h news freshness
"""
from __future__ import annotations

import json
import time
from collections import Counter
from pathlib import Path
from typing import Any
from prefetch_common import compute_content_hash, title_fingerprint

UP_AHEAD_PATH = Path("public/data/up_ahead.json")
H_MS = 3_600_000
DAY_MS = 86_400_000
UPAHEAD_LOOKAHEAD_DAYS = 7
UPAHEAD_EVENT_PAST_GRACE_HOURS = 24
PLANNER_PAST_GRACE_HOURS = 6
ALERT_FALLBACK_HOURS = 24
OFFER_FALLBACK_HOURS = 48
# The public snapshot carries a separate future pool. Limits apply to admission,
# never to the independent holiday calendar or user-saved Planner reminders.
PENDING_LOOKAHEAD_DAYS = 180
MAX_PENDING_ITEMS = 500
MAX_PENDING_BYTES = 1_000_000
MAX_RETIRED_REVISIONS = 2000
MAX_QUARANTINE_ITEMS = 100
MAX_QUARANTINE_BYTES = 256_000

EVENT_CATEGORIES = {"events", "movies", "festivals", "sports"}
ALERT_CATEGORIES = {"alerts", "weather_alerts", "civic"}
OFFER_CATEGORIES = {"shopping", "airlines"}


def read_json(path: Path, fallback: Any = None) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def _ms(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return parsed if not isinstance(value, bool) and 0 < parsed <= 8_640_000_000_000_000 else None


def content_class_for_item(item: dict[str, Any]) -> str:
    category = str(item.get("category") or "").lower()
    if category in OFFER_CATEGORIES:
        return "upahead_offer"
    if category in ALERT_CATEGORIES:
        return "upahead_alert"
    return "upahead_event"


def _display_until_for_item(item: dict[str, Any], now_ms: int) -> tuple[int, str]:
    category = str(item.get("category") or "").lower()
    expiry_at = _ms(item.get("expiryAt"))
    event_end = _ms(item.get("eventEndAt"))
    event_start = _ms(item.get("eventStartAt"))
    published = next((_ms(item.get(key)) for key in
                      ('publishedAt', 'firstSeenAt', 'observedAt') if _ms(item.get(key))), None)

    if expiry_at is not None and (event_end is None or expiry_at <= event_end):
        return expiry_at, "expiryAt"
    if event_end is not None:
        return event_end, "eventEndAt"
    if event_start is not None:
        return event_start + DAY_MS, "eventStartAt_end_of_day"
    if not published:
        return 0, "missing_source_time"
    if category in OFFER_CATEGORIES:
        return published + OFFER_FALLBACK_HOURS * H_MS, "offer_48h_fallback"
    if category in ALERT_CATEGORIES:
        return published + ALERT_FALLBACK_HOURS * H_MS, "alert_24h_fallback"
    return now_ms - 1, "missing_event_time"


def _within_event_horizon(item: dict[str, Any], now_ms: int) -> bool:
    event_start = _ms(item.get("eventStartAt"))
    display_until, _reason = _display_until_for_item(item, now_ms)
    if event_start is None:
        return display_until >= now_ms
    still_running = (_ms(item.get("eventEndAt")) or 0) > now_ms
    return (
        event_start <= now_ms + UPAHEAD_LOOKAHEAD_DAYS * DAY_MS
        and (still_running or event_start >= now_ms - UPAHEAD_EVENT_PAST_GRACE_HOURS * H_MS)
    )


def _within_planner_horizon(item: dict[str, Any], now_ms: int) -> bool:
    event_start = _ms(item.get("eventStartAt"))
    if event_start is None:
        return False
    ongoing = event_start <= now_ms < (_ms(item.get("eventEndAt")) or 0)
    today_only = item.get('datePrecision') == 'day' and event_start // DAY_MS == now_ms // DAY_MS
    return ongoing or today_only or (now_ms - PLANNER_PAST_GRACE_HOURS * H_MS <= event_start
                       <= now_ms + UPAHEAD_LOOKAHEAD_DAYS * DAY_MS)


def lifecycle_for_item(item: dict[str, Any], now_ms: int) -> dict[str, Any]:
    display_until, reason = _display_until_for_item(item, now_ms)
    within_event = _within_event_horizon(item, now_ms)
    planner_horizon = _within_planner_horizon(item, now_ms)
    action_valid = display_until > now_ms and not item.get("suppressionReason")
    visible = bool(action_valid and within_event)
    planner_eligible = bool(item.get("plannerEligible") and planner_horizon and action_valid)

    return {
        "contentClass": content_class_for_item(item),
        "displayUntil": int(display_until),
        # Diagnostic deadline only; no claim that the row is archived here.
        "archiveUntil": int(display_until) + 7 * DAY_MS,
        "retentionReason": reason,
        "isVisible": bool(visible),
        "isActionValid": bool(action_valid),
        "withinSevenDayHorizon": bool(within_event),
        "plannerPastGraceHours": PLANNER_PAST_GRACE_HOURS,
        "plannerEligibleByLifecycle": bool(planner_eligible),
    }


def should_publish_item(item: dict[str, Any], lifecycle: dict[str, Any]) -> bool:
    """Return whether the item belongs in the published Up Ahead snapshot.

    The fetcher can ingest broad RSS/search results, including date-bearing rows
    far outside the seven-day Up Ahead horizon. Those rows are useful as source
    evidence but must not be published into public/data/up_ahead.json, because
    the browser and validator treat dated Up Ahead rows as actionable candidates.
    Undated alerts/offers are still governed by displayUntil fallback windows.
    """
    return bool(lifecycle.get("isVisible"))


def enrich_items(items: list[dict[str, Any]], now_ms: int) -> list[dict[str, Any]]:
    output = []
    for item in items or []:
        if not isinstance(item, dict):
            continue
        enriched = dict(item)
        lifecycle = lifecycle_for_item(enriched, now_ms)
        if not should_publish_item(enriched, lifecycle):
            continue
        enriched["contentClass"] = lifecycle["contentClass"]
        enriched["lifecycle"] = lifecycle
        output.append(enriched)
    return output


def build_lifecycle_summary(items: list[dict[str, Any]]) -> dict[str, Any]:
    categories = Counter(str(item.get("category") or "unknown") for item in items)
    classes = Counter(str(item.get("contentClass") or "unknown") for item in items)
    visible = [item for item in items if item.get("lifecycle", {}).get("isVisible")]
    planner = [item for item in items if item.get("lifecycle", {}).get("plannerEligibleByLifecycle")]
    horizon_violations = [
        item.get("id") or item.get("url") or item.get("title")
        for item in items
        if item.get("eventStartAt") and not item.get("lifecycle", {}).get("withinSevenDayHorizon")
    ]
    return {
        "itemCount": len(items),
        "visibleItemCount": len(visible),
        "plannerEligibleByLifecycleCount": len(planner),
        "categoryCounts": dict(sorted(categories.items())),
        "contentClassCounts": dict(sorted(classes.items())),
        "horizonViolationCount": len(horizon_violations),
        "horizonViolationSample": horizon_violations[:10],
    }


def enrich_snapshot(snapshot: dict[str, Any], now_ms: int | None = None) -> dict[str, Any]:
    ts = int(now_ms if now_ms is not None else time.time() * 1000)
    input_items = [*snapshot.get("items", []), *snapshot.get("pendingItems", [])]
    items = enrich_items(input_items, ts)
    pending, pending_bytes, rejected = [], 0, 0
    for item in sorted(input_items, key=lambda row: (_ms(row.get('eventStartAt')) or 0, str(row.get('id', '')))):
        lifecycle = lifecycle_for_item(item, ts)
        start = _ms(item.get('eventStartAt'))
        if lifecycle['isVisible'] or not lifecycle['isActionValid'] or not start or start <= ts:
            continue
        # A finite occurrence admitted earlier remains retained until its true
        # expiry. An arbitrary far-future or oversized new record is rejected
        # explicitly, rather than silently claiming it is retained.
        row = {**item, 'contentClass': lifecycle['contentClass'], 'lifecycle': lifecycle}
        size = len(json.dumps(row, ensure_ascii=False).encode('utf8'))
        if start > ts + PENDING_LOOKAHEAD_DAYS * DAY_MS or len(pending) >= MAX_PENDING_ITEMS or pending_bytes + size > MAX_PENDING_BYTES:
            rejected += 1
            continue
        pending.append(row)
        pending_bytes += size
    enriched = dict(snapshot)
    enriched["schemaVersion"] = int(enriched.get("schemaVersion") or 1)
    enriched["contractVersion"] = "upahead-lifecycle-v1"
    enriched["generatedAt"] = ts
    enriched["horizon"] = {
        "lookaheadDays": UPAHEAD_LOOKAHEAD_DAYS,
        "eventPastGraceHours": UPAHEAD_EVENT_PAST_GRACE_HOURS,
        "plannerPastGraceHours": PLANNER_PAST_GRACE_HOURS,
        "alertFallbackHours": ALERT_FALLBACK_HOURS,
        "offerFallbackHours": OFFER_FALLBACK_HOURS,
    }
    enriched["items"] = items
    enriched['pendingItems'] = pending
    enriched['retention'] = {
        'version': 'upahead-retention-v1', 'futureAdmissionDays': PENDING_LOOKAHEAD_DAYS,
        'maxPendingItems': MAX_PENDING_ITEMS, 'maxPendingBytes': MAX_PENDING_BYTES,
        'pendingItemCount': len(pending), 'pendingBytes': pending_bytes,
        'rejectedFutureCount': rejected, 'historyDays': 7,
    }
    enriched['contentHash'] = compute_content_hash([*items, *pending])
    quarantine = {}
    for row in snapshot.get('quarantinedItems', []):
        if isinstance(row, dict) and isinstance(row.get('item'), dict) and row.get('reason') == 'missing_clock' and ts - 7 * DAY_MS < (_ms(row.get('quarantinedAt')) or 0) <= ts:
            key = (row['item'].get('category'), row['item'].get('id'))
            if key not in quarantine or row['quarantinedAt'] < quarantine[key]['quarantinedAt']:
                quarantine[key] = row
    for item in input_items:
        deadline, reason = _display_until_for_item(item, ts)
        if not deadline and reason == 'missing_source_time' and item.get('id'):
            quarantine.setdefault((item.get('category'), item['id']),
                                  dict(item=item, reason='missing_clock', quarantinedAt=ts))
    quarantine_bytes, quarantine_rows = 0, []
    for row in list(quarantine.values())[:MAX_QUARANTINE_ITEMS]:
        size = len(json.dumps(row, ensure_ascii=False).encode('utf8'))
        if quarantine_bytes + size > MAX_QUARANTINE_BYTES:
            continue
        quarantine_rows.append(row)
        quarantine_bytes += size
    enriched['quarantinedItems'] = quarantine_rows
    enriched["lifecycleSummary"] = build_lifecycle_summary(items)
    enriched["lifecyclePrunedCount"] = max(0, len(input_items or []) - len(items))
    return enriched


def merge_upahead_snapshot(existing: dict, incoming: list[dict], ts: int, *, fetched: bool) -> dict:
    # The latest version of an occurrence can close it or move it to another day.
    # Apply that version before expiry and deduplication.
    # One article can carry an event AND an alert. Preserve each category route;
    # a revision still supersedes the same occurrence within that category.
    def identity(item):
        return (item.get('category'), item.get('revisionOf') or item.get('occurrenceId') or item.get('id'))

    def revision(item):
        return (_ms(item.get('revisionAt')) or _ms(item.get('updatedAt')) or
                _ms(item.get('observedAt')) or _ms(item.get('publishedAt')) or 0)

    retired_revisions = {tuple(row['identity']): row for row in existing.get('retiredRevisions', [])
                         if isinstance(row, dict) and isinstance(row.get('identity'), list) and len(row['identity']) == 2
                         and ts - 7 * DAY_MS <= (_ms(row.get('retiredAt')) or 0) <= ts}
    by_id = {}
    retained = [*existing.get('items', []), *existing.get('pendingItems', [])]
    observed_incoming = [{**row, 'observedAt': row.get('observedAt') or ts} if fetched else row for row in incoming]
    for item in [*retained, *observed_incoming]:
        if not isinstance(item, dict) or not item.get('id'):
            continue
        key = identity(item)
        if key in retired_revisions and revision(item) <= retired_revisions[key]['revisionAt']:
            continue
        if key not in by_id or revision(item) >= revision(by_id[key]):
            by_id[key] = item
    # CAP identifiers name unique messages. Preserve explicit cancellations for
    # seven days so a browser holding an older snapshot cannot revive them.
    retired = {row['occurrenceId']: row for row in existing.get('retiredOccurrences', [])
               if row.get('source') == 'oman-warnings' and row.get('category') == 'weather_alerts'
               and str(row.get('occurrenceId', '')).startswith('oman-warnings:')
               and ts-7*DAY_MS <= (_ms(row.get('observedAt')) or 0) <= ts}
    for item in incoming:
        retired_id = item.get('retireOccurrenceId')
        if item.get('category') == 'weather_alerts' and str(retired_id or '').startswith('oman-warnings:'):
            retired[retired_id] = dict(occurrenceId=retired_id, category='weather_alerts', source='oman-warnings', observedAt=ts)
    active = []
    for row in by_id.values():
        lifecycle = lifecycle_for_item(row, ts)
        if row.get('occurrenceId') in retired or not lifecycle['isActionValid']:
            if revision(row) and lifecycle['displayUntil']:
                key = identity(row)
                previous = retired_revisions.get(key)
                retired_revisions[key] = dict(identity=list(key), revisionAt=revision(row),
                                              retiredAt=previous['retiredAt'] if previous and previous['revisionAt'] == revision(row) else ts)
            continue
        active.append(row)
    unique = {}
    for item in sorted(active, key=lambda row: row.get("publishedAt") or 0, reverse=True):
        event_start = _ms(item.get("eventStartAt"))
        location = item.get("city") or item.get("region") or ""
        key = (
            item.get("category"), location.casefold(),
            event_start, str(item.get('venue') or '').casefold(), item.get('sessionId'),
            item.get('occurrenceId'),
            title_fingerprint(item.get("title", "")) or item["id"],
        )
        unique.setdefault(key, item)

    items = list(unique.values())
    snapshot = enrich_snapshot({
        "schemaVersion": 1,
        "fetchedAt": ts if fetched else existing.get("fetchedAt", 0),
        "contentHash": compute_content_hash(items),
        "items": items,
        "quarantinedItems": existing.get('quarantinedItems', []) + [
            dict(item=row, reason='missing_clock', quarantinedAt=ts)
            for row in by_id.values() if _display_until_for_item(row, ts)[1] == 'missing_source_time'
        ],
    }, ts)
    snapshot["lifecyclePrunedCount"] = len(by_id) - len(active)
    if retired:
        snapshot['retiredOccurrences'] = list(retired.values())
    snapshot['retiredRevisions'] = sorted(retired_revisions.values(), key=lambda row: row['retiredAt'], reverse=True)[:MAX_RETIRED_REVISIONS]
    return snapshot


def main() -> int:
    snapshot = read_json(UP_AHEAD_PATH, {})
    if not isinstance(snapshot, dict) or not isinstance(snapshot.get("items"), list):
        print(f"Missing or invalid {UP_AHEAD_PATH}")
        return 1
    enriched = enrich_snapshot(snapshot)
    write_json(UP_AHEAD_PATH, enriched)
    print(json.dumps({
        "status": "PASS",
        "contractVersion": enriched["contractVersion"],
        "itemCount": enriched["lifecycleSummary"]["itemCount"],
        "visibleItemCount": enriched["lifecycleSummary"]["visibleItemCount"],
        "plannerEligibleByLifecycleCount": enriched["lifecycleSummary"]["plannerEligibleByLifecycleCount"],
        "horizonViolationCount": enriched["lifecycleSummary"]["horizonViolationCount"],
        "lifecyclePrunedCount": enriched.get("lifecyclePrunedCount", 0),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
