"""Add explicit lifecycle/horizon metadata to public/data/up_ahead.json.

This is a post-fetch enrichment step. It intentionally does not fetch sources and
it does not decide browser rendering. The goal is to make the static snapshot's
concept auditable:
  - Up Ahead: future/actionable, now -> 7 days, with 24h event grace
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
    except (TypeError, ValueError):
        return None
    return parsed if parsed >= 0 else None


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
    published = _ms(item.get("publishedAt")) or now_ms

    if expiry_at is not None and (event_end is None or expiry_at <= event_end):
        return expiry_at, "expiryAt"
    if event_end is not None:
        return event_end, "eventEndAt"
    if event_start is not None:
        return event_start + DAY_MS, "eventStartAt_end_of_day"
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
    return (
        now_ms - PLANNER_PAST_GRACE_HOURS * H_MS
        <= event_start
        <= now_ms + UPAHEAD_LOOKAHEAD_DAYS * DAY_MS
    )


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
        "archiveUntil": max(int(display_until), int(now_ms)) + 7 * DAY_MS,
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
    ts = int(now_ms if now_ms is not None else snapshot.get("fetchedAt") or time.time() * 1000)
    input_items = snapshot.get("items", [])
    items = enrich_items(input_items, ts)
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
    enriched["lifecycleSummary"] = build_lifecycle_summary(items)
    enriched["lifecyclePrunedCount"] = max(0, len(input_items or []) - len(items))
    return enriched


def merge_upahead_snapshot(existing: dict, incoming: list[dict], ts: int, *, fetched: bool) -> dict:
    # The latest version of an occurrence can close it or move it to another day.
    # Apply that version before expiry and deduplication.
    by_id = {item["id"]: item for item in [*existing.get("items", []), *incoming] if item.get("id")}
    active = enrich_items(list(by_id.values()), ts)
    unique = {}
    for item in sorted(active, key=lambda row: row.get("publishedAt") or 0, reverse=True):
        event_start = _ms(item.get("eventStartAt"))
        location = item.get("city") or item.get("region") or ""
        key = (
            item.get("category"), location.casefold(),
            event_start // DAY_MS if event_start is not None else None,
            title_fingerprint(item.get("title", "")) or item["id"],
        )
        unique.setdefault(key, item)

    items = list(unique.values())
    snapshot = enrich_snapshot({
        "schemaVersion": 1,
        "fetchedAt": ts if fetched else existing.get("fetchedAt", 0),
        "contentHash": compute_content_hash(items),
        "items": items,
    }, ts)
    snapshot["lifecyclePrunedCount"] = len(by_id) - len(active)
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
