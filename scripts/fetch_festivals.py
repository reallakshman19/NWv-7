"""
fetch_festivals.py — weekly festivals / public holidays pre-fetch.

The main UpAhead Refresh collector calls fetch_festival_items each run. The
standalone entrypoint only merges festival records; it cannot certify freshness
of the other categories.
"""
import os
import sys
import re
from html import unescape

sys.path.insert(0, os.path.dirname(__file__))

from enrich_upahead_contract import merge_upahead_snapshot
from prefetch_common import (
    now_ms, read_json, write_json, make_story_id, is_suppressed,
)
from fetch_upahead_events import (
    extract_event_dates, derive_expiry, is_planner_eligible,
    estimate_actionability, LOCATION_LOCALITY, recent_publication_ms,
    _safe_feed_parse, google_feed,
    item_locality,
)

# ── Paths ─────────────────────────────────────────────────────────────────────
UP_AHEAD_PATH      = 'public/data/up_ahead.json'
SOURCE_HEALTH_PATH = 'public/data/up_ahead_source_health.json'

# ── Festival feeds ────────────────────────────────────────────────────────────
FESTIVAL_FEEDS = [
    (*google_feed('India ("public holiday" OR festival OR observance) date', 'Google News India Festivals'), 'India'),
    (*google_feed('Oman ("public holiday" OR Eid OR "National Day") date', 'Google News Oman Festivals', 'Oman'), 'Oman'),
    (*google_feed('"Tamil Nadu" (festival OR "public holiday" OR observance) date', 'Google News TN Festivals'), 'India'),
]


def fetch_festival_items(ts: int) -> tuple[list, dict]:
    results, source_health = [], {}

    for url, source, source_group, location in FESTIVAL_FEEDS:
        locality_meta = LOCATION_LOCALITY.get(location, {'city': None, 'region': None, 'localityScore': 0.5})
        try:
            feed = _safe_feed_parse(url)
            before = len(results)
            for entry in feed.entries[:100]:
                pub_ms = recent_publication_ms(entry, ts)
                if pub_ms is None:
                    continue
                title   = entry.get('title', '').strip()
                summary = re.sub(r'<[^>]+>', ' ', unescape(entry.get('summary', ''))).strip()[:2000]
                link    = entry.get('link', '').strip()

                raw_text = f"{title} {summary}"
                locality_meta = item_locality(raw_text, location)
                venue = locality_meta.get('city')
                date_text = ' • '.join(filter(None, (title, summary)))
                event_start_ms, event_end_ms, date_conf = extract_event_dates(date_text, pub_ms, venue)

                if re.search(r'\b(lottery|bumper|prize|draw)\b', raw_text, re.IGNORECASE):
                    continue
                # For festivals without explicit date, skip (too noisy)
                if not event_start_ms:
                    continue

                expiry_ms    = derive_expiry(event_start_ms, event_end_ms, pub_ms, 'festivals', venue)

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

            source_health[f'festivals:{location}:{url}'] = {'category': 'festivals', 'source': source,
                'ok': True, 'items': len(results) - before, 'lastSuccess': ts}
        except Exception as e:
            source_health[f'festivals:{location}:{url}'] = {'category': 'festivals', 'source': source,
                'ok': False, 'error': str(e), 'items': 0}

    return results, source_health


def main():
    ts       = now_ms()
    existing = read_json(UP_AHEAD_PATH, {'schemaVersion': 1, 'fetchedAt': 0, 'contentHash': '', 'items': []})
    new_festivals, health = fetch_festival_items(ts)
    snapshot = merge_upahead_snapshot(existing, new_festivals, ts, fetched=False)
    snapshot['acquisitionSummary'] = existing.get('acquisitionSummary')
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
