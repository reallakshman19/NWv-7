"""
fetch_upahead_events.py — UpAhead events / offers / alerts pre-fetch.

Runs at most 8× per day (three-hour UTC cadence) via upahead_refresh.yml.
Festivals / holidays are collected in the same bounded publication run.

Every item in the output MUST have:
  publishedAt, eventStartAt, eventEndAt, expiryAt,
  dateConfidence, dateSource, city, region, localityScore,
  plannerEligible, suppressionReason, actionabilityScore

Acquisition uses the available RSS entries published in the preceding 7 days.
Retention follows each item's lifecycle after merging revisions into the snapshot.

Eligibility gate (is_planner_eligible):
  - suppressionReason must be None
  - expiryAt (if set) must be in the future
  - eventStartAt (if set) must be within [-6h, +7 days]
  - localityScore >= 0.30
  - dateConfidence != 'unknown' unless category is 'alerts' or 'shopping'
"""
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from calendar import timegm
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))

import feedparser
import requests
from html import unescape
from urllib.parse import urlencode
from fetch_tmdb_releases import fetch_tmdb_releases
from enrich_upahead_contract import merge_upahead_snapshot
from upahead_local_policy import classify_retail_offer, explicit_city, source_authority
from upahead_local_collectors import SOURCES as LOCAL_SOURCES, collect_local_source
from prefetch_common import (
    H_MS, DAY_MS, now_ms, read_json, write_json,
    make_story_id, is_suppressed,
)

THIS_YEAR = datetime.now().year


def _safe_feed_parse(url, timeout=8):
    # Per-request timeout; do not mutate the process-wide socket timeout.
    for attempt in range(2):
        try:
            response = requests.get(url, timeout=timeout, headers={
                'User-Agent': 'NWv7-UpAhead/1.0 (public RSS planner)',
                'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml',
            })
            response.raise_for_status()
            feed = feedparser.parse(response.content)
            if not feed.entries and (feed.get('bozo') or not feed.get('version')):
                raise RuntimeError('Response is not a usable RSS/Atom feed')
            return feed
        except (requests.RequestException, RuntimeError):
            if attempt == 1:
                raise
            time.sleep(1)

# ── Paths ─────────────────────────────────────────────────────────────────────
UP_AHEAD_PATH      = 'public/data/up_ahead.json'
SOURCE_HEALTH_PATH = 'public/data/up_ahead_source_health.json'

# ── Category feeds ────────────────────────────────────────────────────────────
# Disjunctions are grouped: joining every event keyword with AND returned zero
# matches; ungrouped shopping OR terms returned unrelated international sales.
def google_feed(query, source, location='India'):
    india = location not in ('Muscat', 'Oman')
    params = dict(q=query + ' when:7d', hl='en-IN' if india else 'en-US',
                  gl='IN' if india else 'US', ceid='IN:en' if india else 'US:en')
    return ('https://news.google.com/rss/search?' + urlencode(params), source, 'google_news')


CATEGORY_FEEDS = {
    'movies': {'India': [
        ('https://www.hindustantimes.com/feeds/rss/entertainment/tamil-cinema/rssfeed.xml',
         'Hindustan Times Tamil', 'hindustan_times'),
        ('https://www.hindustantimes.com/feeds/rss/entertainment/bollywood/rssfeed.xml',
         'Hindustan Times Bollywood', 'hindustan_times'),
        google_feed('(Tamil movie OR Tamil OTT) (release OR releasing OR premiere)', 'Google News Tamil Releases'),
        google_feed('(Hindi movie OR Hindi OTT) (release OR releasing OR premiere)', 'Google News Hindi Releases'),
    ]},
    'events': {city: [google_feed(f'{city} (event OR concert OR exhibition OR workshop OR expo OR fair)',
                                 f'Google News {city} Events', city)]
               for city in ('Chennai', 'Muscat', 'Trichy')},
    'alerts': {city: [google_feed(f'{city} ("power cut" OR "power shutdown" OR "water supply" OR "road closure" OR advisory)',
                                 f'Google News {city} Alerts', city)]
               for city in ('Chennai', 'Muscat', 'Trichy')},
    'weather_alerts': {city: [google_feed(f'{city} ("weather warning" OR "rain alert" OR cyclone OR "heavy rain")',
                                         f'Google News {city} Weather', city)]
                       for city in ('Chennai', 'Muscat', 'Trichy')},
    'shopping': {
        'online-india': [google_feed('(Amazon India OR Flipkart) (sale OR discount OR offer) (India OR Indian)', 'India online retailer discovery')],
        'online-oman': [google_feed('(Lulu OR Hypermax) Oman (online OR app OR delivery) (sale OR discount OR offer)', 'Oman online retailer discovery', 'Oman')],
        'Chennai': [google_feed('Chennai Lulu (sale OR discount OR offer)', 'Chennai LuLu discovery', 'Chennai')],
        'Muscat': [google_feed('(Muscat OR Seeb OR Ghubrah OR Mawaleh OR "across Oman") (Lulu OR Hypermax OR "Sharaf DG" OR "eXtra Oman") (sale OR discount OR offer)', 'Muscat retailer discovery', 'Muscat')],
    },
    'airlines': {'global': [google_feed('(IndiGo OR "Air India" OR "Oman Air" OR SalamAir) ("fare sale" OR "booking discount" OR "flight offer")',
                                        'Google News Airline Offers')]},
    'sports': {city: [google_feed(f'{city} (fixture OR tournament OR "match schedule")',
                                 f'Google News {city} Sports', city)] for city in ('Chennai', 'Muscat')},
    'civic': {city: [google_feed(f'{city} (shutdown OR "traffic diversion" OR "traffic restriction" OR "truck traffic" OR "traffic ban" OR "water interruption" OR "public notice" OR deadline)',
                                f'Google News {city} Civic', city)] for city in ('Chennai', 'Muscat', 'Trichy')},
}

# Direct city publishers remain usable when search discovery fails. Their city
# section is acquisition scope only: every notice still needs affected-city and
# public-service intent evidence in its own text.
for _category in ('alerts', 'weather_alerts', 'civic'):
    CATEGORY_FEEDS[_category]['Chennai'].append((
        'https://timesofindia.indiatimes.com/rssfeeds/2950623.cms', 'Times of India Chennai', 'times_of_india'))
    CATEGORY_FEEDS[_category]['Muscat'].append((
        'https://timesofoman.com/feed', 'Times of Oman', 'times_of_oman'))
CATEGORY_FEEDS['civic']['Muscat'].append((
    'https://www.omanobserver.om/rssFeed/1/47', 'Oman Observer ROP', 'oman_observer'))

# ── Locality config ───────────────────────────────────────────────────────────
LOCATION_LOCALITY = {
    'Chennai': {'city': 'Chennai', 'region': 'tn',    'localityScore': 1.0},
    'Trichy':  {'city': 'Trichy',  'region': 'tn',    'localityScore': 0.9},
    'Muscat':  {'city': 'Muscat',  'region': 'oman',  'localityScore': 1.0},
    'India':   {'city': None,      'region': 'india', 'localityScore': 0.5},
    'Oman':    {'city': None,      'region': 'oman',  'localityScore': 0.5},
    'online':  {'city': None,      'region': None,    'localityScore': 0.3},
    'global':  {'city': None,      'region': None,    'localityScore': 0.3},
}


# ── Date extraction ───────────────────────────────────────────────────────────
from upahead_dates import event_day_boundary, extract_event_date, extract_event_dates


# ── Expiry derivation ─────────────────────────────────────────────────────────
def derive_expiry(event_start_ms, event_end_ms, published_ms, category, location=None):
    """Return the expiry instant after the final advertised day."""
    if event_start_ms:
        return event_day_boundary(event_end_ms or event_start_ms + DAY_MS, location)
    if event_end_ms:
        return event_day_boundary(event_end_ms, location)
    if category in ('shopping', 'airlines'):
        return published_ms + 48 * H_MS
    if category in ('alerts', 'weather_alerts', 'civic'):
        return published_ms + 24 * H_MS
    return None


def recent_publication_ms(entry, ts: int) -> int | None:
    published = entry.get('published_parsed') or entry.get('updated_parsed')
    if published is None:
        return None
    published_ms = timegm(published) * 1000
    return published_ms if ts - 7 * DAY_MS <= published_ms <= ts else None


# ── Eligibility gate ──────────────────────────────────────────────────────────
def is_planner_eligible(item: dict, ts: int) -> bool:
    category = item.get('category', '')
    if item.get('suppressionReason'):
        return False
    if item.get('expiryAt') and item['expiryAt'] <= ts:
        return False
    event_start = item.get('eventStartAt')
    if event_start:
        days_ahead = (event_start - ts) / DAY_MS
        ongoing = event_start <= ts < (item.get('eventEndAt') or 0)
        today_only = item.get('datePrecision') == 'day' and event_start // DAY_MS == ts // DAY_MS
        if not ongoing and not today_only and (days_ahead < -0.25 or days_ahead > 7):
            return False
    else:
        # No event date: allow only categories that don't require one,
        # OR 'events' that are very recent (≤2 days) from a high-locality source
        if category == 'events' and item.get('localityScore', 0) >= 0.7:
            if (ts - item.get('publishedAt', 0)) <= 2 * DAY_MS:
                pass  # recent high-locality event without date: allow
            else:
                return False
        elif category not in ('shopping', 'alerts', 'weather_alerts', 'civic', 'airlines'):
            return False
    if item.get('localityScore', 0) < 0.30:
        return False
    if item.get('dateConfidence') == 'unknown' and category not in ('alerts', 'shopping', 'weather_alerts', 'civic', 'events'):
        return False
    return True


# ── Actionability heuristic ───────────────────────────────────────────────────
def estimate_actionability(item: dict) -> float:
    score = 0.5
    category = item.get('category', '')
    title_l  = (item.get('title', '') + ' ' + item.get('summary', '')).lower()

    # High-action keywords
    if re.search(r'\b(book|register|apply|deadline|last day|today only|limited|urgent|evacuate|do not|warning)\b', title_l):
        score += 0.3
    # Low-action keywords (informational only)
    if re.search(r'\b(review|recap|opinion|analysis|explained|why|how|who is)\b', title_l):
        score -= 0.2

    if category in ('alerts', 'weather_alerts', 'civic'):
        score += 0.2
    if category == 'shopping':
        score += 0.15
    if category == 'events':
        score += 0.1

    return round(max(0.0, min(1.0, score)), 2)


# ── Feed parse ────────────────────────────────────────────────────────────────
INTENT = {
    'alerts': r'\b(power cut|power shutdown|outage|water interruption|road closure|traffic diversion|traffic restriction|traffic ban|advisory|warning|disruption|evacuat\w*|suspend\w*|cancel\w*|closed|closure)\b',
    'weather_alerts': r'\b(weather|rain|cyclone|storm|flood|heatwave|imd|met)\b.*\b(warn\w*|alert|heavy|severe|red|orange)\b|\b(warn\w*|alert|heavy|severe)\b.*\b(rain|cyclone|storm|flood|heatwave)\b',
    'civic': r'\b(notice|advisory|deadline|apply|registration|power cut|shutdown|water supply|interruption|traffic diversion|road closure|road work|closed|closure|service disruption)\b',
    'shopping': r'\b(sale|discount|coupon|offer|deal|off)\b',
    'airlines': r'\b(fare sale|sale|discount|offer|coupon|deal|special fare)\b',
    'movies': r'\b(release|releases|releasing|premiere|premieres|streaming|ott|debut)\b',
    'events': r'\b(event|concert|workshop|exhibition|expo|festival|conference|marathon|performance|fair|show|meet|opening)\b',
    'sports': r'\b(match|fixture|tournament|championship|race|kick.off|schedule)\b',
}


def has_category_intent(category, text):
    if category == 'civic':
        # A court issuing a notice, a political registration or a retrospective
        # road project is not a current service notice for residents.
        utility = r'\bwater supply\b.{0,60}\b(?:interrupt\w*|suspend\w*|cut|disrupt\w*|halt\w*|reduc\w*|restor\w*|notice|advisory)\b|\b(?:interrupt\w*|suspend\w*|cut|disrupt\w*|halt\w*|reduc\w*|restor\w*|notice|advisory)\b.{0,60}\bwater supply\b'
        return bool(re.search(utility, text, re.I) or re.search(r'\b(power (?:cut|shutdown)|shutdown|water interruption|'
                              r'traffic (?:diversion|restriction|ban)|truck (?:traffic|movement).{0,40}(?:restrict\w*|suspend\w*|ban)|road (?:closure|closed)|service disruption|'
                              r'(?:property|municipal|water) tax|(?:public|civic|municipal) (?:notice|advisory)|'
                              r'(?:apply|application|registration|payment).{0,35}deadline|'
                              r'deadline.{0,35}(?:apply|application|registration|payment))\b', text, re.I))
    if category in ('shopping', 'airlines') and re.search(r'\b(sold out|unavailable|vanished|sale ended|offer expired)\b', text, re.IGNORECASE):
        return False
    if category == 'shopping' and not re.search(
        r'\b(amazon|flipkart|lulu|hypermax|sharaf dg|extra|discount|coupon|offer|deal)\b|%\s*off',
        text, re.IGNORECASE
    ):
        return False
    return bool(re.search(INTENT.get(category, r'.'), text, re.IGNORECASE))


def item_locality(text, acquisition_location):
    metadata = dict(LOCATION_LOCALITY.get(acquisition_location, {'city': None, 'region': None, 'localityScore': 0.3}))
    # A search location is acquisition scope, not proof of the event venue.
    aliases = [('Chennai', r'\b(chennai|madras)\b'), ('Trichy', r'\b(trichy|tiruchira?pp?alli)\b'),
               ('Muscat', r'\bmuscat\b')]
    foreign = ('New Delhi', 'Delhi', 'Mumbai', 'Bengaluru', 'Bangalore', 'Hyderabad',
               'Kolkata', 'London', 'New York', 'Punjab', 'Kerala')
    for city, pattern in aliases + [(city, r'\b' + re.escape(city) + r'\b') for city in foreign]:
        if re.search(pattern, text, re.IGNORECASE):
            return {**metadata, 'city': city}
    return {**metadata, 'city': None}


def acquisition_summary(health, ts):
    by_category = {}
    for row in health.values():
        category = row['category']
        totals = by_category.setdefault(category, dict(attemptedSources=0, successfulSources=0,
                                                       failedSources=0, returnedItems=0))
        totals['attemptedSources'] += 1
        totals['successfulSources'] += int(row['ok'])
        totals['failedSources'] += int(not row['ok'])
        totals['returnedItems'] += row.get('items', 0)
        totals['checkedAt'] = ts
        city = row.get('city')
        if city:
            local = totals.setdefault('byLocation', {}).setdefault(city, dict(
                attemptedSources=0, successfulSources=0, failedSources=0, returnedItems=0, checkedAt=ts))
            local['attemptedSources'] += 1
            local['successfulSources'] += int(row['ok'])
            local['failedSources'] += int(not row['ok'])
            local['returnedItems'] += row.get('items', 0)
    totals = {key: sum(row[key] for row in by_category.values())
              for key in ('attemptedSources', 'successfulSources', 'failedSources', 'returnedItems')}
    return dict(**totals, byCategory=by_category, checkedAt=ts,
                status='failed' if not totals['successfulSources'] else 'partial' if totals['failedSources'] else 'success')


def fetch_category_items(category: str, location: str, feeds: list, ts: int) -> tuple[list, dict]:
    results, source_health = [], {}
    locality_meta = LOCATION_LOCALITY.get(location, {'city': None, 'region': None, 'localityScore': 0.3})

    for url, source, source_group in feeds:
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
                if not title or not link.startswith(('https://', 'http://')) or not has_category_intent(category, raw_text):
                    continue
                entry_source = entry.get('source') or {}
                publisher_name = entry_source.get('title') or source
                publisher_url = entry_source.get('href') or link
                # Google appends the publisher to the headline. It is provenance,
                # not event identity or an event-date token.
                title = re.sub(r'\s+-\s+' + re.escape(publisher_name) + r'\s*$', '', title, flags=re.I)
                retail_scope = classify_retail_offer(raw_text, publisher_url, location) if category == 'shopping' else None
                if category == 'shopping' and not retail_scope:
                    continue
                if category in ('alerts', 'weather_alerts', 'civic') and not explicit_city(raw_text, location):
                    continue
                locality_meta = item_locality(raw_text, location)
                if retail_scope:
                    locality_meta.update(city=retail_scope['city'], region=retail_scope['offerMarket'])
                elif category in ('alerts', 'weather_alerts', 'civic'):
                    locality_meta['city'] = explicit_city(raw_text, location)
                venue = locality_meta.get('city')
                date_text = ' • '.join(filter(None, (title, summary)))
                event_start_ms, event_end_ms, date_conf = extract_event_dates(date_text, pub_ms, venue)
                expiry_ms = derive_expiry(event_start_ms, event_end_ms, pub_ms, category, venue)
                event_day = event_start_ms
                precision = 'day' if event_start_ms else None
                if category in ('alerts', 'weather_alerts', 'civic') and event_start_ms and event_end_ms is None:
                    clocks = re.search(r'\bfrom\s+(\d{1,2})(?:[.:](\d{2}))?\s*([ap])\.?m\.?\s*(?:to|until|[–-])\s*(\d{1,2})(?:[.:](\d{2}))?\s*([ap])\.?m\.?', date_text, re.I)
                    if clocks:
                        a, b, c, d, e, f = clocks.groups()
                        if 1 <= int(a) <= 12 and 1 <= int(d) <= 12 and int(b or 0) < 60 and int(e or 0) < 60:
                            start_minutes = (int(a) % 12 + (12 if c.lower() == 'p' else 0))*60 + int(b or 0)
                            end_minutes = (int(d) % 12 + (12 if f.lower() == 'p' else 0))*60 + int(e or 0)
                            if start_minutes < end_minutes:
                                midnight = event_day_boundary(event_day, venue)
                                event_start_ms = midnight + start_minutes*60_000
                                event_end_ms = expiry_ms = midnight + end_minutes*60_000
                                precision = 'time'

                item = {
                    'title':        title,
                    'summary':      summary,
                    'url':          link,
                    'source':       publisher_name,
                    'sourceUrl':    publisher_url,
                    'sourceAuthority': source_authority(publisher_url) if category in ('alerts', 'weather_alerts', 'civic') else 'retailer_or_news',
                    'sourceGroup':  source_group,
                    'category':     category,
                    'publishedAt':  pub_ms,
                    'eventStartAt': event_start_ms,
                    'eventEndAt':   event_end_ms,
                    'expiryAt':     expiry_ms,
                    'dateConfidence': date_conf,
                    'dateSource':   'title_or_summary' if event_start_ms else 'none',
                    'datePrecision': precision,
                    'eventDateKey': datetime.fromtimestamp(event_day/1000, timezone.utc).date().isoformat() if event_day else None,
                    'acquisitionLocation': location,
                    'city':         locality_meta['city'],
                    'region':       locality_meta['region'],
                    'localityScore': locality_meta['localityScore'],
                    'language':     'en',
                }
                if retail_scope:
                    item.update(retail_scope)
                item['id'] = make_story_id(item)
                is_suppressed(item, category)  # sets suppressionReason
                item['actionabilityScore'] = estimate_actionability(item)
                item['plannerEligible']    = is_planner_eligible(item, ts)

                results.append(item)

            source_health[f'{category}:{location}:{url}'] = {'category': category, 'source': source,
                'city': location, 'url': url, 'checkedAt': ts,
                'ok': True, 'items': len(results) - before, 'lastSuccess': ts}
        except Exception as e:
            source_health[f'{category}:{location}:{url}'] = {'category': category, 'source': source,
                'city': location, 'url': url, 'checkedAt': ts,
                'ok': False, 'error': str(e), 'items': 0}

    return results, source_health


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    from fetch_festivals import fetch_festival_items
    ts = now_ms()
    existing = read_json(UP_AHEAD_PATH, {'schemaVersion': 1, 'fetchedAt': 0, 'contentHash': '', 'items': []})
    # Reapply corrected public-service intent to retained publisher records too.
    # This never touches the user's independently saved Planner reminders.
    for pool in ('items', 'pendingItems'):
        existing[pool] = [item for item in existing.get(pool, []) if item.get('category') not in ('alerts', 'civic')
                          or has_category_intent(item['category'], f"{item.get('title', '')} {item.get('summary', '')}")]
    all_health = {}
    new_items = []

    jobs = [(category, location, feeds) for category, location_map in CATEGORY_FEEDS.items()
            for location, feeds in location_map.items()]
    # Fixed public-source set, at most four concurrent requests and no browser
    # service. One slow city/category cannot starve the other categories.
    with ThreadPoolExecutor(max_workers=4) as pool:
        for items, health in pool.map(lambda args: fetch_category_items(*args, ts), jobs):
            all_health.update(health)
            new_items.extend(items)
        for items, health in pool.map(lambda source_id: collect_local_source(source_id, ts), LOCAL_SOURCES):
            all_health.update(health)
            new_items.extend(items)

    # Augment movies section with TMDB structured release data (real dates)
    tmdb_items = fetch_tmdb_releases(ts)
    if tmdb_items:
        new_items.extend(tmdb_items)
        print(f'  [tmdb] added {len(tmdb_items)} releases to movies section')
        all_health['tmdb'] = {'category': 'movies', 'ok': True, 'items': len(tmdb_items), 'lastSuccess': ts}

    festivals, festival_health = fetch_festival_items(ts)
    new_items.extend(festivals)
    all_health.update(festival_health)

    snapshot = merge_upahead_snapshot(existing, new_items, ts, fetched=any(row['ok'] for row in all_health.values()))
    snapshot['acquisitionSummary'] = acquisition_summary(all_health, ts)
    snapshot['sourceStatuses'] = {key: value for key, value in all_health.items() if key in LOCAL_SOURCES}
    for category, row in snapshot['acquisitionSummary']['byCategory'].items():
        row['activeItems'] = snapshot['lifecycleSummary']['categoryCounts'].get(category, 0)
    deduped = snapshot['items']
    write_json(UP_AHEAD_PATH, snapshot)

    # Update source health
    # Keep only this bounded run's evidence; no unbounded history table/service.
    existing_health = {'lastChecked': ts, 'sources': all_health}
    write_json(SOURCE_HEALTH_PATH, existing_health)

    eligible = snapshot['lifecycleSummary']['plannerEligibleByLifecycleCount']
    print(
        f'Done. total={len(deduped)}, plannerEligible={eligible}, '
        f'contentHash={snapshot["contentHash"]}'
    )


if __name__ == '__main__':
    main()
