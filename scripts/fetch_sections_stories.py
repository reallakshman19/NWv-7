"""
fetch_sections_stories.py — news sections pre-fetch.

Populates public/newsdata/sections_latest.json with 10 section keys:
  topStories, india, tn, trichy, muscat, world, business, technology, sports, entertainment

Runs in the Sections Snapshot Recovery workflow.
"""
import calendar
import os
import re
import sys
from html import unescape
from urllib.parse import urlsplit

sys.path.insert(0, os.path.dirname(__file__))

import feedparser
import requests
from prefetch_common import (
    H_MS, DAY_MS, now_ms, read_json, write_json,
    normalize_basic_story, is_suppressed, compute_content_hash
)
from section_source_policy import get_section_feeds_map, build_section_quality, write_section_source_policy_report

# ── Paths ─────────────────────────────────────────────────────────────────────
SECTIONS_PATH      = 'public/newsdata/sections_latest.json'
SOURCE_HEALTH_PATH = 'public/newsdata/source_health.json'
SECTION_SOURCE_POLICY_REPORT_PATH = 'public/newsdata/section_source_policy_report.json'

SECTION_CACHE_MAX_AGE_MS = 2 * H_MS   # re-fetch each run (sections refresh every ~2 h)
# Keep collector retention aligned with src/adapters/sectionsSnapshotFetcher.js
# SECTION_ITEM_MAX_AGE_MS. If this is lower than the adapter window, the UI can
# accept 36h data that the workflow never actually publishes.
STORY_RETAIN_HOURS       = 36

# ── Section source policy / feed registry ─────────────────────────────────────
# Section feeds are loaded from config/section_sources.json so source mix can be
# tuned without changing fetcher code.
SECTION_FEEDS = get_section_feeds_map()

MAX_STORIES_PER_SECTION = 30
MIN_STORIES_PER_SECTION = 10  # backfill from parent section when count falls below this

# Backfill map: if a city section is thin, pull extras from the named parent section
SECTION_BACKFILL = {
    'trichy':  'tn',       # pull TN stories if Trichy feed is thin
    'muscat':  'world',    # pull World/Gulf stories if Muscat feed is thin
}

DEFAULT_SECTIONS_SNAPSHOT = {
    'schemaVersion': 1,
    'fetchedAt':     0,
    'contentHash':   '',
    'sections': {s: [] for s in SECTION_FEEDS},
}

TAMIL_NADU_PATH = re.compile(r'/(?:tamil-nadu|tamilnadu|chennai)(?:/|$)', re.IGNORECASE)
TAMIL_NADU_PLACE = re.compile(r'\b(?:tamil\s*nadu|chennai)\b', re.IGNORECASE)
WEATHER = re.compile(r'\b(?:rain\w*|cyclon\w*|monsoon|low[- ]pressure|weather)\b', re.IGNORECASE)
LOCAL_WEATHER_CONTEXT = re.compile(r'\b(?:Bay of Bengal|(?:in|across|over) (?:the )?state)\b', re.IGNORECASE)
WIDER_INDIA_SCOPE = re.compile(
    r'\b(?:across (?:the country|India)|nationwide|pan[- ]India|(?:multiple|several|\d+) states|'
    r'Andaman|Andhra Pradesh|Assam|Bihar|Delhi|Gujarat|Karnataka|Kerala|Maharashtra|'
    r'Odisha|Orissa|Rajasthan|Telangana|Uttar Pradesh|West Bengal)\b',
    re.IGNORECASE,
)
WORLD_PATH = re.compile(
    r'^/(?:news/)?(?:world(?:-news)?|international)(?:/|$)', re.IGNORECASE,
)
MIXED_TOI_PATH = re.compile(r'^/(?:science|real-estate)(?:/|$)', re.IGNORECASE)
INDIA_PATH = re.compile(r'/(?:india|india-news|india-business)(?:/|$)', re.IGNORECASE)
INDIA_PLACE = re.compile(
    r'\b(?:india|indians?|bharat|delhi|mumbai|bengaluru|kolkata|hyderabad|'
    r'tamil\s*nadu|chennai|andhra pradesh|karnataka|kerala|odisha|telangana|'
    r'west bengal|ISRO|IITs?|IISc|CSIR|DRDO)\b', re.IGNORECASE,
)
INDIA_NAME_EXCEPTIONS = re.compile(
    r'\b(?:times of india|(?:new )?indian express|indian ocean|indian wells)\b',
    re.IGNORECASE,
)


def clean_story_text(value: str) -> str:
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]*>', ' ', unescape(value or ''))).strip()


def india_story_destination(item: dict) -> str | None:
    """Use publisher geography and local weather coverage to route India feed rows."""
    title = clean_story_text(item.get('title', ''))
    summary = clean_story_text(item.get('summary', ''))
    text = f'{title} {summary}'
    try:
        path = urlsplit(item.get('url') or '').path
    except ValueError:
        path = ''

    state_weather = WEATHER.search(title) and (
        TAMIL_NADU_PLACE.search(title)
        or (LOCAL_WEATHER_CONTEXT.search(title) and TAMIL_NADU_PLACE.search(summary))
    )
    if (TAMIL_NADU_PATH.search(path) or state_weather) and not WIDER_INDIA_SCOPE.search(title):
        return 'tn'

    needs_india_evidence = WORLD_PATH.search(path) or (
        item.get('sourceGroup') == 'times_of_india'
        and MIXED_TOI_PATH.search(path)
        and not INDIA_PATH.search(path)
    )
    if needs_india_evidence and not INDIA_PLACE.search(INDIA_NAME_EXCEPTIONS.sub(' ', text)):
        return None
    return 'india'


def route_india_stories(sections: dict[str, list]) -> None:
    india_stories = sections.get('india', [])
    sections['india'] = []
    for item in india_stories:
        destination = india_story_destination(item)
        if destination == 'india':
            sections['india'].append(item)
        elif destination == 'tn':
            sections['tn'].append({**item, 'category': 'tn'})


def parse_entry_timestamp(entry: dict) -> tuple[int, str, str]:
    """Return a UTC epoch timestamp with explicit provenance.

    Missing feed timestamps are never replaced with fetch time because that
    makes old/resurfaced rows look newly published.
    """
    for field in ('published_parsed', 'updated_parsed'):
        parsed = entry.get(field)
        if parsed:
            return int(calendar.timegm(parsed) * 1000), field, 'high'
    return 0, 'missing', 'low'


def is_story_within_retain_window(item: dict, cutoff_ms: int) -> bool:
    """Return True when a section item is still inside the collector window.

    Missing or malformed timestamps are treated as stale in the workflow output:
    publishing undated RSS rows into a 36h news feed makes Top Stories and Buzz
    look current without freshness proof.
    """
    try:
        published_at = int(item.get('publishedAt', 0) or 0)
    except (TypeError, ValueError):
        return False
    return published_at >= int(cutoff_ms)


def filter_retained_stories(items: list, cutoff_ms: int) -> list:
    return [item for item in items if is_story_within_retain_window(item, cutoff_ms)]


def fetch_section(section: str, feeds: list, ts: int) -> tuple[list, dict]:
    results, source_health = [], {}
    for url, source, source_group in feeds:
        try:
            response = requests.get(url, timeout=15)
            response.raise_for_status()
            feed = feedparser.parse(response.content)
            feed_items = []
            for entry in feed.entries[:20]:
                pub_ms, timestamp_source, timestamp_confidence = parse_entry_timestamp(entry)
                raw = {
                    'title':       entry.get('title', ''),
                    'summary':     entry.get('summary', ''),
                    'url':         entry.get('link', ''),
                    'publishedAt': pub_ms,
                    'publishedAtSource': timestamp_source,
                    'timestampConfidence': timestamp_confidence,
                    'category':    section,
                    'region':      'in',
                }
                item = normalize_basic_story(
                    raw,
                    source,
                    source_group,
                    allow_fetch_time_fallback=False,
                )
                if not is_suppressed(item, 'any'):
                    feed_items.append(item)

            results.extend(feed_items)
            source_health[source_group] = {
                'ok': True,
                'items': len(feed_items),
                'feedUrl': url,
                'section': section,
            }
        except Exception as e:
            source_health[source_group] = {
                'ok': False,
                'error': str(e),
                'items': 0,
                'feedUrl': url,
                'section': section,
            }

    return results, source_health


def dedup_section(items: list) -> list:
    """Dedup by story ID, keep most recent on collision."""
    by_id: dict = {}
    for item in sorted(items, key=lambda x: x.get('publishedAt', 0), reverse=True):
        sid = item.get('id')
        if sid and sid not in by_id:
            by_id[sid] = item
    return list(by_id.values())


def main():
    ts     = now_ms()
    cutoff = ts - STORY_RETAIN_HOURS * H_MS

    print(f'Fetching sections (ts={ts}, retainHours={STORY_RETAIN_HOURS})…')
    candidates: dict = {}
    all_health: dict   = {}

    for section, feeds in SECTION_FEEDS.items():
        items, health = fetch_section(section, feeds, ts)
        all_health.update(health)
        candidates[section] = filter_retained_stories(items, cutoff)

    route_india_stories(candidates)
    new_sections = {
        section: dedup_section(items)[:MAX_STORIES_PER_SECTION]
        for section, items in candidates.items()
    }
    for section in new_sections:
        print(f'  [{section}] {len(new_sections[section])} stories')

    # Backfill under-populated city sections from their parent sections.
    # We only exclude stories already in the CHILD section (not globally) so that
    # parent-section stories can supplement a thin child section as intended.
    for child_section, parent_section in SECTION_BACKFILL.items():
        current = new_sections.get(child_section, [])
        if len(current) < MIN_STORIES_PER_SECTION and parent_section in new_sections:
            needed = MIN_STORIES_PER_SECTION - len(current)
            parent_pool = new_sections.get(parent_section, [])
            child_ids = {s.get('id') for s in current if s.get('id')}
            extras = []
            for story in parent_pool:
                if story.get('id') not in child_ids:
                    tagged = dict(story)
                    tagged['backfilledFrom'] = parent_section
                    extras.append(tagged)
                    child_ids.add(story.get('id'))
                    if len(extras) >= needed:
                        break
            if extras:
                new_sections[child_section] = current + extras
                print(f'  [{child_section}] backfilled +{len(extras)} from [{parent_section}] → {len(new_sections[child_section])} total')

    all_stories_flat = [item for items in new_sections.values() for item in items]
    section_quality = build_section_quality(new_sections)

    snapshot = {
        'schemaVersion': 2,
        'fetchedAt':     ts,
        'contentHash':   compute_content_hash(all_stories_flat),
        'window': {
            'retainHours': STORY_RETAIN_HOURS,
            'cutoffAt': cutoff,
        },
        'sectionQuality': section_quality,
        'sections':      new_sections,
    }
    write_json(SECTIONS_PATH, snapshot)

    from source_health import apply_source_health, zero_item_warnings
    existing_health = read_json(SOURCE_HEALTH_PATH, {'lastChecked': 0, 'sources': {}})
    existing_health['sources'] = apply_source_health(existing_health.get('sources', {}), all_health, ts)
    existing_health['lastChecked'] = ts
    write_json(SOURCE_HEALTH_PATH, existing_health)
    write_section_source_policy_report(new_sections, all_health)

    warnings = zero_item_warnings(existing_health['sources'])
    for w in warnings:
        print(f'  [health-warn] {w}')

    total = sum(len(v) for v in new_sections.values())
    print(f'Done. total={total}, contentHash={snapshot["contentHash"]}')


if __name__ == '__main__':
    main()
