import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from horizon_policy import (
    ALERT_FALLBACK_HOURS,
    NEWS_RETAIN_HOURS,
    OFFER_FALLBACK_HOURS,
    PLANNER_PAST_GRACE_HOURS,
    UPAHEAD_EVENT_PAST_GRACE_HOURS,
    UPAHEAD_LOOKAHEAD_DAYS,
)


def test_horizon_constants_are_repo_contract():
    assert NEWS_RETAIN_HOURS == 36
    assert UPAHEAD_LOOKAHEAD_DAYS == 7
    assert UPAHEAD_EVENT_PAST_GRACE_HOURS == 24
    assert PLANNER_PAST_GRACE_HOURS == 6
    assert ALERT_FALLBACK_HOURS == 36
    assert OFFER_FALLBACK_HOURS == 48
