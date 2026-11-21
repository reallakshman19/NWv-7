"""Shared horizon constants for static collectors.

These values intentionally mirror src/config/horizonPolicy.js. Keep both files
in sync; scripts/test_horizon_constants_match_static.mjs asserts equality.
"""

H_MS = 60 * 60 * 1000
DAY_MS = 24 * H_MS

# Normal news / sections / insight visibility.
NEWS_RETAIN_HOURS = 36

# Up Ahead event horizon.
UPAHEAD_LOOKAHEAD_DAYS = 7
UPAHEAD_EVENT_PAST_GRACE_HOURS = 24

# Planner is stricter than Up Ahead for past items.
PLANNER_PAST_GRACE_HOURS = 6

# Category-specific fallback windows when no explicit expiry exists.
ALERT_FALLBACK_HOURS = 36
OFFER_FALLBACK_HOURS = 48

# Active content is retained only up to seven days without renewed source evidence.
UPAHEAD_MIN_DEFAULT_HOURS = 36
UPAHEAD_MAX_ACTIVE_HOURS = 168
UPAHEAD_MAX_ACTIVE_ITEMS = 400
UPAHEAD_MAX_ACTIVE_BYTES = 3_000_000
UPAHEAD_MAX_PUBLICATION_BYTES = 8_000_000

__all__ = [
    "H_MS",
    "DAY_MS",
    "NEWS_RETAIN_HOURS",
    "UPAHEAD_LOOKAHEAD_DAYS",
    "UPAHEAD_EVENT_PAST_GRACE_HOURS",
    "PLANNER_PAST_GRACE_HOURS",
    "ALERT_FALLBACK_HOURS",
    "OFFER_FALLBACK_HOURS",
    "UPAHEAD_MIN_DEFAULT_HOURS",
    "UPAHEAD_MAX_ACTIVE_HOURS",
    "UPAHEAD_MAX_ACTIVE_ITEMS",
    "UPAHEAD_MAX_ACTIVE_BYTES",
    "UPAHEAD_MAX_PUBLICATION_BYTES",
]
