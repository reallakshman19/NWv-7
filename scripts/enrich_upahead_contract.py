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
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from prefetch_common import compute_content_hash, title_fingerprint

UP_AHEAD_PATH = Path("public/data/up_ahead.json")
_POLICY_PATH = Path(__file__).resolve().parents[1] / "config" / "upahead_retention_policy.json"
RETENTION_POLICY = json.loads(_POLICY_PATH.read_text(encoding="utf-8"))
MAX_ACTIVE_ITEMS = int(RETENTION_POLICY["active"]["maxItems"])
MAX_ACTIVE_BYTES = int(RETENTION_POLICY["active"]["maxBytes"])
MAX_TOTAL_PUBLICATION_BYTES = int(RETENTION_POLICY["publication"]["maxSnapshotBytes"])
MAX_ACTIVE_WINDOW_HOURS = int(RETENTION_POLICY["maximumActiveWindowHours"])
CATEGORY_SOFT_CAPS = RETENTION_POLICY["active"]["softCategoryCaps"]
SAFETY_CATEGORIES = {"alerts", "weather_alerts", "civic"}

H_MS = 3_600_000
DAY_MS = 86_400_000
UPAHEAD_LOOKAHEAD_DAYS = 7
UPAHEAD_EVENT_PAST_GRACE_HOURS = 24
PLANNER_PAST_GRACE_HOURS = 6
ALERT_FALLBACK_HOURS = int(RETENTION_POLICY["categoryDefaultRetentionHours"]["alerts"])
OFFER_FALLBACK_HOURS = int(RETENTION_POLICY["categoryDefaultRetentionHours"]["shopping"])
# The public snapshot carries a separate future pool. Limits apply to admission,
# never to the independent holiday calendar or user-saved Planner reminders.
PENDING_LOOKAHEAD_DAYS = int(RETENTION_POLICY["pending"]["futureAdmissionDays"])
MAX_PENDING_ITEMS = int(RETENTION_POLICY["pending"]["maxItems"])
MAX_PENDING_BYTES = int(RETENTION_POLICY["pending"]["maxBytes"])
MAX_RETIRED_REVISIONS = int(RETENTION_POLICY["retention"]["retiredRevisionsMax"])
MAX_QUARANTINE_ITEMS = int(RETENTION_POLICY["quarantine"]["maxItems"])
MAX_QUARANTINE_BYTES = int(RETENTION_POLICY["quarantine"]["maxBytes"])

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


def _venue_day_offset_ms(item: dict[str, Any]) -> int:
    aliases = {
        "madras": "chennai", "tiruchirappalli": "trichy",
        "tiruchirapalli": "trichy", "seeb": "muscat", "al seeb": "muscat",
        "ghubrah": "muscat", "al ghubrah": "muscat",
        "mawaleh": "muscat",
    }
    regions = {"in", "india", "tn", "tamil nadu", "om", "oman", "global", "online", "national", "worldwide"}
    for candidate in (item.get("city"), item.get("locationCanonical"), item.get("region")):
        key = str(candidate or "").strip().lower()
        key = aliases.get(key, key)
        if key and key not in regions:
            return {"chennai": 330, "trichy": 330, "muscat": 240}.get(key, 0) * 60_000
    return 0


def _calendar_boundary_ms(key: str, item: dict[str, Any], *, next_day: bool = False) -> int | None:
    try:
        day = date.fromisoformat(key)
        if day.isoformat() != key:
            return None
    except (ValueError, TypeError):
        return None
    midnight_utc = datetime.combine(day + timedelta(days=int(next_day)),
                                    datetime.min.time(), tzinfo=timezone.utc)
    return int(midnight_utc.timestamp() * 1000) - _venue_day_offset_ms(item)


def _event_deadline_clock(value: Any, item: dict[str, Any], *, end: bool = False) -> int | None:
    raw = _ms(value)
    if raw is None or item.get("datePrecision") not in ("day", "range"):
        return raw
    if raw % DAY_MS:
        return raw
    key = datetime.fromtimestamp(raw / 1000, tz=timezone.utc).date().isoformat()
    if end and key == item.get("eventDateEndKey"):
        return _calendar_boundary_ms(key, item, next_day=True)
    if not end and key == item.get("eventDateKey"):
        return _calendar_boundary_ms(key, item)
    return raw


def _display_until_for_item(item: dict[str, Any], now_ms: int) -> tuple[int, str]:
    category = str(item.get("category") or "").lower()
    raw_expiry = _ms(item.get("expiryAt"))
    raw_end = _ms(item.get("eventEndAt"))
    # Match browser's inclusive date-only end sentinel semantics exactly.
    event_end = _event_deadline_clock(raw_end, item, end=True)
    event_start = _event_deadline_clock(item.get("eventStartAt"), item)
    expiry_at = (event_end if raw_end and raw_expiry == raw_end and
                 item.get("datePrecision") in ("day", "range") and
                 event_end != raw_end else raw_expiry)
    if event_end is None:
        key = item.get("eventDateEndExclusiveKey")
        end_key = item.get("eventDateEndKey")
        if isinstance(key, str):
            event_end = _calendar_boundary_ms(key, item)
        elif isinstance(end_key, str):
            event_end = _calendar_boundary_ms(end_key, item, next_day=True)
    published = next((_ms(item.get(key)) for key in
                      ('publishedAt', 'firstSeenAt', 'observedAt') if _ms(item.get(key))), None)

    if expiry_at is not None and (event_end is None or expiry_at <= event_end):
        deadline, reason = expiry_at, "expiryAt"
    elif event_end is not None:
        deadline, reason = event_end, "eventEndAt"
    elif event_start is not None:
        deadline, reason = event_start + DAY_MS, "eventStartAt_end_of_day"
    elif not published:
        return 0, "missing_source_time"
    elif category in OFFER_CATEGORIES:
        deadline, reason = published + OFFER_FALLBACK_HOURS * H_MS, "offer_48h_fallback"
    elif category in ALERT_CATEGORIES:
        deadline, reason = published + ALERT_FALLBACK_HOURS * H_MS, "alert_36h_fallback"
    else:
        return now_ms - 1, "missing_event_time"

    # An old cached copy cannot indefinitely extend a source's advertised validity.
    # Future-dated items are admitted separately: their seven-day evidence window
    # starts no earlier than the verified event occurrence, not at announcement.
    verified = next((_ms(item.get(key)) for key in
                     ("lastVerifiedAt", "observedAt", "firstSeenAt", "publishedAt")
                     if _ms(item.get(key))), None)
    if verified is None and event_start is None:
        return 0, "missing_source_clock"
    first_visible = _ms(item.get("firstVisibleAt"))
    # A future item has no active-display clock yet. Once first displayed, the
    # recorded clock (not a sliding evaluation date) starts its seven-day cap.
    evidence_anchor = max(verified or 0, first_visible or (event_start or 0))
    evidence_deadline = evidence_anchor + MAX_ACTIVE_WINDOW_HOURS * H_MS
    if deadline > evidence_deadline:
        return evidence_deadline, "max_7d_without_verified_refresh"
    return deadline, reason


def _effective_event_end_ms(item: dict[str, Any]) -> int | None:
    """Honor an inclusive calendar end in the venue's own time zone."""
    recorded = _event_deadline_clock(item.get("eventEndAt"), item, end=True)
    if recorded is not None:
        return recorded
    exclusive = item.get("eventDateEndExclusiveKey")
    if isinstance(exclusive, str):
        boundary = _calendar_boundary_ms(exclusive, item)
        if boundary is not None:
            return boundary
    inclusive = item.get("eventDateEndKey")
    if not isinstance(inclusive, str) and item.get("datePrecision") == "day":
        inclusive = item.get("eventDateKey")
    if isinstance(inclusive, str):
        return _calendar_boundary_ms(inclusive, item, next_day=True)
    return None


def _venue_local_date_key(timestamp_ms: int, item: dict[str, Any]) -> str:
    offset = _venue_day_offset_ms(item)
    return datetime.fromtimestamp((timestamp_ms + offset) / 1000,
                                  tz=timezone.utc).date().isoformat()


def _within_event_horizon(item: dict[str, Any], now_ms: int) -> bool:
    event_start = _event_deadline_clock(item.get("eventStartAt"), item)
    display_until, _reason = _display_until_for_item(item, now_ms)
    if event_start is None:
        return display_until >= now_ms
    end = _effective_event_end_ms(item)
    still_running = bool(end is not None and event_start <= now_ms < end)
    return (
        event_start <= now_ms + UPAHEAD_LOOKAHEAD_DAYS * DAY_MS
        and (still_running or event_start >= now_ms - UPAHEAD_EVENT_PAST_GRACE_HOURS * H_MS)
    )


def _within_planner_horizon(item: dict[str, Any], now_ms: int) -> bool:
    event_start = _event_deadline_clock(item.get("eventStartAt"), item)
    if event_start is None:
        return False
    end = _effective_event_end_ms(item)
    ongoing = end is not None and event_start <= now_ms < end

    # A UTC-midnight transport sentinel identifies a venue-local *date*, not
    # the UTC date containing the converted local-midnight instant.
    # Compare venue calendar keys so Muscat and Chennai remain eligible all day.
    on_event_day = False
    if item.get("datePrecision") in ("day", "range"):
        start_day = item.get("eventDateKey")
        if not isinstance(start_day, str):
            start_day = _venue_local_date_key(event_start, item)
        today = _venue_local_date_key(now_ms, item)
        exclusive_day = item.get("eventDateEndExclusiveKey")
        inclusive_day = item.get("eventDateEndKey")
        if isinstance(exclusive_day, str):
            on_event_day = start_day <= today < exclusive_day
        elif isinstance(inclusive_day, str):
            on_event_day = start_day <= today <= inclusive_day
        else:
            on_event_day = start_day == today

    return bool(ongoing or on_event_day or (
        now_ms - PLANNER_PAST_GRACE_HOURS * H_MS <= event_start
        <= now_ms + UPAHEAD_LOOKAHEAD_DAYS * DAY_MS
    ))


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


def active_published_bytes(items: list[dict[str, Any]]) -> int:
    """Count the actual indented JSON representation of the published items."""
    return len(json.dumps({"items": items}, indent=2, ensure_ascii=False).encode("utf-8"))


def bound_active_items(items: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Bound published active data deterministically, protecting urgent alerts.

    Category allocations are soft. Spare room is redistributed; hard item/byte
    limits always win. Any rejected safety alert must fail the release gate.
    """
    def ordering(row: dict[str, Any]) -> tuple:
        category = str(row.get("category") or "")
        urgency = 0 if category in SAFETY_CATEGORIES else 1
        expiry = (_ms(row.get("lifecycle", {}).get("displayUntil")) or 0)
        start = (_ms(row.get("eventStartAt")) or expiry)
        return (urgency, start, expiry, -float(row.get("actionabilityScore") or 0),
                category, str(row.get("occurrenceId") or row.get("id") or row.get("url") or ""))

    ordered = sorted(items, key=ordering)
    chosen: list[dict[str, Any]] = []
    chosen_ids: set[int] = set()
    selected_by_category = Counter()
    # Serialization size is additive for these JSON-indented list elements.
    # A single row contributes its one-row wrapper growth; each additional row
    # replaces the former closing item indent with a comma and sibling indent
    # (net -2 bytes versus two independently wrapped single-item payloads).
    # Computing a full growing JSON payload for every candidate was O(n²)
    # bytes encoded per three-hour refresh. Precompute each row once instead.
    empty_bytes = active_published_bytes([])
    row_deltas = [active_published_bytes([row]) - empty_bytes for row in ordered]
    active_bytes = empty_bytes
    byte_rejected_indexes: set[int] = set()

    def admit(index: int, row: dict[str, Any]) -> bool:
        nonlocal active_bytes
        if len(chosen) >= MAX_ACTIVE_ITEMS:
            return False
        next_bytes = active_bytes + row_deltas[index] - (2 if chosen else 0)
        if next_bytes > MAX_ACTIVE_BYTES:
            byte_rejected_indexes.add(index)
            return False
        chosen.append(row)
        chosen_ids.add(index)
        selected_by_category[str(row.get("category") or "unknown")] += 1
        active_bytes = next_bytes
        return True

    for index, row in enumerate(ordered):
        category = str(row.get("category") or "unknown")
        if selected_by_category[category] >= int(CATEGORY_SOFT_CAPS.get(category, MAX_ACTIVE_ITEMS)):
            continue
        admit(index, row)
    for index, row in enumerate(ordered):
        if index not in chosen_ids:
            admit(index, row)

    rejected = [row for index, row in enumerate(ordered) if index not in chosen_ids]
    rejected_by_category = Counter(str(row.get("category") or "unknown") for row in rejected)
    # Fail closed if the size arithmetic ever diverges from the actual v1
    # publisher JSON encoding; never publish a byte-cap estimate as proof.
    if active_bytes != active_published_bytes(chosen):
        raise ValueError("UpAhead bounded publication byte accounting mismatch")
    metrics = {
        "maxActiveItems": MAX_ACTIVE_ITEMS,
        "maxActiveBytes": MAX_ACTIVE_BYTES,
        "activeItemCount": len(chosen),
        "activeBytes": active_bytes,
        "rejectedActiveCount": len(rejected),
        "rejectedActiveByCategory": dict(sorted(rejected_by_category.items())),
        "rejectedSafetyAlertCount": sum(rejected_by_category.get(category, 0) for category in SAFETY_CATEGORIES),
        "oversizedOrByteRejectedCount": sum(index in byte_rejected_indexes for index in range(len(ordered)) if index not in chosen_ids),
        "maxTotalPublishedBytes": MAX_TOTAL_PUBLICATION_BYTES,
        "maxActiveWindowHours": MAX_ACTIVE_WINDOW_HOURS,
    }
    return chosen, metrics


def enrich_items(items: list[dict[str, Any]], now_ms: int) -> list[dict[str, Any]]:
    output = []
    for item in items or []:
        if not isinstance(item, dict):
            continue
        enriched = dict(item)
        lifecycle = lifecycle_for_item(enriched, now_ms)
        if lifecycle["isVisible"] and not _ms(enriched.get("firstVisibleAt")):
            enriched["firstVisibleAt"] = now_ms
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
    items, active_capacity = bound_active_items(items)
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
        'version': RETENTION_POLICY['policyVersion'], 'futureAdmissionDays': PENDING_LOOKAHEAD_DAYS,
        'maxPendingItems': MAX_PENDING_ITEMS, 'maxPendingBytes': MAX_PENDING_BYTES,
        'pendingItemCount': len(pending), 'pendingBytes': pending_bytes,
        'rejectedFutureCount': rejected, 'historyDays': 7,
        **active_capacity,
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
            previous = by_id.get(key)
            if previous and previous.get("firstVisibleAt") and not item.get("firstVisibleAt"):
                # An actual reschedule receives a new seven-day display window,
                # but an ordinary source update preserves the initial clock.
                if _ms(previous.get("eventStartAt")) == _ms(item.get("eventStartAt")):
                    item = {**item, "firstVisibleAt": previous["firstVisibleAt"]}
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
    for item in sorted(active, key=lambda row: (_ms(row.get("publishedAt")) or 0, str(row["id"])), reverse=True):
        event_start = _ms(item.get("eventStartAt"))
        location = item.get("city") or item.get("region") or ""
        # One event URL may be repeated under different IDs. A matching
        # headline and slot alone cannot identify the same source listing.
        event_listing = (item.get("url") or item["id"]) if item.get("category") == "events" else None
        key = (
            item.get("category"), location.casefold(),
            event_start, str(item.get('venue') or '').casefold(), item.get('sessionId'),
            item.get('occurrenceId'), event_listing,
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
