"""
fetch_festivals.py — weekly festivals / public holidays pre-fetch.

Runs once per week (Sunday 3am IST = Saturday 21:30 UTC) via upahead_refresh.yml.
Writes into the same public/data/up_ahead.json, merging with existing items.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from enrich_upahead_contract import merge_upahead_snapshot
from prefetch_common import (
    now_ms, read_json, write_json, make_story_id, is_suppressed,
)
from fetch_upahead_events import (
    extract_event_date, derive_expiry, is_planner_eligible,
    estimate_actionability, LOCATION_LOCALITY, recent_publication_ms,
    _safe_feed_parse, THIS_YEAR,
)

# ── Paths ─────────────────────────────────────────────────────────────────────
UP_AHEAD_PATH      = 'public/data/up_ahead.json'
SOURCE_HEALTH_PATH = 'public/newsdata/source_health.json'

# ── Festival feeds ────────────────────────────────────────────────────────────
FESTIVAL_FEEDS = [
    # India
    ('https://www.timeanddate.com/holidays/india/feed',
     'Time and Date India', 'timeanddate', 'India'),
    (f'https://news.google.com/rss/search?q=India+public+holiday+OR+Pongal+OR+Diwali+OR+Republic+Day+{THIS_YEAR}&hl=en-IN&gl=IN&ceid=IN:en',
     'Google News India Festivals', 'google_news', 'India'),
    # Oman / Muscat
    (f'https://news.google.com/rss/search?q=Oman+public+holiday+OR+Eid+OR+National+Day+{THIS_YEAR}&hl=en-US&gl=US&ceid=US:en',
     'Google News Oman Festivals', 'google_news', 'Oman'),
    # Tamil Nadu specific
    (f'https://news.google.com/rss/search?q=Tamil+Nadu+festival+OR+state+holiday+{THIS_YEAR}+date&hl=en-IN&gl=IN&ceid=IN:en',
     'Google News TN Festivals', 'google_news', 'India'),
]


def fetch_festival_items(ts: int) -> tuple[list, dict]:
    results, source_health = [], {}

    for url, source, source_group, location in FESTIVAL_FEEDS:
        locality_meta = LOCATION_LOCALITY.get(location, {'city': None, 'region': None, 'localityScore': 0.5})
        try:
            feed = _safe_feed_parse(url)
            before = len(results)
            for entry in feed.entries:
                pub_ms = recent_publication_ms(entry, ts)
                if pub_ms is None:
                    continue
                title   = entry.get('title', '').strip()
                summary = entry.get('summary', '').strip()
                link    = entry.get('link', '').strip()

                raw_text = f"{title} {summary}"
                event_start_ms, date_conf = extract_event_date(raw_text, pub_ms)

                # For festivals without explicit date, skip (too noisy)
                if not event_start_ms:
                    continue

                event_end_ms = None
                expiry_ms    = derive_expiry(event_start_ms, event_end_ms, pub_ms, 'festivals')

                item = {
                    'title':        title,
                    'summary':      summary,
                    'url':          link,
                    'source':       source,
                    'sourceGroup':  source_group,
                    'category':     'festivals',
                    'publishedAt':  pub_ms,
                    'eventStartAt': event_start_ms,
                    'eventEndAt':   event_end_ms,
                    'expiryAt':     expiry_ms,
                    'dateConfidence': date_conf,
                    'dateSource':   'title',
                    'city':         locality_meta['city'],
                    'region':       locality_meta['region'],
                    'localityScore': locality_meta['localityScore'],
                    'language':     'en',
                }
                item['id'] = make_story_id(item)
                is_suppressed(item, 'events')  # sets suppressionReason
                item['actionabilityScore'] = estimate_actionability(item)
                item['plannerEligible']    = is_planner_eligible(item, ts)

                results.append(item)

            source_health[source_group] = {'ok': True, 'items': len(results) - before, 'lastSuccess': ts}
        except Exception as e:
            source_health[source_group] = {'ok': False, 'error': str(e), 'items': 0}

    return results, source_health


def main():
    ts       = now_ms()
    existing = read_json(UP_AHEAD_PATH, {'schemaVersion': 1, 'fetchedAt': 0, 'contentHash': '', 'items': []})
    new_festivals, health = fetch_festival_items(ts)
    snapshot = merge_upahead_snapshot(existing, new_festivals, ts, fetched=any(row['ok'] for row in health.values()))
    write_json(UP_AHEAD_PATH, snapshot)

    existing_health = read_json(SOURCE_HEALTH_PATH, {'lastChecked': 0, 'sources': {}})
    existing_health['sources'].update(health)
    existing_health['lastChecked'] = ts
    write_json(SOURCE_HEALTH_PATH, existing_health)

    print(
        f'Done. total={len(snapshot["items"])}, fetchedFestivals={len(new_festivals)}, '
        f'contentHash={snapshot["contentHash"]}'
    )


if __name__ == '__main__':
    main()
