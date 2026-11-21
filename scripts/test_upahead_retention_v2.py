"""Fixed-clock expiry, capacity and negative controls for Up Ahead retention v2."""
from __future__ import annotations

import json

from enrich_upahead_contract import (
    DAY_MS, H_MS, MAX_ACTIVE_BYTES, MAX_ACTIVE_ITEMS, RETENTION_POLICY,
    bound_active_items, enrich_snapshot, lifecycle_for_item, merge_upahead_snapshot,
)
from validate_upahead_prefetch_output import validate_snapshot

NOW = 1_800_000_000_000


def item(identifier="event", **overrides):
    base = {
        "id": identifier,
        "title": f"Verified item {identifier}",
        "url": f"https://example.org/{identifier}",
        "category": "events",
        "publishedAt": NOW,
        "observedAt": NOW,
        "eventStartAt": NOW + DAY_MS,
        "eventEndAt": NOW + 2 * DAY_MS,
        "expiryAt": NOW + 2 * DAY_MS,
        "plannerEligible": True,
        "actionabilityScore": 0.7,
    }
    base.update(overrides)
    return base


def snapshot(rows):
    return enrich_snapshot({"schemaVersion": 1, "fetchedAt": NOW,
                            "contentHash": "fixture", "items": rows}, NOW)


def test_default_alert_36h_and_offer_48h():
    alert = item("alert", category="alerts", eventStartAt=None, eventEndAt=None, expiryAt=None)
    offer = item("offer", category="shopping", eventStartAt=None, eventEndAt=None, expiryAt=None)
    assert lifecycle_for_item(alert, NOW + 35 * H_MS)["isVisible"]
    assert not lifecycle_for_item(alert, NOW + 36 * H_MS)["isVisible"]
    assert lifecycle_for_item(offer, NOW + 47 * H_MS)["isVisible"]
    assert not lifecycle_for_item(offer, NOW + 48 * H_MS)["isVisible"]


def test_explicit_expiry_wins_and_seven_day_cap_requires_reverification():
    offer = item("offer", category="shopping", eventStartAt=None, eventEndAt=None,
                 expiryAt=NOW + 20 * DAY_MS)
    first = lifecycle_for_item(offer, NOW)
    assert first["displayUntil"] == NOW + 7 * DAY_MS
    assert first["retentionReason"] == "max_7d_without_verified_refresh"
    assert not lifecycle_for_item(offer, NOW + 7 * DAY_MS)["isVisible"]
    revised = {**offer, "lastVerifiedAt": NOW + 6 * DAY_MS}
    assert lifecycle_for_item(revised, NOW + 8 * DAY_MS)["isVisible"]
    withdrawn = {**revised, "expiryAt": NOW + 2 * DAY_MS}
    assert not lifecycle_for_item(withdrawn, NOW + 6 * DAY_MS)["isVisible"]


def test_far_future_event_survives_pending_and_enters_seven_day_horizon():
    future = item("long-announced", eventStartAt=NOW + 30 * DAY_MS,
                  eventEndAt=NOW + 31 * DAY_MS, expiryAt=NOW + 31 * DAY_MS)
    first = merge_upahead_snapshot({}, [future], NOW, fetched=True)
    assert [r["id"] for r in first["pendingItems"]] == ["long-announced"]
    entered = merge_upahead_snapshot(first, [], NOW + 24 * DAY_MS, fetched=False)
    assert [r["id"] for r in entered["items"]] == ["long-announced"]
    expired = merge_upahead_snapshot(entered, [], NOW + 32 * DAY_MS, fetched=False)
    assert not expired["items"]


def test_bounded_active_items_prioritizes_safety_and_never_silently_truncates():
    rows = [item(f"event-{i}") for i in range(MAX_ACTIVE_ITEMS + 25)]
    rows += [item(f"alert-{i}", category="weather_alerts") for i in range(10)]
    enriched = snapshot(rows)
    assert len(enriched["items"]) == MAX_ACTIVE_ITEMS
    assert len({r["id"] for r in enriched["items"]}) == MAX_ACTIVE_ITEMS
    assert all(any(s["id"] == f"alert-{i}" for s in enriched["items"]) for i in range(10))
    r = enriched["retention"]
    assert r["activeBytes"] <= MAX_ACTIVE_BYTES
    assert r["rejectedActiveCount"] == 35
    assert r["rejectedSafetyAlertCount"] == 0
    report = validate_snapshot(enriched, NOW)
    assert not report["errors"]
    assert any("Capacity excluded" in warning for warning in report["warnings"])


def test_cap_overflow_of_safety_alerts_makes_publication_fail():
    rows = [item(f"alert-{i}", category="weather_alerts") for i in range(MAX_ACTIVE_ITEMS + 1)]
    enriched = snapshot(rows)
    assert enriched["retention"]["rejectedSafetyAlertCount"] == 1
    report = validate_snapshot(enriched, NOW)
    assert any("safety alert" in error for error in report["errors"])


def test_byte_limit_and_invalid_retention_manifest_rejected():
    # Large unique descriptions exercise byte capacity independent of item count.
    rows = [item(f"event-{i}", description=("X" * 140_000) + str(i)) for i in range(35)]
    enriched = snapshot(rows)
    assert len(enriched["items"]) < len(rows)
    assert enriched["retention"]["activeBytes"] <= MAX_ACTIVE_BYTES
    assert enriched["retention"]["rejectedActiveCount"] > 0
    assert not validate_snapshot(enriched, NOW)["errors"]
    enriched["retention"]["activeBytes"] = 1
    assert any("counts/bytes" in error for error in validate_snapshot(enriched, NOW)["errors"])


def test_policy_centralization_and_stamp():
    assert RETENTION_POLICY["minimumDefaultRetentionHours"] == 36
    assert RETENTION_POLICY["maximumActiveWindowHours"] == 168
    r = snapshot([item()])
    assert r["retention"]["version"] == "upahead-retention-v2"
    assert r["retention"]["activeItemCount"] == 1
    assert r["retention"]["maxActiveItems"] == MAX_ACTIVE_ITEMS
    assert not validate_snapshot(r, NOW)["errors"]
