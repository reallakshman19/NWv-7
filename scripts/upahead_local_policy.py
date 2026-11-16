"""Local alert/retailer scope. A discovery query is never location evidence."""
import json
import re
from pathlib import Path
from urllib.parse import urlparse

SOURCES = json.loads((Path(__file__).resolve().parents[1] / 'src/config/upAheadLocalSources.json').read_text(encoding='utf-8'))
CITY_ALIASES = {'Chennai': ('chennai', 'madras'), 'Muscat': ('muscat', 'seeb', 'ghubrah', 'mawaleh'), 'Trichy': ('trichy', 'tiruchirappalli')}


def has_word(text, value):
    return bool(re.search(r'\b' + re.escape(value) + r'\b', text, re.I))


def explicit_city(text, expected=None):
    cities = [expected] if expected in CITY_ALIASES else CITY_ALIASES
    return next((city for city in cities if any(has_word(text, alias) for alias in CITY_ALIASES[city])), None)


def classify_retail_offer(text, source_url='', acquisition_location=''):
    """Only named retailers/markets/channels; no unsupported branch assignments."""
    if re.search(r'\b(usa|united states|united kingdom|uae|dubai|abu dhabi|saudi arabia|riyadh|qatar|doha|bahrain|kuwait)\b', text, re.I):
        return None
    hostname = (urlparse(source_url).hostname or '').removeprefix('www.')
    india = bool(re.search(r'\b(india|indian|chennai|madras|flipkart)\b', text, re.I)
                 or re.search(r'amazon\.in|aboutamazon\.in|luluhypermarket\.in', source_url))
    oman = bool(re.search(r'\b(oman|muscat|seeb|ghubrah|mawaleh)\b', text, re.I)
                or re.search(r'hypermax\.com\.om|oman\.sharafdg\.com|/en-om(?:/|$)', source_url))
    market = 'india' if india else 'oman' if oman else None
    if not market:
        return None
    retailer = next((row for row in SOURCES['retailers'] if row['market'] == market and (
        any(has_word(text, alias) for alias in row['aliases']) or any(hostname == domain or hostname.endswith('.' + domain) for domain in row['domains']))), None)
    if not retailer:
        return None
    city = explicit_city(text)
    if city and city not in retailer['cities']:
        return None
    online_only = bool(re.search(r'\b(online.only|online exclusive|app.only|website.only)\b', text, re.I))
    offline_only = bool(re.search(r'\b(in.store.only|instore.only|stores.only)\b', text, re.I))
    online = 'online' in retailer['channels'] and not offline_only and (
        retailer['id'] in ('amazon-in', 'flipkart-in') or re.search(r'\b(online|website|app|delivery)\b', text, re.I))
    nationwide = market == 'oman' and bool(re.search(r'\b(across oman|all oman stores|all stores in oman)\b', text, re.I))
    offline = 'offline' in retailer['channels'] and not online_only and (city in retailer['cities'] or nationwide)
    # A channel-specific search does not move an in-store promotion into online.
    if acquisition_location.startswith('online-'):
        offline = False
    elif acquisition_location in CITY_ALIASES:
        online = False
    if not online and not offline:
        return None
    return dict(retailerId=retailer['id'], offerMarket=market,
                offerChannel='both' if online and offline else 'online' if online else 'offline',
                city=city, affectedScope='countrywide' if nationwide else None)


def source_authority(source_url):
    hostname = urlparse(source_url).hostname or ''
    domains = [urlparse(row['url']).hostname for row in SOURCES['alerts']]
    return 'official' if any(hostname == domain or hostname.endswith('.' + domain) for domain in domains) else 'news_report'
