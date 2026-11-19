"""
fetch_insight_stories.py — smart-TTL Insight story scraper.

Smart-TTL merge: a slot is only re-fetched when its TTL has expired.
Old stories are retained for 36 h from publishedAt.

Run via GitHub Actions (insight_refresh.yml):
  python scripts/fetch_insight_stories.py
"""
import glob
import calendar
import html as html_lib
import json
import os
import re
import sys
import time

def _strip_html(text):
    text = html_lib.unescape(text or '')
    text = re.sub(r'<[^>]+>', ' ', text)
    return re.sub(r'\s+', ' ', text).strip()

# Allow importing from scripts/ when run from repo root
sys.path.insert(0, os.path.dirname(__file__))

import feedparser
import requests
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit
from prefetch_common import (
    H_MS, DAY_MS, now_ms, read_json, write_json,
    normalize_basic_story, is_suppressed, compute_content_hash
)
from insight_source_policy import get_active_slot_feeds_map, get_slot_feeds_map, write_source_policy_report
from insight_json_contract import optimize_insight_snapshot

# ── Paths ─────────────────────────────────────────────────────────────────────
INSIGHT_PATH       = 'public/newsdata/insight_latest.json'
SOURCE_HEALTH_PATH = 'public/newsdata/insight_source_health.json'
SOURCE_POLICY_REPORT_PATH = 'public/newsdata/insight_source_policy_report.json'

# ── Slot config ───────────────────────────────────────────────────────────────
SLOTS = ['now', 'minus4h', 'minus12h', 'minus24h']

SLOT_TTL_HOURS = {
    'now':      1,
    'minus4h':  2,
    'minus12h': 3,  # was 6 — tighter re-fetch keeps older slots fresher
    'minus24h': 4,  # was 12 — prevents 12h stale content in 24–36h bucket
}

INSIGHT_RETAIN_HOURS    = 36  # 36h retention window (stories visible up to 36h from publishedAt)
INSIGHT_ARCHIVE_KEEP_DAYS = 7
MAX_FEED_BYTES = 1_000_000
MAX_FEED_ITEMS = 40
MAX_SNAPSHOT_STORIES = 1000
MAX_SNAPSHOT_BYTES = 3_000_000

# ── Source policy / feed registry ─────────────────────────────────────────────
# Feed list is loaded from config/insight_sources.json so source mix can be tuned
# without changing scraper logic.
SLOT_FEEDS = get_slot_feeds_map()

def get_current_source_health() -> dict:
    return read_json(SOURCE_HEALTH_PATH, {'lastChecked': 0, 'sources': {}}).get('sources', {})


def get_active_slot_feeds() -> dict:
    return get_active_slot_feeds_map(get_current_source_health())


DEFAULT_SNAPSHOT = {
    'schemaVersion': 2,
    'fetchedAt': 0,
    'contentHash': '',
    'slotMeta': {s: {'fetchedAt': 0, 'storyIds': []} for s in SLOTS},
    'stories': [],
}


# ── TTL helpers ───────────────────────────────────────────────────────────────
def slot_is_fresh(slot_meta: dict, slot: str, ts: int) -> bool:
    fetched_at = slot_meta.get(slot, {}).get('fetchedAt', 0)
    return bool(fetched_at) and 0 <= (ts - fetched_at) < SLOT_TTL_HOURS[slot] * H_MS


def keep_recent_stories(stories: list, ts: int) -> list:
    cutoff = ts - INSIGHT_RETAIN_HOURS * H_MS
    def usable(story):
        try:
            published = int(story.get('publishedAt') or 0)
            return cutoff <= published <= ts and story.get('publishedAtSource') != 'fetch_time_fallback'
        except (ValueError, TypeError, OverflowError):
            return False
    return [s for s in stories if isinstance(s, dict) and usable(s)]


# ── Feed fetch ────────────────────────────────────────────────────────────────
def fetch_slot_stories(slot: str, *, ts=None, feed_cache=None) -> tuple[list, dict]:
    results, source_health = [], {}
    ts = int(ts if ts is not None else now_ms())
    feed_cache = feed_cache if feed_cache is not None else {}
    active_feeds = get_active_slot_feeds()
    for url, source, source_group in active_feeds[slot]:
        try:
            if url not in feed_cache:
                try:
                    # One bounded request per distinct URL per run. Redirects,
                    # TLS verification and publication clocks remain genuine.
                    with requests.get(url, timeout=12, stream=True, headers={
                        'User-Agent': 'Mozilla/5.0 (compatible; NWv7Insight/1.0)',
                        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml',
                    }) as response:
                        response.raise_for_status()
                        content = bytearray()
                        for chunk in response.iter_content(16_384):
                            content.extend(chunk)
                            if len(content) > MAX_FEED_BYTES:
                                raise ValueError('Feed exceeds 1 MB source limit')
                        parsed = feedparser.parse(bytes(content))
                        if not parsed.get('version'):
                            raise ValueError('Source is not a recognized RSS/Atom feed')
                        feed_cache[url] = parsed
                except Exception as error:
                    feed_cache[url] = error
            feed = feed_cache[url]
            if isinstance(feed, Exception):
                raise feed
            items = []
            slot_entries = feed.entries[:MAX_FEED_ITEMS]
            for idx, entry in enumerate(slot_entries):
                pub = entry.get('published_parsed')
                if not pub:
                    continue
                pub_ms = int(calendar.timegm(pub) * 1000)
                link = entry.get('link', '')
                if not ts - INSIGHT_RETAIN_HOURS * H_MS <= pub_ms <= ts or urlsplit(link).scheme not in ('http', 'https'):
                    continue
                raw = {
                    'title':       _strip_html(entry.get('title', ''))[:500],
                    'summary':     _strip_html(entry.get('summary', ''))[:2000],
                    'url':         link[:4096],
                    'publishedAt': pub_ms,
                    'publishedAtSource': 'feed_published',
                    'feedPosition': idx,
                    'feedLength': len(slot_entries),
                }
                # A search wrapper is never authenticated Reuters or another
                # wire origin merely because the query mentions that outlet.
                wrapper = urlsplit(url).hostname == 'news.google.com'
                items.append(normalize_basic_story(raw, 'Google News' if wrapper else source,
                                                   'google_news' if wrapper else source_group,
                                                   allow_fetch_time_fallback=False))
            source_health[source_group] = {
                'ok':      True,
                'items':   len(items),
                'feedUrl': url,
                'checkedAt': ts,
            }
            results.extend(items)
        except Exception as e:
            source_health[source_group] = {
                'ok':      False,
                'error':   str(e),
                'items':   0,
                'feedUrl': url,
                'checkedAt': ts,
            }
    return results, source_health


# ── Core merge ────────────────────────────────────────────────────────────────
def refresh_insight_snapshot(old_snapshot: dict, ts: int) -> tuple[dict, dict]:
    retained       = keep_recent_stories(old_snapshot.get('stories', []), ts)
    retained_by_id = {s['id']: s for s in retained if s.get('id')}
    old_slot_meta  = old_snapshot.get('slotMeta', {})
    new_slot_meta  = {}
    fresh_items    = []
    all_source_health: dict = {}
    feed_cache = {}

    for slot in SLOTS:
        if slot_is_fresh(old_slot_meta, slot, ts):
            # Slot is within TTL — reuse existing storyIds (prune any that aged out)
            valid_ids = [
                sid for sid in old_slot_meta.get(slot, {}).get('storyIds', [])
                if sid in retained_by_id
            ]
            new_slot_meta[slot] = {
                'fetchedAt': old_slot_meta[slot]['fetchedAt'],
                'storyIds':  valid_ids,
            }
            print(f'  [{slot}] fresh (skipped) — {len(valid_ids)} retained IDs')
        else:
            # Slot TTL expired — re-fetch
            raw_items, health = fetch_slot_stories(slot, ts=ts, feed_cache=feed_cache)
            all_source_health.update(health)
            normalized = []
            for item in raw_items:
                if is_suppressed(item, 'any'):
                    continue
                item.setdefault('fetchedForSlots', [])
                if slot not in item['fetchedForSlots']:
                    item['fetchedForSlots'].append(slot)
                normalized.append(item)
            fresh_items.extend(normalized)
            new_slot_meta[slot] = {
                'fetchedAt': ts if any(row.get('ok') for row in health.values()) else old_slot_meta.get(slot, {}).get('fetchedAt', 0),
                'storyIds':  [x['id'] for x in normalized],
            }
            print(f'  [{slot}] re-fetched — {len(normalized)} stories')

    # Merge retained + fresh by ID (fresh wins on fetchedForSlots union)
    all_by_id = {**retained_by_id}
    for item in fresh_items:
        sid = item.get('id')
        if not sid:
            continue
        if sid in all_by_id:
            existing = set(all_by_id[sid].get('fetchedForSlots', []))
            new      = set(item.get('fetchedForSlots', []))
            all_by_id[sid] = {**all_by_id[sid], **item, 'fetchedForSlots': sorted(existing | new)}
        else:
            all_by_id[sid] = item

    all_stories = sorted(keep_recent_stories(list(all_by_id.values()), ts), key=lambda row: row['publishedAt'], reverse=True)
    # Preserve older temporal evidence under an oversized intake; the four
    # buckets are publication ages, not the feed's acquisition-slot labels.
    bounds = [(0, 4), (4, 12), (12, 24), (24, 36)]
    buckets = [[row for row in all_stories if low * H_MS <= ts - row['publishedAt'] < high * H_MS] for low, high in bounds]
    bounded = [row for bucket in buckets for row in bucket[:MAX_SNAPSHOT_STORIES // 4]]
    if len(all_stories) > len(bounded):
        kept = {row['id'] for row in bounded}
        bounded.extend(row for row in all_stories if row['id'] not in kept)
    all_stories = bounded[:MAX_SNAPSHOT_STORIES]
    valid_ids   = {row['id'] for row in all_stories}

    # Clean stale IDs from slotMeta
    for slot in SLOTS:
        new_slot_meta[slot]['storyIds'] = [
            sid for sid in new_slot_meta[slot]['storyIds'] if sid in valid_ids
        ]

    snapshot = {
        'schemaVersion': 2,
        'fetchedAt':     ts if any(row.get('ok') for row in all_source_health.values()) else old_snapshot.get('fetchedAt', 0),
        'contentHash':   compute_content_hash(all_stories),
        'slotMeta':      new_slot_meta,
        'stories':       all_stories,
        'acquisitionSummary': {'checkedAt': ts, 'successfulSources': sum(bool(row.get('ok')) for row in all_source_health.values()),
                               'failedSources': sum(not row.get('ok') for row in all_source_health.values()),
                               'uniqueFeedRequests': len(feed_cache), 'maxStories': MAX_SNAPSHOT_STORIES},
    }

    optimized_snapshot = optimize_insight_snapshot(snapshot, ts)
    if len(json.dumps(optimized_snapshot, ensure_ascii=False).encode('utf8')) > MAX_SNAPSHOT_BYTES:
        raise ValueError('Insight snapshot exceeds 3 MB publication limit')
    return optimized_snapshot, all_source_health


# ── Source health ─────────────────────────────────────────────────────────────
def update_source_health(new_health: dict) -> None:
    from source_health import apply_source_health
    ts = now_ms()
    existing = read_json(SOURCE_HEALTH_PATH, {'lastChecked': 0, 'sources': {}})
    existing['sources'] = apply_source_health(existing.get('sources', {}), new_health, ts)
    existing['lastChecked'] = ts
    write_json(SOURCE_HEALTH_PATH, existing)


# ── Archive management ────────────────────────────────────────────────────────
def prune_old_archives() -> None:
    cutoff_ms = now_ms() - INSIGHT_ARCHIVE_KEEP_DAYS * DAY_MS
    for path in glob.glob('public/newsdata/insight_20*.json'):
        try:
            date_str = os.path.basename(path).replace('insight_', '').replace('.json', '')
            file_dt  = datetime.strptime(date_str, '%Y-%m-%d').replace(tzinfo=timezone.utc)
            file_ms  = int(file_dt.timestamp() * 1000)
            if file_ms < cutoff_ms:
                os.remove(path)
                print(f'  pruned archive: {path}')
        except Exception:
            pass


# ── Entry point ───────────────────────────────────────────────────────────────
def main() -> None:
    ts      = now_ms()
    old     = read_json(INSIGHT_PATH, DEFAULT_SNAPSHOT)
    old_hash = old.get('contentHash', '')
    print(f'Refreshing insight snapshot (ts={ts})…')
    new_snap, health = refresh_insight_snapshot(old, ts)

    if not health and all(slot_is_fresh(old.get('slotMeta', {}), slot, ts) for slot in SLOTS):
        print('All slots remain within TTL; publication clock is unchanged')
        return
    if not any(row.get('ok') for row in health.values()):
        raise RuntimeError('No source acquisition succeeded; prior publication is preserved')
    write_json(INSIGHT_PATH, new_snap)
    if old_hash == new_snap.get('contentHash'):
        print('  contentHash unchanged — story content stable')

    archive_path = f"public/newsdata/insight_{datetime.now(timezone.utc).strftime('%Y-%m-%d')}.json"
    write_json(archive_path, new_snap)

    update_source_health(health)
    write_source_policy_report(get_active_slot_feeds(), health, report_path=Path(SOURCE_POLICY_REPORT_PATH))
    prune_old_archives()

    from source_health import zero_item_warnings
    final_health = read_json(SOURCE_HEALTH_PATH, {'sources': {}}).get('sources', {})
    for w in zero_item_warnings(final_health):
        print(f'  [health-warn] {w}')

    print(
        f'Done. stories={len(new_snap["stories"])}, '
        f'contentHash={new_snap["contentHash"]}'
    )


if __name__ == '__main__':
    main()
