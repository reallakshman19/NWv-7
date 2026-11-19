"""Bounded public local calendars and official bulletins; no paid APIs/browser.

Observation time is never publication time. An explicit empty bulletin is source
coverage, not an alert or a Planner item. Source failures remain failures.
"""
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from html import unescape
from html.parser import HTMLParser
from io import BytesIO
import json
import re
from urllib.parse import parse_qs, urlencode, urljoin, urlparse
from urllib.request import Request, urlopen

from upahead_dates import event_zone, MONTH_MAP

HOUR = 3_600_000
DAY = 24 * HOUR
MAX_BODY = 2_000_000
MAX_EVENTS_PER_CITY = 32
SOURCES = {
    'chennai-calendar': ('events', 'Chennai', 'chennai2go', 'https://chennai2go.in/this-week'),
    'oman-calendar': ('events', 'Muscat', 'Experience Oman', 'https://experienceoman.om/events'),
    'imd-nowcast': ('weather_alerts', 'Chennai', 'IMD Chennai', 'https://mausam.imd.gov.in/chennai/mcdata/nowcast.pdf'),
    'tneb-shutdowns': ('civic', 'Chennai', 'TNEB', 'https://tneb.tnebnet.org/cpro/today.html'),
    'oman-warnings': ('weather_alerts', 'Muscat', 'Oman CAA Meteorology', 'https://met.caa.gov.om/en/home/'),
}


def read_public(url, data=None):
    """Fixed-source HTTPS only; redirects stay on that source's own host."""
    original = urlparse(url)
    if original.scheme != 'https' or original.username or original.password:
        raise ValueError('Public HTTPS source required')
    headers = {'User-Agent': 'NWv7-UpAhead/1.1 (public calendars and local notices)',
               'Accept': 'text/html,application/json,application/xml,application/pdf'}
    if data is not None:
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
    with urlopen(Request(url, data=data, headers=headers), timeout=12) as response:
        final = urlparse(response.url)
        if final.scheme != 'https' or final.hostname != original.hostname:
            raise ValueError('Unexpected public-source redirect')
        body = response.read(MAX_BODY + 1)
        if len(body) > MAX_BODY:
            raise ValueError('Public source exceeds 2 MB')
    return body


class Node:
    def __init__(self, tag='', attrs=()):
        self.tag, self.attrs, self.children = tag, dict(attrs), []

    def text(self):
        if self.tag in ('script', 'style', 'noscript'):
            return ''
        return ' '.join(child.text() if isinstance(child, Node) else child for child in self.children)

    def walk(self):
        yield self
        for child in self.children:
            if isinstance(child, Node):
                yield from child.walk()


class Document(HTMLParser):
    def __init__(self, value):
        super().__init__(convert_charrefs=True)
        self.root = Node()
        self.stack = [self.root]
        self.feed(value)

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in ('img', 'br', 'hr', 'input', 'link', 'meta', 'source', 'wbr', 'area', 'base', 'embed', 'param', 'col'):
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.stack[-1].children.append(Node(tag, attrs))

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                self.stack = self.stack[:i]
                break

    def handle_data(self, value):
        self.stack[-1].children.append(value)


def clean(value, limit=1200):
    return re.sub(r'\s+', ' ', unescape(value or '')).strip()[:limit]


def instant(value):
    return int(value.timestamp() * 1000)


def base_item(source_id, title, url, city, category, ts):
    expected = urlparse(SOURCES[source_id][3]).hostname
    parsed = urlparse(url)
    if parsed.scheme != 'https' or parsed.hostname != expected:
        raise ValueError('Invalid source detail link')
    return dict(id=sha256(f'{source_id}|{url}'.encode()).hexdigest()[:24],
                title=clean(title, 240), url=url, source=SOURCES[source_id][2],
                sourceUrl=url, sourceGroup=source_id,
                sourceAuthority='event_listing' if source_id == 'chennai-calendar' else 'official',
                city=city, region='tn' if city == 'Chennai' else 'oman',
                localityScore=1, affectedLocations=[city], category=category,
                publishedAt=None, observedAt=ts, dateSource='structured_source',
                dateConfidence='exact', suppressionReason=None, displayEligible=True,
                actionabilityScore=0.8, language='en')


def parse_chennai_calendar(value, ts):
    nodes = [node for node in Document(value).root.walk() if node.attrs.get('data-ev')]
    if not nodes:
        raise ValueError('Chennai event listing structure unavailable')
    items = []
    for node in nodes[:300]:
        attrs = node.attrs
        title, venue = clean(attrs.get('data-name')), clean(attrs.get('data-venue'))
        if not title or not venue or re.search(r'\b(online|virtual|zoom)\b', venue, re.I):
            continue
        try:
            day = datetime.strptime(attrs['data-date'], '%Y-%m-%d').replace(tzinfo=event_zone('Chennai'))
            minutes = int(attrs.get('data-min', '-1'))
            timed = 0 <= minutes < 1440
            start = instant(day + timedelta(minutes=minutes)) if timed else instant(day.astimezone(timezone.utc))
            until = instant(day + timedelta(days=1))
            end_day = None
            span = re.search(r'Runs\s+until\s+(?:[A-Za-z]{3}\s+)?(\d{1,2})\s+([A-Za-z]{3})(?:\s+(\d{4})\b)?', clean(node.text()), re.I)
            if span:
                number, month_name, year = span.groups()
                end_day = datetime(int(year or day.year), MONTH_MAP[month_name.lower()], int(number), tzinfo=event_zone('Chennai'))
                if not year and end_day < day:
                    end_day = end_day.replace(year=day.year+1)
                if end_day < day or end_day-day > timedelta(days=366):
                    continue
                until = instant(end_day + timedelta(days=1))
            if until <= ts or start > ts + 7 * DAY:
                continue
            link = next(n.attrs['href'] for n in node.walk()
                        if n.tag == 'a' and n.attrs.get('href', '').startswith('/event/'))
            item = base_item('chennai-calendar', title, urljoin(SOURCES['chennai-calendar'][3], link), 'Chennai', 'events', ts)
            item.update(eventStartAt=start, eventEndAt=until if end_day else None, expiryAt=until,
                        eventDateKey=day.date().isoformat(), datePrecision='time' if timed else 'day',
                        eventDateEndKey=end_day.date().isoformat() if end_day else None,
                        eventDateEndExclusiveKey=(end_day+timedelta(days=1)).date().isoformat() if end_day else None,
                        eventEndPrecision='day',
                        expirySource='event_day_display_boundary', venue=venue,
                        summary=clean(f"{venue}, Chennai. {attrs.get('data-clock') or 'Time not provided'}. {span[0]+'.' if span else ''} Confirm availability with the organiser; end time not provided."),
                        plannerEligible=start >= ts - 6 * HOUR or bool(end_day and start <= ts < until))
            items.append(item)
        except (KeyError, ValueError, StopIteration):
            continue
    return sorted(items, key=lambda row: (row['eventStartAt'] < ts, abs(row['eventStartAt']-ts)))[:MAX_EVENTS_PER_CITY]


def parse_oman_calendar(value, ts):
    cards = [node for node in Document(value).root.walk() if 'event-card' in node.attrs.get('class', '').split()]
    if not cards:
        raise ValueError('Oman event listing structure unavailable')
    items = []
    for card in cards[:40]:
        nodes = list(card.walk())
        calendar = next((node.attrs.get('href') for node in nodes
                         if node.tag == 'a' and node.attrs.get('href', '').startswith('https://calendar.google.com/calendar/render?')), None)
        if not calendar:
            continue
        params = parse_qs(urlparse(calendar).query)
        venue = params.get('location', [''])[0]
        # A country-wide calendar does not prove Muscat applicability.
        if not re.search(r'\b(muscat|seeb|qurum)\b|Oman Convention\s*(?:&|and)\s*Exhibition Centre', venue, re.I):
            continue
        try:
            start_value, end_value = params['dates'][0].split('/')
            start, end = [instant(datetime.strptime(value, '%Y%m%dT%H%M%SZ').replace(tzinfo=timezone.utc))
                          for value in (start_value, end_value)]
            if end <= ts or start > ts + 7 * DAY or end <= start:
                continue
            link = next(node.attrs['href'] for node in nodes if node.tag == 'a'
                        and urlparse(node.attrs.get('href', '')).path.startswith('/events/'))
            title = params['text'][0]
            item = base_item('oman-calendar', title, urljoin(SOURCES['oman-calendar'][3], link), 'Muscat', 'events', ts)
            item.update(eventStartAt=start, eventEndAt=end, expiryAt=end, datePrecision='time',
                        eventDateKey=datetime.fromtimestamp(start / 1000, event_zone('Muscat')).date().isoformat(),
                        venue=clean(venue), summary=clean(params.get('details', [''])[0]), plannerEligible=True)
            items.append(item)
        except (KeyError, ValueError, StopIteration):
            continue
    return sorted(items, key=lambda row: row['eventStartAt'])[:MAX_EVENTS_PER_CITY]


def parse_imd_nowcast(value, ts):
    text = clean(value, 12000)
    period = re.search(r'FROM\s+(\d{4})\s+HOURS\s+IST\s+OF\s+(\d{2}\.\d{2}\.\d{4})\s+TO\s+(\d{4})\s+HOURS\s+IST\s+OF\s+(\d{2}\.\d{2}\.\d{4})', text, re.I)
    warning = re.search(r'SEVERE WEATHER WARNING\s+(.+?)(?:NEXT UPDATE|$)', text, re.I)
    if not period or not warning or not re.search(r'NOWCAST FOR CHENNAI', text, re.I):
        raise ValueError('IMD dated Chennai bulletin unavailable')
    a, day_a, b, day_b = period.groups()
    start, end = [instant(datetime.strptime(f'{day} {clock}', '%d.%m.%Y %H%M').replace(tzinfo=event_zone('Chennai')))
                  for day, clock in ((day_a, a), (day_b, b))]
    if not start - 300_000 <= ts < end or not 0 < end - start <= 6 * HOUR:
        raise ValueError('IMD bulletin is expired or future-dated')
    message = clean(warning[1], 700)
    nil = bool(re.fullmatch(r'(?:NIL|NONE)[.\s]*', message, re.I))
    bulletin = dict(message=f'Chennai severe weather warning: {message}', issuedAt=start, validUntil=end,
                    status='checked_empty' if nil else 'active')
    if nil:
        return [], bulletin
    item = base_item('imd-nowcast', f'Chennai weather warning: {message}', SOURCES['imd-nowcast'][3], 'Chennai', 'weather_alerts', ts)
    item.update(publishedAt=start, eventStartAt=start, eventEndAt=end, expiryAt=end,
                datePrecision='time', summary=message, plannerEligible=True)
    return [item], bulletin


def parse_tneb(value, ts):
    doc = Document(value).root
    if re.search(r'SORRY,\s*NO PRESS RELEASE', doc.text(), re.I):
        return [], dict(status='checked_empty', message='TNEB Chennai page returned no press releases at this check.')
    clocks = re.search(r'between\s+(\d{1,2})[.:](\d{2})\s*([AP])\.?\s*M\.?\s+to\s+(\d{1,2})[.:](\d{2})\s*([AP])\.?\s*M', clean(doc.text()), re.I)
    if not clocks:
        raise ValueError('TNEB published shutdown timings unavailable')
    def minutes(hour, minute, suffix):
        if not 1 <= int(hour) <= 12 or not 0 <= int(minute) <= 59:
            raise ValueError('Invalid published shutdown timing')
        return (int(hour) % 12 + (12 if suffix.upper() == 'P' else 0)) * 60 + int(minute)
    a, b, c, d, e, f = clocks.groups()
    from_minute, to_minute = minutes(a, b, c), minutes(d, e, f)
    if from_minute >= to_minute:
        raise ValueError('Invalid shutdown interval')
    items = []
    rows = [node for node in doc.walk() if node.tag == 'tr']
    for node in rows[:100]:
        text = clean(node.text())
        date = re.search(r'\b(\d{2})[-/.](\d{2})[-/.](\d{4})\b', text)
        if not date:
            continue
        try:
            day, month, year = map(int, date.groups())
            local = datetime(year, month, day, tzinfo=event_zone('Chennai'))
            start, end = instant(local + timedelta(minutes=from_minute)), instant(local + timedelta(minutes=to_minute))
            if end <= ts or start > ts + 7 * DAY:
                continue
            item = base_item('tneb-shutdowns', 'Chennai scheduled power shutdown: ' + text, SOURCES['tneb-shutdowns'][3], 'Chennai', 'civic', ts)
            # A page can contain independent districts/dates. The row, not page,
            # is the occurrence. Timings come from TNEB's published table heading.
            item['id'] += '-' + sha256(text.encode()).hexdigest()[:12]
            item.update(occurrenceId=item['id'], eventStartAt=start, eventEndAt=end,
                        expiryAt=end, datePrecision='time', summary=text, plannerEligible=True)
            items.append(item)
        except ValueError:
            continue
    if not items:
        raise ValueError('No readable current TNEB shutdown rows; coverage unverified')
    return items, dict(status='active', message=f'{len(items)} current scheduled shutdown notice(s).')


def zoned_time(value):
    if not isinstance(value, str) or not re.search(r'(?:Z|[+-]\d{2}:\d{2})$', value):
        return None
    try:
        return instant(datetime.fromisoformat(value.replace('Z', '+00:00')))
    except ValueError:
        return None


def oman_warning_id(identifier):
    return sha256(f'oman-warnings|{identifier}'.encode()).hexdigest()[:24]


def parse_oman_warnings(result, ts):
    """Public UI's CAP info/area schema, with named-city and zoned-time gates."""
    alerts = result.get('data', {}).get('alerts')
    if result.get('success') is not True or not isinstance(alerts, list) or len(alerts) > 50:
        raise ValueError('Oman warning response unavailable')
    items = []
    for alert in alerts:
        if not isinstance(alert, dict) or not alert.get('identifier'):
            raise ValueError('Oman warning identity unavailable')
        if alert.get('status', 'Actual') != 'Actual':
            continue  # Exercise/Test messages never become real warnings.
        references = alert.get('references') or ''
        if not isinstance(references, str):
            raise ValueError('Oman warning reference schema unavailable')
        if alert.get('msgType') in ('Update', 'Cancel'):
            # CAP references are space-separated sender,identifier,sent triples.
            for reference in references.split():
                parts = reference.split(',')
                if len(parts) == 3 and parts[1]:
                    items.append(dict(id=oman_warning_id(parts[1]), category='weather_alerts',
                                      expiryAt=ts-1, suppressionReason='Superseded official warning',
                                      retireOccurrenceId='oman-warnings:'+parts[1], observedAt=ts))
        if alert.get('msgType') == 'Cancel':
            items.append(dict(id=oman_warning_id(alert['identifier']), category='weather_alerts',
                              expiryAt=ts-1, suppressionReason='Cancelled official warning',
                              retireOccurrenceId='oman-warnings:'+alert['identifier'], observedAt=ts))
            continue
        infos = alert.get('info')
        if not isinstance(infos, list) or not infos:
            raise ValueError('Oman warning content unavailable')
        english = [info for info in infos if str(info.get('language', '')).startswith('en')]
        for info in (english or infos)[:3]:
            areas = info.get('area')
            if not isinstance(areas, list) or not areas or any(not area.get('areaDesc') for area in areas):
                raise ValueError('Oman warning affected area unavailable')
            descriptions = ' '.join(str(area['areaDesc']) for area in areas)
            if not re.search(r'\b(muscat|seeb|qurum|ghubrah|mawaleh)\b|مسقط|السيب', descriptions, re.I):
                continue
            start = zoned_time(info.get('onset') or info.get('effective'))
            end = zoned_time(info.get('expires'))
            if not start or not end or end <= start:
                raise ValueError('Oman warning validity unavailable')
            if end <= ts or start > ts+7*DAY:
                continue
            title = info.get('headline') or info.get('event')
            if not title:
                raise ValueError('Oman warning headline unavailable')
            item = base_item('oman-warnings', 'Muscat weather warning: '+title, SOURCES['oman-warnings'][3], 'Muscat', 'weather_alerts', ts)
            item.update(id=oman_warning_id(alert['identifier']), occurrenceId='oman-warnings:'+str(alert['identifier']),
                        publishedAt=zoned_time(alert.get('sent')), eventStartAt=start,
                        eventEndAt=end, expiryAt=end, datePrecision='time', plannerEligible=True,
                        summary=clean(' '.join(str(info.get(key) or '') for key in ('description', 'instruction'))),
                        venue=clean(descriptions), language=str(info.get('language') or 'en'))
            items.append(item)
            break  # Same CAP message's alternative language is not another alert.
    active = [item for item in items if not item.get('suppressionReason')]
    message = f'{len(active)} current dated Muscat warning(s) in the CAA public feed.' if alerts else 'Oman CAA public warning feed returned no alerts for today at this check.'
    return items, dict(status='active' if active else 'checked_empty', message=message)


def collect_local_source(source_id, ts):
    category, city, source, url = SOURCES[source_id]
    health = dict(category=category, city=city, source=source, url=url, checkedAt=ts, ok=False, items=0)
    try:
        body = read_public(url)
        health['bodySha256'] = sha256(body).hexdigest()
        value = body.decode('utf-8', errors='replace') if source_id != 'imd-nowcast' else ''
        if source_id == 'chennai-calendar':
            items = parse_chennai_calendar(value, ts)
        elif source_id == 'oman-calendar':
            # Apply the official form's own Muscat governorate value; the broad
            # first page otherwise hides most local events behind other regions.
            doc = Document(value).root
            select = next((node for node in doc.walk() if node.tag == 'select' and node.attrs.get('name') == 'governorate'), None)
            option = next((node for node in select.walk() if node.tag == 'option' and clean(node.text()) == 'Muscat'), None) if select else None
            if option and str(option.attrs.get('value', '')).isdigit():
                today = datetime.fromtimestamp(ts/1000, event_zone('Muscat')).date()
                query = urlencode(dict(governorate=option.attrs['value'], startDate=today.isoformat(), endDate=(today+timedelta(days=7)).isoformat()))
                body = read_public(url+'?'+query)
                health.update(url=url+'?'+query, bodySha256=sha256(body).hexdigest())
                value = body.decode('utf-8', errors='replace')
            items = parse_oman_calendar(value, ts)
        elif source_id == 'imd-nowcast':
            from pypdf import PdfReader
            items, details = parse_imd_nowcast('\n'.join(page.extract_text() for page in PdfReader(BytesIO(body)).pages[:2]), ts)
            health.update(details)
        elif source_id == 'tneb-shutdowns':
            items, details = parse_tneb(value, ts)
            health.update(details)
        else:
            # This is the read-only request made by the public weather UI. Never
            # persist the page nonce in the published evidence or request URL.
            match = re.search(r'(?:var\s+|window\.)?oman_js_object\s*=\s*(\{.*?\});', value, re.S)
            config = json.loads(match[1]) if match else {}
            endpoint = config.get('ajax_url', '')
            if endpoint != 'https://met.caa.gov.om/wp-admin/admin-ajax.php' or not config.get('nonce'):
                raise ValueError('Public Oman warning configuration unavailable')
            result = json.loads(read_public(endpoint, urlencode(dict(action='get_warnings', nonce=config['nonce'], day=0)).encode()))
            items, details = parse_oman_warnings(result, ts)
            health.update(details)
        health.update(ok=True, items=sum(not item.get('suppressionReason') for item in items), lastSuccess=ts)
        health.setdefault('status', 'active' if items else 'checked_empty')
        health.setdefault('message', f'{len(items)} current dated event listing(s).')
        return items, {source_id: health}
    except Exception as error:
        health.update(status='unavailable', error=str(error)[:300], message='Source could not be verified at this check.')
        return [], {source_id: health}
