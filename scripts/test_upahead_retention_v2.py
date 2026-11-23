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


def test_matching_event_headlines_do_not_discard_distinct_source_listings():
    shared = dict(title="Intro to Robotics Workshop", city="Chennai",
                  venue="IIT Madras Research Park")
    first = item("listing-a", **shared)
    second = item("listing-b", **shared)
    repeat = item("listing-a-copy", url=first["url"], publishedAt=NOW - H_MS, **shared)
    forward = merge_upahead_snapshot({}, [first, second, repeat], NOW, fetched=True)
    reverse = merge_upahead_snapshot({}, [repeat, second, first], NOW, fetched=True)

    assert [row["url"] for row in forward["items"]] == [first["url"], second["url"]]
    assert forward["items"] == reverse["items"]
    assert forward["contentHash"] == reverse["contentHash"]
    assert not validate_snapshot(forward, NOW)["errors"]

    replay = merge_upahead_snapshot(forward, [second], NOW + 3 * H_MS, fetched=True)
    assert {row["id"] for row in replay["items"]} == {first["id"], second["id"]}


def test_revised_occurrences_sharing_a_source_page_stay_distinct():
    shared = dict(title="Intro to Robotics Workshop", city="Chennai",
                  venue="IIT Madras Research Park", url="https://example.org/robotics")
    originals = [item(f"listing-{slot}", occurrenceId=f"occurrence-{slot}", **shared)
                 for slot in ("a", "b")]
    first = merge_upahead_snapshot({}, originals, NOW, fetched=True)
    as_of = NOW + 3 * H_MS
    revisions = [
        item(f"revision-{slot}", revisionOf=f"occurrence-{slot}", observedAt=as_of,
             eventStartAt=NOW + 2 * DAY_MS, eventEndAt=NOW + 3 * DAY_MS,
             expiryAt=NOW + 3 * DAY_MS, **shared)
        for slot in ("a", "b")
    ]
    for order in (revisions, revisions[::-1]):
        updated = merge_upahead_snapshot(first, order, as_of, fetched=True)
        assert [row["id"] for row in updated["items"]] == ["revision-a", "revision-b"]
        assert not validate_snapshot(updated, as_of)["errors"]


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


def test_linear_byte_accounting_matches_exact_pretty_json_for_unicode_and_nested_rows():
    """Capacity accounting must never estimate below published UTF-8 bytes."""
    rows = [item(f"unicode-{i}", title=f"Workshop 😀 क़هوة {i}",
                 metadata={"source": {"nested": ["ø", "€", i], "flag": bool(i % 2)}},
                 category="weather_alerts" if i % 61 == 0 else "events")
            for i in range(MAX_ACTIVE_ITEMS + 17)]
    chosen, receipt = bound_active_items(rows)
    assert receipt["activeBytes"] == active_published_bytes(chosen)
    assert receipt["activeItemCount"] == len(chosen) == MAX_ACTIVE_ITEMS
    assert receipt["rejectedSafetyAlertCount"] == 0
    assert receipt["rejectedActiveCount"] == 17
    assert receipt["activeBytes"] <= MAX_ACTIVE_BYTES


def test_linear_capacity_is_order_invariant_and_zero_items_are_exact():
    empty, empty_meta = bound_active_items([])
    assert empty == []
    assert empty_meta["activeBytes"] == active_published_bytes([])
    rows = [item(f"source-{i}", category="events" if i % 5 else "shopping",
                 summary="अخبار - 🔔 " * (i % 13 + 1)) for i in range(140)]
    first, first_meta = bound_active_items(rows)
    second, second_meta = bound_active_items(list(reversed(rows)))
    assert [row["id"] for row in first] == [row["id"] for row in second]
    assert first_meta == second_meta
    assert first_meta["activeBytes"] == active_published_bytes(first)


def test_linear_capacity_rejects_oversize_without_dropping_smaller_safety_alert():
    rows = [
        item("huge-event", description="€" * (MAX_ACTIVE_BYTES // 2)),
        item("small-safety", category="weather_alerts", title="Weather alert"),
    ]
    chosen, result = bound_active_items(rows)
    assert [row["id"] for row in chosen] == ["small-safety"]
    assert result["rejectedActiveCount"] == 1
    assert result["rejectedSafetyAlertCount"] == 0
    assert result["activeBytes"] == active_published_bytes(chosen)


def test_56_three_hour_refresh_intervals_cover_seven_day_cap_and_no_resurrection():
    """57 publisher snapshots separated by exactly 3h (56 intervals = 7d).

    Simulated publisher code, NOT 56 successful live runs or Pages/Worker proof.
    Incoming source observations are independently reverified or omitted at
    explicit cycles; unrelated refreshes must not renew source item clocks.
    """
    stale_offer = item("no-longer-verified-deal", category="shopping",
                       eventStartAt=None, eventEndAt=None,
                       expiryAt=NOW + 20 * DAY_MS, publishedAt=NOW, observedAt=NOW)
    future_event = item("future-long-event", eventStartAt=NOW + 6 * DAY_MS,
                        eventEndAt=NOW + 20 * DAY_MS, expiryAt=NOW + 20 * DAY_MS)
    warning = item("official-warning", category="weather_alerts",
                   source="oman-warnings", occurrenceId="oman-warnings:storm-A",
                   eventStartAt=NOW, eventEndAt=NOW + 12 * DAY_MS,
                   expiryAt=NOW + 12 * DAY_MS)
    cancelled = item("cancelled-warning", category="weather_alerts",
                     source="oman-warnings", occurrenceId="oman-warnings:storm-CANCEL",
                     retireOccurrenceId="oman-warnings:storm-A",
                     suppressionReason="Cancelled official warning",
                     eventStartAt=NOW + 2 * DAY_MS, eventEndAt=None,
                     expiryAt=NOW + 2 * DAY_MS - 1)

    snap = {}
    receipts = []
    for cycle in range(57):
        as_of = NOW + cycle * 3 * H_MS
        incoming = [stale_offer, future_event, warning] if cycle == 0 else []
        if cycle == 16:  # Two days: verified official cancellation
            incoming = [{**cancelled, "observedAt": as_of}]
        if cycle == 24:  # Three days: stale original bulletin replay
            incoming = [{**warning, "observedAt": NOW}]
        if cycle == 48:  # Six days: verified independent future event refresh
            incoming = [{**future_event, "observedAt": as_of}]
        snap = merge_upahead_snapshot(snap, incoming, as_of, fetched=True)
        active = {row["id"] for row in snap["items"]}
        receipts.append(active)
        assert snap["fetchedAt"] == as_of
        assert not validate_snapshot(snap, as_of)["errors"]
        assert len(snap["items"]) <= MAX_ACTIVE_ITEMS
        assert not (cycle >= 16 and "official-warning" in active)
        assert not (cycle >= 56 and "no-longer-verified-deal" in active)
        assert len(snap.get("retiredOccurrences", [])) <= 1

    assert len(receipts) == 57
    assert "no-longer-verified-deal" in receipts[48]
    assert "no-longer-verified-deal" not in receipts[56]
    assert "future-long-event" in receipts[56]
    assert "official-warning" not in receipts[56]

    # A subsequent offline replay must not slide clocks or reinstate tombstones;
    # validator accurately reports stale publisher receipts, not false PASS.
    day_eight = merge_upahead_snapshot(snap, [], NOW + 8 * DAY_MS, fetched=False)
    remaining = {row["id"] for row in day_eight["items"]}
    assert "no-longer-verified-deal" not in remaining
    assert "official-warning" not in remaining
    assert "future-long-event" in remaining
    assert validate_snapshot(day_eight, NOW + 8 * DAY_MS)["errors"]
    assert all("stale" in error.lower()
               for error in validate_snapshot(day_eight, NOW + 8 * DAY_MS)["errors"])
