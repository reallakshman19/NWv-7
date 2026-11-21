"""Fixed-clock expiry, capacity and negative controls for Up Ahead retention v2."""
from __future__ import annotations

import json
from datetime import datetime, timezone

from enrich_upahead_contract import (
    DAY_MS, H_MS, MAX_ACTIVE_BYTES, MAX_ACTIVE_ITEMS, RETENTION_POLICY,
    active_published_bytes, bound_active_items, enrich_snapshot, lifecycle_for_item, merge_upahead_snapshot,
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


def test_inclusive_day_end_is_local_end_of_day_not_utc_start_of_day():
    def ms(iso):
        return int(datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp() * 1000)

    day_start = ms("2026-11-24T00:00:00Z")
    for city, deadline in [
        ("Chennai", ms("2026-11-24T18:30:00Z")),
        ("Muscat", ms("2026-11-24T20:00:00Z")),
    ]:
        row = item("calendar-" + city, city=city, datePrecision="day",
                   eventDateKey="2026-11-24", eventDateEndKey="2026-11-24",
                   eventStartAt=day_start, eventEndAt=day_start, expiryAt=day_start)
        assert lifecycle_for_item(row, ms("2026-11-24T12:00:00Z"))["displayUntil"] == deadline
        assert lifecycle_for_item(row, ms("2026-11-24T12:00:00Z"))["isVisible"]
        assert not lifecycle_for_item(row, deadline)["isVisible"]


def test_planner_keeps_local_calendar_day_after_six_hour_grace():
    """Regression from source row e1ba58117a92406d at main 96ede1ff.

    A Muscat 21-Nov day-precision event with no eventEndAt is still eligible
    at 09:36 local time; converting its UTC-midnight sentinel must not make
    today's occurrence appear to have ended on the previous UTC day.
    """
    def ms(iso):
        return int(datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp() * 1000)

    source_start = ms("2026-11-21T00:00:00Z")
    as_of = ms("2026-11-21T05:36:00Z")
    row = item("e1ba58117a92406d", category="sports", city="Muscat",
               datePrecision="day", eventDateKey="2026-11-21",
               eventStartAt=source_start, eventEndAt=None,
               expiryAt=ms("2026-11-21T20:00:00Z"),
               publishedAt=source_start - H_MS, observedAt=source_start)
    status = lifecycle_for_item(row, as_of)
    assert status["isActionValid"]
    assert status["isVisible"]
    assert status["plannerEligibleByLifecycle"]
    assert not lifecycle_for_item(row, ms("2026-11-21T20:00:00Z"))["plannerEligibleByLifecycle"]


def test_planner_inclusive_multi_day_range_uses_venue_local_event_end():
    def ms(iso):
        return int(datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp() * 1000)

    first = ms("2026-11-24T00:00:00Z")
    last = ms("2026-11-25T00:00:00Z")
    for city, end in [
        ("Chennai", ms("2026-11-25T18:30:00Z")),
        ("Muscat", ms("2026-11-25T20:00:00Z")),
    ]:
        event = item("two-day-" + city, city=city, datePrecision="range",
                     eventDateKey="2026-11-24", eventDateEndKey="2026-11-25",
                     eventStartAt=first, eventEndAt=last, expiryAt=last,
                     publishedAt=first, observedAt=first)
        assert lifecycle_for_item(event, ms("2026-11-25T12:00:00Z"))["plannerEligibleByLifecycle"]
        assert lifecycle_for_item(event, ms("2026-11-25T12:00:00Z"))["isVisible"]
        assert not lifecycle_for_item(event, end)["plannerEligibleByLifecycle"]


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


def test_first_visible_clock_caps_real_display_to_seven_days():
    long_event = item("long-running", eventStartAt=NOW + 6 * DAY_MS,
                      eventEndAt=NOW + 20 * DAY_MS, expiryAt=NOW + 20 * DAY_MS)
    first = merge_upahead_snapshot({}, [long_event], NOW, fetched=True)
    displayed = first["items"][0]
    assert displayed["firstVisibleAt"] == NOW
    assert displayed["lifecycle"]["displayUntil"] == NOW + 7 * DAY_MS
    expired = merge_upahead_snapshot(first, [], NOW + 8 * DAY_MS, fetched=False)
    assert not expired["items"]

    # Only a real revised publisher occurrence renews the stale-source ceiling.
    observed_again = {**long_event, "observedAt": NOW + 5 * DAY_MS}
    renewed = merge_upahead_snapshot(first, [observed_again], NOW + 5 * DAY_MS, fetched=True)
    assert renewed["items"][0]["firstVisibleAt"] == NOW
    assert renewed["items"][0]["lifecycle"]["displayUntil"] == NOW + 12 * DAY_MS
    assert merge_upahead_snapshot(renewed, [], NOW + 8 * DAY_MS, fetched=False)["items"]


def test_rescheduled_future_occurrence_resets_active_clock():
    old = item("reschedule", occurrenceId="same", eventStartAt=NOW + DAY_MS)
    first = merge_upahead_snapshot({}, [old], NOW, fetched=True)
    assert first["items"][0]["firstVisibleAt"] == NOW
    revision = {**old, "observedAt": NOW + H_MS, "eventStartAt": NOW + 30 * DAY_MS,
                "eventEndAt": NOW + 31 * DAY_MS, "expiryAt": NOW + 31 * DAY_MS}
    moved = merge_upahead_snapshot(first, [revision], NOW + H_MS, fetched=True)
    assert not moved["items"]
    assert len(moved["pendingItems"]) == 1
    assert not moved["pendingItems"][0].get("firstVisibleAt")
    entered = merge_upahead_snapshot(moved, [], NOW + 24 * DAY_MS, fetched=False)
    assert entered["items"][0]["firstVisibleAt"] == NOW + 24 * DAY_MS


def test_bounded_active_items_prioritizes_safety_and_never_silently_truncates():
    rows = [item(f"event-{i}") for i in range(MAX_ACTIVE_ITEMS + 25)]
    rows += [item(f"alert-{i}", category="weather_alerts") for i in range(10)]
    enriched = snapshot(rows)
    assert len(enriched["items"]) == MAX_ACTIVE_ITEMS
    assert len({r["id"] for r in enriched["items"]}) == MAX_ACTIVE_ITEMS
    assert all(any(s["id"] == f"alert-{i}" for s in enriched["items"]) for i in range(10))
    r = enriched["retention"]
    assert r["activeBytes"] == active_published_bytes(enriched["items"])
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
