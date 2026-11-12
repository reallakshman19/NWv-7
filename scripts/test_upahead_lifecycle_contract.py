from enrich_upahead_contract import (
    DAY_MS,
    H_MS,
    enrich_snapshot,
    lifecycle_for_item,
    merge_upahead_snapshot,
)
import validate_upahead_prefetch_output as gate

NOW = 1_000_000_000_000


def item(**overrides):
    base = {
        "id": "item-1",
        "title": "Community event",
        "url": "https://example.com/item-1",
        "category": "events",
        "publishedAt": NOW,
        "eventStartAt": NOW + DAY_MS,
        "eventEndAt": None,
        "expiryAt": None,
        "plannerEligible": True,
        "localityScore": 1,
    }
    base.update(overrides)
    return base


def test_event_inside_7_day_horizon_is_visible_and_planner_eligible():
    lifecycle = lifecycle_for_item(item(), NOW)
    assert lifecycle["contentClass"] == "upahead_event"
    assert lifecycle["withinSevenDayHorizon"] is True
    assert lifecycle["plannerPastGraceHours"] == 6
    assert lifecycle["plannerEligibleByLifecycle"] is True


def test_upahead_allows_24h_past_event_but_planner_only_6h():
    old_event = item(eventStartAt=NOW - 12 * H_MS, expiryAt=NOW + H_MS, plannerEligible=True)
    lifecycle = lifecycle_for_item(old_event, NOW)
    assert lifecycle["withinSevenDayHorizon"] is True
    assert lifecycle["plannerEligibleByLifecycle"] is False


def test_event_beyond_7_days_is_not_visible():
    far = item(eventStartAt=NOW + 8 * DAY_MS, expiryAt=NOW + 8 * DAY_MS)
    lifecycle = lifecycle_for_item(far, NOW)
    assert lifecycle["withinSevenDayHorizon"] is False
    assert lifecycle["isVisible"] is False


def test_alert_and_offer_use_validity_fallbacks_not_news_36h():
    alert = lifecycle_for_item(item(category="alerts", eventStartAt=None, expiryAt=None, publishedAt=NOW - 23 * H_MS), NOW)
    stale_alert = lifecycle_for_item(item(category="alerts", eventStartAt=None, expiryAt=None, publishedAt=NOW - 25 * H_MS), NOW)
    offer = lifecycle_for_item(item(category="shopping", eventStartAt=None, expiryAt=None, publishedAt=NOW - 47 * H_MS), NOW)
    assert alert["retentionReason"] == "alert_24h_fallback"
    assert alert["isVisible"] is True
    assert stale_alert["isVisible"] is False
    assert offer["retentionReason"] == "offer_48h_fallback"
    assert offer["isVisible"] is True
    assert offer["plannerEligibleByLifecycle"] is False


def test_enriched_snapshot_has_horizon_and_lifecycle_summary():
    snapshot = {
        "schemaVersion": 1,
        "fetchedAt": NOW,
        "contentHash": "abc",
        "items": [item(id="event-1"), item(id="offer-1", category="shopping", eventStartAt=None, expiryAt=None)],
    }
    enriched = enrich_snapshot(snapshot, NOW)
    assert enriched["contractVersion"] == "upahead-lifecycle-v1"
    assert enriched["horizon"]["lookaheadDays"] == 7
    assert enriched["horizon"]["plannerPastGraceHours"] == 6
    assert all("lifecycle" in x for x in enriched["items"])
    assert enriched["lifecycleSummary"]["itemCount"] == 2


def test_enrichment_prunes_dated_items_outside_7_day_horizon():
    snapshot = {
        "schemaVersion": 1,
        "fetchedAt": NOW,
        "contentHash": "abc",
        "items": [
            item(id="inside", eventStartAt=NOW + DAY_MS, expiryAt=NOW + DAY_MS),
            item(id="far-future", eventStartAt=NOW + 8 * DAY_MS, expiryAt=NOW + 8 * DAY_MS),
            item(id="too-old", eventStartAt=NOW - 2 * DAY_MS, expiryAt=NOW + H_MS),
        ],
    }
    enriched = enrich_snapshot(snapshot, NOW)
    ids = {x["id"] for x in enriched["items"]}
    assert ids == {"inside"}
    assert enriched["lifecyclePrunedCount"] == 2
    assert enriched["lifecycleSummary"]["horizonViolationCount"] == 0


def test_publisher_keeps_active_omissions_applies_revisions_and_prunes_expiry():
    original = {
        "fetchedAt": NOW - H_MS,
        "items": [
            item(id="multi-day", title="Expo", eventStartAt=NOW - 2 * DAY_MS, eventEndAt=NOW + DAY_MS),
            item(id="cancelled", title="Cancelled event"),
            item(id="outdated", title="Old alert", category="alerts", eventStartAt=None, expiryAt=NOW),
            item(id="chennai", title="Community workshop", city="Chennai"),
        ],
    }
    fresh = [
        item(id="cancelled", title="Cancelled event", expiryAt=NOW),
        item(id="muscat", title="Community workshop", city="Muscat"),
        item(id="same-chennai", title="Community workshop", city="Chennai", publishedAt=NOW - H_MS),
        item(id="new-day", title="Community workshop", city="Chennai", eventStartAt=NOW + 2 * DAY_MS),
    ]
    snapshot = merge_upahead_snapshot(original, fresh, NOW, fetched=True)
    assert {row["id"] for row in snapshot["items"]} == {"multi-day", "chennai", "muscat", "new-day"}
    assert snapshot["fetchedAt"] == NOW
    assert snapshot["lifecycleSummary"]["visibleItemCount"] == 4
    retry = merge_upahead_snapshot(snapshot, [], NOW + H_MS, fetched=False)
    assert retry["contentHash"] == snapshot["contentHash"]
    assert retry["fetchedAt"] == NOW


def test_validator_fails_missing_lifecycle_contract():
    report = gate.validate_snapshot({
        "schemaVersion": 1,
        "fetchedAt": NOW,
        "contentHash": "abc",
        "items": [item()],
    }, NOW)
    assert report["status"] == "FAIL"
    assert any("contractVersion" in error for error in report["errors"])


def test_validator_passes_enriched_snapshot_shape():
    enriched = enrich_snapshot({
        "schemaVersion": 1,
        "fetchedAt": NOW,
        "contentHash": "abc",
        "items": [
            item(id="event-1"),
            item(id="offer-1", category="shopping", eventStartAt=None, expiryAt=None),
            item(id="far-future", eventStartAt=NOW + 8 * DAY_MS, expiryAt=NOW + 8 * DAY_MS),
        ],
    }, NOW)
    report = gate.validate_snapshot(enriched, NOW)
    assert report["status"] in ("PASS", "WARN")
    assert not report["errors"]
    assert report["horizon"]["lookaheadDays"] == 7
    assert report["horizon"]["plannerPastGraceHours"] == 6
