"""Up Ahead tab-specific ranker.

Up Ahead is not a news feed. It ranks future/actionable items across configured
locations, with separate handling for events, online/offline offers, alerts,
festivals, and Planner advisory signals.
"""
from __future__ import annotations

from collections import Counter
from typing import Any, Iterable

from ranking_contracts import GateResult, RankedItem, RankingResult, fail_gate, pass_gate, warn_gate, weighted_score
from ranking_gates import (
    CITY_ALIASES,
    DAY_MS,
    H_MS,
    actionability_gate,
    duplicate_gate,
    future_validity_score,
    int_ms,
    location_gate,
    source_confidence_score,
    text_blob,
)

RANKING_PROFILE = "upAhead-v2-lifecycle-location-category"
DEFAULT_LOCATIONS = ("muscat", "chennai", "trichy")

OFFER_CATEGORIES = {"shopping", "offer", "offers", "deal", "deals", "airlines", "travel_deal"}
ALERT_CATEGORIES = {"alerts", "alert", "weather_alerts", "weather", "civic", "traffic"}
FESTIVAL_CATEGORIES = {"festivals", "festival", "observance", "holiday"}
EVENT_CATEGORIES = {"events", "event", "movies", "sports"}

CATEGORY_PRIORITY = {
    "alerts": 1.00,
    "weather_alerts": 0.98,
    "traffic": 0.94,
    "civic": 0.92,
    "events": 0.82,
    "sports": 0.80,
    "movies": 0.76,
    "festivals": 0.72,
    "shopping": 0.68,
    "airlines": 0.74,
    "travel_deal": 0.74,
}

SCORE_WEIGHTS = {
    "lifecycleScore": 0.25,
    "locationScore": 0.20,
    "actionabilityScore": 0.15,
    "categoryPriorityScore": 0.15,
    "sourceConfidenceScore": 0.10,
    "urgencyOrExpiryScore": 0.10,
    "plannerFitScore": 0.05,
}

SEVERE_TERMS = ("severe", "red alert", "closure", "cancelled", "canceled", "flood", "storm", "strike", "emergency")
ONLINE_TERMS = ("online", "app", "website", "web", "digital", "e-commerce", "ecommerce")


def normalize_category(item: dict[str, Any]) -> str:
    raw = str(item.get("category") or item.get("type") or "events").strip().lower()
    if raw in OFFER_CATEGORIES:
        if "airline" in raw or "travel" in raw:
            return "travel_deal"
        return "shopping"
    if raw in ALERT_CATEGORIES:
        if raw in {"weather", "weather_alerts"}:
            return "weather_alerts"
        return raw if raw in CATEGORY_PRIORITY else "alerts"
    if raw in FESTIVAL_CATEGORIES:
        return "festivals"
    if raw in EVENT_CATEGORIES:
        return raw if raw in CATEGORY_PRIORITY else "events"
    return raw or "events"


def item_id(item: dict[str, Any], index: int) -> str:
    return str(item.get("id") or item.get("url") or f"upahead-{index}")


def item_title(item: dict[str, Any]) -> str:
    return str(item.get("title") or item.get("name") or "Untitled Up Ahead item").strip()


def is_alert_category(category: str) -> bool:
    return category in ALERT_CATEGORIES or category in {"weather_alerts", "traffic", "civic"}


def is_offer_category(category: str) -> bool:
    return category in {"shopping", "travel_deal", "airlines"}


def is_online_item(item: dict[str, Any]) -> bool:
    blob = text_blob(item)
    return bool(item.get("onlineOnly")) or any(term in blob for term in ONLINE_TERMS)


def explicit_location_key(item: dict[str, Any], configured_locations: Iterable[str]) -> str | None:
    direct_text = " ".join(
        str(item.get(key) or "")
        for key in ("location", "city", "region", "country", "venue")
    ).lower()
    if not direct_text.strip():
        return None
    padded = f" {direct_text} "
    for raw_loc in configured_locations:
        loc = str(raw_loc or "").strip().lower()
        if not loc:
            continue
        aliases = CITY_ALIASES.get(loc, {loc})
        if any(f" {alias} " in padded for alias in aliases):
            return loc
    return None


def display_until(item: dict[str, Any], now_ms: int) -> int | None:
    lifecycle = item.get("lifecycle") if isinstance(item.get("lifecycle"), dict) else {}
    for value in (
        lifecycle.get("displayUntil"),
        item.get("displayUntil"),
        item.get("expiryAt"),
        item.get("eventEndAt"),
    ):
        parsed = int_ms(value)
        if parsed is not None:
            return parsed

    event_start = int_ms(item.get("eventStartAt"))
    if event_start is not None:
        return event_start + DAY_MS

    published = int_ms(item.get("publishedAt")) or now_ms
    category = normalize_category(item)
    if is_alert_category(category):
        return published + 36 * H_MS
    if is_offer_category(category):
        return published + 48 * H_MS
    return None


def lifecycle_gate(item: dict[str, Any], now_ms: int) -> GateResult:
    lifecycle = item.get("lifecycle") if isinstance(item.get("lifecycle"), dict) else {}
    if lifecycle:
        if lifecycle.get("isVisible") is False:
            return fail_gate("lifecycle", "item lifecycle marks it not visible", lifecycle=lifecycle)
        if lifecycle.get("isActionValid") is False:
            return fail_gate("lifecycle", "item lifecycle marks action invalid", lifecycle=lifecycle)

    return future_validity_score(
        event_start_at=item.get("eventStartAt"),
        display_until=display_until(item, now_ms),
        now_ms=now_ms,
        lookahead_days=7,
        past_grace_hours=24,
    )


def offer_validity_gate(item: dict[str, Any], category: str, now_ms: int) -> GateResult:
    if not is_offer_category(category):
        return pass_gate("offerValidity", 1.0, "not an offer")
    until = display_until(item, now_ms)
    if until is None:
        return fail_gate("offerValidity", "offer missing expiry/displayUntil")
    if until < now_ms:
        return fail_gate("offerValidity", "offer expired", displayUntil=until)
    hours_left = max(0, (until - now_ms) / H_MS)
    if hours_left <= 24:
        return pass_gate("offerValidity", 1.0, "offer expires soon", hoursLeft=round(hours_left, 2))
    if hours_left <= 72:
        return pass_gate("offerValidity", 0.82, "offer active within three days", hoursLeft=round(hours_left, 2))
    return warn_gate("offerValidity", 0.62, "long-running offer active but less urgent", hoursLeft=round(hours_left, 2))


def alert_urgency_gate(item: dict[str, Any], category: str, now_ms: int) -> GateResult:
    if not is_alert_category(category):
        return pass_gate("alertUrgency", 0.6, "not an alert")
    blob = text_blob(item)
    until = display_until(item, now_ms)
    if until is not None and until < now_ms:
        return fail_gate("alertUrgency", "alert expired", displayUntil=until)
    severe = any(term in blob for term in SEVERE_TERMS) or str(item.get("severity") or "").lower() in {"high", "severe", "red"}
    if severe:
        return pass_gate("alertUrgency", 1.0, "severe/active alert", severe=True)
    return pass_gate("alertUrgency", 0.78, "active alert", severe=False)


def planner_fit_score(item: dict[str, Any], now_ms: int) -> float:
    lifecycle = item.get("lifecycle") if isinstance(item.get("lifecycle"), dict) else {}
    if lifecycle.get("plannerEligibleByLifecycle"):
        return 1.0
    if not item.get("plannerEligible"):
        return 0.0
    event_start = int_ms(item.get("eventStartAt"))
    if event_start is None:
        return 0.35
    if now_ms - 6 * H_MS <= event_start <= now_ms + 7 * DAY_MS:
        return 0.86
    return 0.0


def urgency_or_expiry_score(item: dict[str, Any], category: str, now_ms: int) -> float:
    if is_alert_category(category):
        return alert_urgency_gate(item, category, now_ms).score
    until = display_until(item, now_ms)
    if until is None:
        return 0.4
    hours_left = max(0, (until - now_ms) / H_MS)
    if hours_left <= 24:
        return 1.0
    if hours_left <= 72:
        return 0.82
    return max(0.45, 1 - hours_left / (7 * 24))


def location_gate_for_upahead(item: dict[str, Any], category: str, locations: Iterable[str]) -> GateResult:
    if is_offer_category(category) and not is_online_item(item):
        return location_gate(item, list(locations), allow_online=False)
    return location_gate(item, list(locations), allow_online=True)


def score_item(
    item: dict[str, Any],
    *,
    index: int,
    now_ms: int,
    configured_locations: Iterable[str],
    seen_keys: set[str],
) -> tuple[RankedItem | None, list[str]]:
    category = normalize_category(item)
    diagnostics: list[str] = []

    gates = [
        duplicate_gate(item, seen_keys),
        lifecycle_gate(item, now_ms),
        location_gate_for_upahead(item, category, configured_locations),
        actionability_gate(item, require_time_or_place=not is_online_item(item)),
        offer_validity_gate(item, category, now_ms),
        alert_urgency_gate(item, category, now_ms),
    ]

    failed = [gate for gate in gates if gate.status == "FAIL"]
    if failed:
        diagnostics.extend(f"{item_title(item)}: {gate.name} failed — {gate.reason}" for gate in failed)
        return None, diagnostics

    parts = {
        "lifecycleScore": gates[1].score,
        "locationScore": gates[2].score,
        "actionabilityScore": gates[3].score,
        "categoryPriorityScore": CATEGORY_PRIORITY.get(category, 0.5),
        "sourceConfidenceScore": source_confidence_score(item),
        "urgencyOrExpiryScore": urgency_or_expiry_score(item, category, now_ms),
        "plannerFitScore": planner_fit_score(item, now_ms),
    }
    score = weighted_score(parts, SCORE_WEIGHTS)
    ranking_reasons = [
        category,
        gates[1].reason,
        gates[2].reason,
    ]
    if parts["plannerFitScore"] > 0:
        ranking_reasons.append("planner advisory fit")

    location_details = gates[2].details
    direct_location_key = explicit_location_key(item, configured_locations)
    ranked = RankedItem(
        item_id=item_id(item, index),
        title=item_title(item),
        score=score,
        category=category,
        location_key=str(direct_location_key or location_details.get("matchedLocation") or "unknown"),
        ranking_reasons=tuple(reason for reason in ranking_reasons if reason),
        gates=tuple(gates),
        item={**item, "normalizedCategory": category, "scoreBreakdown": parts},
    )
    return ranked, diagnostics


def rank_upahead_items(
    items: list[dict[str, Any]],
    *,
    now_ms: int,
    configured_locations: Iterable[str] = DEFAULT_LOCATIONS,
    limit: int = 30,
) -> RankingResult:
    seen_keys: set[str] = set()
    ranked: list[RankedItem] = []
    diagnostics: list[str] = []
    suppressed_count = 0

    for index, item in enumerate(items or []):
        if not isinstance(item, dict):
            suppressed_count += 1
            diagnostics.append("non-dict item suppressed")
            continue
        ranked_item, item_diagnostics = score_item(
            item,
            index=index,
            now_ms=now_ms,
            configured_locations=configured_locations,
            seen_keys=seen_keys,
        )
        diagnostics.extend(item_diagnostics)
        if ranked_item is None:
            suppressed_count += 1
            continue
        ranked.append(ranked_item)

    ranked.sort(key=lambda item: (-item.score, item.category, item.title))
    selected = ranked[:limit]

    category_counts = Counter(item.category for item in selected)
    location_counts = Counter(item.location_key for item in selected)
    online_offers = sum(1 for item in selected if item.category in {"shopping", "travel_deal"} and is_online_item(item.item))
    offline_offers = sum(1 for item in selected if item.category in {"shopping", "travel_deal"} and not is_online_item(item.item))
    alerts = sum(1 for item in selected if is_alert_category(item.category))
    events = sum(1 for item in selected if item.category in {"events", "sports", "movies"})
    festivals = sum(1 for item in selected if item.category == "festivals")
    planner = sum(1 for item in selected if item.item.get("scoreBreakdown", {}).get("plannerFitScore", 0) > 0)

    score_breakdown = {
        "lifecycleScore": _avg_item_part(selected, "lifecycleScore"),
        "locationScore": _avg_item_part(selected, "locationScore"),
        "actionabilityScore": _avg_item_part(selected, "actionabilityScore"),
        "categoryPriorityScore": _avg_item_part(selected, "categoryPriorityScore"),
        "sourceConfidenceScore": _avg_item_part(selected, "sourceConfidenceScore"),
        "urgencyOrExpiryScore": _avg_item_part(selected, "urgencyOrExpiryScore"),
        "plannerFitScore": _avg_item_part(selected, "plannerFitScore"),
    }

    gates: list[GateResult] = []
    if not selected:
        gates.append(fail_gate("upAheadPool", "no rankable Up Ahead items", suppressedCount=suppressed_count))
    else:
        gates.append(pass_gate("upAheadPool", min(1.0, len(selected) / 8), "rankable Up Ahead pool", itemCount=len(selected)))
    if alerts + events + festivals + online_offers + offline_offers < 2 and selected:
        gates.append(warn_gate("categoryCoverage", 0.5, "thin category coverage", categoryCounts=dict(category_counts)))
    else:
        gates.append(pass_gate("categoryCoverage", min(1.0, max(1, len(category_counts)) / 4), "category coverage available", categoryCounts=dict(category_counts)))

    return RankingResult(
        destination="upAhead",
        ranking_profile=RANKING_PROFILE,
        ranked_items=tuple(selected),
        gate_results=tuple(gates),
        score_breakdown=score_breakdown,
        diagnostic_reasons=tuple(diagnostics[:20]),
        actionable_findings=tuple(_actionable_findings(selected, suppressed_count, category_counts, location_counts)),
        gate_summary={
            "inputItemCount": len(items or []),
            "rankedItemCount": len(selected),
            "suppressedItemCount": suppressed_count,
            "events": events,
            "onlineOffers": online_offers,
            "offlineOffers": offline_offers,
            "alerts": alerts,
            "festivals": festivals,
            "plannerAdvisoryItems": planner,
            "categoryCounts": dict(category_counts),
            "locationCounts": dict(location_counts),
            "locationsCovered": sorted(k for k in location_counts if k not in {"unknown"}),
        },
    )


def _avg_item_part(items: list[RankedItem], key: str) -> float:
    if not items:
        return 0.0
    values = [float(item.item.get("scoreBreakdown", {}).get(key, 0.0) or 0.0) for item in items]
    return round(sum(values) / len(items), 4)


def _actionable_findings(
    selected: list[RankedItem],
    suppressed_count: int,
    category_counts: Counter,
    location_counts: Counter,
) -> list[str]:
    findings: list[str] = []
    if suppressed_count:
        findings.append(f"{suppressed_count} invalid/expired/duplicate Up Ahead item(s) suppressed")
    if not any(category in category_counts for category in ("alerts", "weather_alerts", "traffic", "civic")):
        findings.append("no active alert items in ranked Up Ahead set")
    if not any(category in category_counts for category in ("shopping", "travel_deal")):
        findings.append("no active offer items in ranked Up Ahead set")
    for loc in DEFAULT_LOCATIONS:
        if loc not in location_counts:
            findings.append(f"no ranked Up Ahead item for {loc}")
    if selected and len(category_counts) == 1:
        findings.append("ranked Up Ahead set is category-dominated")
    return findings[:12]
