import time

from insight_source_policy import (
    build_source_health_policy_report,
    get_active_slot_feeds_map,
    load_source_policy,
    rank_slot_feeds_by_health,
    source_backoff_reason,
    source_health_score,
)


def assert_true(condition, message):
    if not condition:
        raise AssertionError(message)


def test_source_health_score_prefers_successful_item_yield():
    ts = int(time.time() * 1000)

    good = source_health_score({"ok": True, "items": 12, "lastSuccess": ts}, ts)
    empty = source_health_score({"ok": True, "items": 0, "lastSuccess": ts}, ts)
    failed = source_health_score({"ok": False, "items": 0, "lastChecked": ts}, ts)

    assert_true(good > empty, "good source should score higher than empty source")
    assert_true(empty > failed, "empty source should score higher than failed source")


def test_source_backoff_reason_for_recent_failure():
    ts = int(time.time() * 1000)
    reason = source_backoff_reason("bad_source", {
        "ok": False,
        "items": 0,
        "lastChecked": ts,
        "error": "timeout",
    }, ts)

    assert_true("recent failure backoff" in reason, "recent failed source should back off")


def test_rank_slot_feeds_by_health_orders_healthy_first():
    feeds = [
        {"url": "https://bad.example/rss", "source": "Bad", "sourceGroup": "bad", "tier": "A", "topic": "news"},
        {"url": "https://good.example/rss", "source": "Good", "sourceGroup": "good", "tier": "B", "topic": "news"},
    ]

    ts = int(time.time() * 1000)
    ranked = rank_slot_feeds_by_health(feeds, {
        "bad": {"ok": False, "items": 0, "lastChecked": ts},
        "good": {"ok": True, "items": 12, "lastSuccess": ts},
    }, ts)

    assert_true(ranked[0]["sourceGroup"] == "good", "healthy feed should rank first")
    assert_true(ranked[1]["backoffReason"], "failed feed should have backoff reason")


def test_active_slot_feeds_never_fully_empty():
    ts = int(time.time() * 1000)
    policy = load_source_policy()

    health = {}
    for slot, feeds in policy["slots"].items():
        for feed in feeds:
            health[feed["sourceGroup"]] = {
                "ok": False,
                "items": 0,
                "lastChecked": ts,
                "error": "forced failure",
            }

    active = get_active_slot_feeds_map(health, ts=ts)

    assert_true(all(active[slot] for slot in ["now", "minus4h", "minus12h", "minus24h"]), "active feeds must never be empty")


def test_source_health_policy_report_shape():
    ts = int(time.time() * 1000)
    report = build_source_health_policy_report({
        "the_hindu": {"ok": True, "items": 10, "lastSuccess": ts},
        "bbc": {"ok": False, "items": 0, "lastChecked": ts},
    }, ts=ts)

    assert_true(report["policyVersion"] == "insight-source-health-policy-v1", "policy version missing")
    assert_true("now" in report["slotReports"], "slot report missing")
    assert_true(report["slotReports"]["now"]["feedCount"] >= 1, "feed count missing")


def test_empty_feed_backoff_uses_observed_clock_and_eventually_ends():
    ts = 1_795_064_540_172
    health = {"ok": True, "items": 0, "checkedAt": ts}
    assert source_backoff_reason("economic_times", health, ts + 3_600_000)
    assert source_backoff_reason("economic_times", health, ts + 6 * 3_600_000) == ""
    assert source_backoff_reason("economic_times", {"ok": True, "items": 0}, ts) == ""


def test_current_zero_item_observation_is_not_replaced_by_old_success_clock():
    ts = 1_795_064_540_172
    health = {"ok": True, "items": 0, "lastZeroItemAt": ts, "lastSuccess": ts - 48 * 3_600_000}
    assert source_backoff_reason("economic_times", health, ts + 3_600_000)


def test_one_publisher_feed_cannot_disable_another_feed_from_that_publisher():
    ts = 1_795_064_540_172
    feeds = [
        {"url": "https://publisher.example/national", "source": "National", "sourceGroup": "same_publisher", "tier": "A", "topic": "national"},
        {"url": "https://publisher.example/markets", "source": "Markets", "sourceGroup": "same_publisher", "tier": "A", "topic": "markets"},
    ]
    rows = rank_slot_feeds_by_health(feeds, {"same_publisher": {
        "ok": False, "items": 0, "feedUrl": feeds[1]["url"], "lastChecked": ts,
    }}, ts)
    by_url = {row["url"]: row for row in rows}
    assert by_url[feeds[0]["url"]]["backoffReason"] == ""
    assert by_url[feeds[1]["url"]]["backoffReason"]


def test_failure_backoff_reads_native_collector_and_merged_health_clocks():
    ts = 1_795_064_540_172
    for field in ["checkedAt", "lastCheckedAt"]:
        assert source_backoff_reason("publisher", {"ok": False, field: ts}, ts + 1000)


def test_invalid_and_future_health_clocks_cannot_create_permanent_suppression():
    ts = 1_795_064_540_172
    for clock in [None, "bad", float("inf"), ts + 3_600_000, -1]:
        assert source_backoff_reason("publisher", {"ok": False, "lastChecked": clock}, ts) == ""


if __name__ == "__main__":
    test_source_health_score_prefers_successful_item_yield()
    test_source_backoff_reason_for_recent_failure()
    test_rank_slot_feeds_by_health_orders_healthy_first()
    test_active_slot_feeds_never_fully_empty()
    test_source_health_policy_report_shape()
    print("PASS: Insight adaptive source health Python tests")
