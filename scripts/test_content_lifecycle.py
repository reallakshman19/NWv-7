import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from horizon_policy import DAY_MS, H_MS
from content_lifecycle import (
    lifecycle_for_alert,
    lifecycle_for_event,
    lifecycle_for_market_snapshot,
    lifecycle_for_news_story,
    lifecycle_for_offer,
    lifecycle_for_planner_item,
    lifecycle_for_weather_forecast,
)


def test_news_expires_at_36h_boundary():
    lc = lifecycle_for_news_story(published_at=0, now_ms=36 * H_MS, retain_hours=36)
    assert lc["contentClass"] == "news_story"
    assert lc["retentionReason"] == "news_36h_freshness"
    assert lc["isVisible"] is True

    lc2 = lifecycle_for_news_story(published_at=0, now_ms=36 * H_MS + 1, retain_hours=36)
    assert lc2["isVisible"] is False


def test_travel_news_uses_news_window_when_declared_as_news():
    lc = lifecycle_for_news_story(
        published_at=0,
        now_ms=36 * H_MS + 1,
        retain_hours=36,
        content_class="travel_news_story",
    )
    assert lc["contentClass"] == "travel_news_story"
    assert lc["isVisible"] is False


def test_event_horizon_boundaries():
    now = 7 * DAY_MS
    inside = lifecycle_for_event(
        event_start_at=now + 7 * DAY_MS,
        event_end_at=None,
        expiry_at=None,
        now_ms=now,
    )
    outside = lifecycle_for_event(
        event_start_at=now + 7 * DAY_MS + 1,
        event_end_at=None,
        expiry_at=None,
        now_ms=now,
    )
    assert inside["withinSevenDayHorizon"] is True
    assert inside["isVisible"] is True
    assert outside["withinSevenDayHorizon"] is False
    assert outside["isVisible"] is False


def test_planner_has_6h_past_grace_not_24h():
    now = 24 * H_MS
    ok = lifecycle_for_planner_item(event_start_at=now - 6 * H_MS, expiry_at=None, now_ms=now)
    too_old = lifecycle_for_planner_item(event_start_at=now - 6 * H_MS - 1, expiry_at=None, now_ms=now)
    assert ok["withinSevenDayHorizon"] is True
    assert too_old["withinSevenDayHorizon"] is False


def test_forecast_uses_validity_not_news_window():
    lc = lifecycle_for_weather_forecast(issued_at=0, valid_until=12 * H_MS, now_ms=20 * H_MS)
    assert lc["contentClass"] == "weather_forecast"
    assert lc["retentionReason"] == "forecast_validity_window"
    assert lc["isVisible"] is False


def test_market_snapshot_uses_validity_not_news_window():
    lc = lifecycle_for_market_snapshot(market_timestamp=0, valid_until=8 * H_MS, now_ms=9 * H_MS)
    assert lc["contentClass"] == "market_snapshot"
    assert lc["retentionReason"] == "market_validity_window"
    assert lc["isVisible"] is False


def test_alert_fallback_36h():
    lc = lifecycle_for_alert(published_at=0, expiry_at=None, now_ms=36 * H_MS)
    assert lc["isVisible"] is True
    lc2 = lifecycle_for_alert(published_at=0, expiry_at=None, now_ms=36 * H_MS + 1)
    assert lc2["isVisible"] is False


def test_offer_fallback_48h():
    lc = lifecycle_for_offer(published_at=0, sale_end_at=None, expiry_at=None, now_ms=48 * H_MS)
    assert lc["retentionReason"] == "offer_48h_fallback"
    assert lc["isVisible"] is True
