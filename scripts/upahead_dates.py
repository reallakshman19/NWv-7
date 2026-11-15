"""Date/range extraction anchored to the source publication date.

UTC calendar days match the publisher contract. A range ends at midnight after
the final advertised day. Unknown event dates never become the fetch timestamp.
"""
import re
from datetime import datetime, timezone, timedelta
from html import unescape

MONTHS = ('january', 'february', 'march', 'april', 'may', 'june',
          'july', 'august', 'september', 'october', 'november', 'december')
MONTH_MAP = {name: index + 1 for index, name in enumerate(MONTHS)}
MONTH_MAP.update({name[:3]: index + 1 for index, name in enumerate(MONTHS)})
MONTH_MAP['sept'] = 9
MONTH = r'(?:' + '|'.join(sorted(MONTH_MAP, key=len, reverse=True)) + r')\.?'
DAY = r'\d{1,2}(?:st|nd|rd|th)?'
SEP = r'\s*(?:to|through|until|[–—-])\s*'
MDY = rf'{MONTH}\s+{DAY}(?:,?\s+\d{{4}})?'
DMY = rf'{DAY}\s+{MONTH}(?:,?\s+\d{{4}})?'
ISO = r'\d{4}-\d{2}-\d{2}'
TOKEN = rf'(?:{ISO}|{MDY}|{DMY})'
WEEKDAYS = ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')


def _calendar_date(year, month, day, ref):
    if year:
        return datetime(int(year), month, int(day), tzinfo=timezone.utc)
    # Nearest year handles December/January without resurrecting an expired
    # November occurrence as next year's event.
    candidates = []
    for candidate_year in (ref.year - 1, ref.year, ref.year + 1):
        try:
            candidates.append(datetime(candidate_year, month, int(day), tzinfo=timezone.utc))
        except ValueError:
            pass
    if not candidates:
        raise ValueError('Invalid calendar date')
    return min(candidates, key=lambda date: abs((date - ref).total_seconds()))


def _parse_date(token, ref):
    token = re.sub(r'(\d)(?:st|nd|rd|th)\b', r'\1', token.lower()).replace('.', '')
    if re.fullmatch(ISO, token):
        return datetime.strptime(token, '%Y-%m-%d').replace(tzinfo=timezone.utc), True
    match = re.fullmatch(rf'({MONTH})\s+(\d{{1,2}})(?:,?\s+(\d{{4}}))?', token)
    if match:
        month, day, year = match.groups()
    else:
        match = re.fullmatch(rf'(\d{{1,2}})\s+({MONTH})(?:,?\s+(\d{{4}}))?', token)
        if not match:
            raise ValueError('Unrecognised date')
        day, month, year = match.groups()
    return _calendar_date(year, MONTH_MAP[month], day, ref), bool(year)


def extract_event_dates(text, ref_ts):
    ref = datetime.fromtimestamp(ref_ts / 1000, tz=timezone.utc)
    text = re.sub(r'<[^>]+>', ' ', unescape(text or '')).lower()
    # Expand ranges that share a month/year before parsing both endpoints.
    text = re.sub(rf'\b({MONTH})\s+({DAY}){SEP}({DAY})(,?\s+\d{{4}})?\b',
                  lambda m: f'{m[1]} {m[2]}{m[4] or ""} to {m[1]} {m[3]}{m[4] or ""}', text)
    text = re.sub(rf'\b({DAY}){SEP}({DAY})\s+({MONTH})(\s+\d{{4}})?\b',
                  lambda m: f'{m[1]} {m[3]}{m[4] or ""} to {m[2]} {m[3]}{m[4] or ""}', text)
    for match in re.finditer(rf'(?<![\w-])({TOKEN}){SEP}({TOKEN})(?![\w-])', text):
        try:
            start, start_year = _parse_date(match[1], ref)
            end, end_year = _parse_date(match[2], start)
            if end_year and not start_year:
                start, _ = _parse_date(match[1], end)
            if end < start and not end_year and start.month == 12 and end.month == 1:
                end = end.replace(year=start.year + 1)
            if start <= end and (end - start).days <= 366:
                return int(start.timestamp() * 1000), int((end + timedelta(days=1)).timestamp() * 1000), 'range'
        except ValueError:
            continue
    for match in re.finditer(rf'(?<![\w-]){TOKEN}(?![\w-])', text):
        try:
            date, explicit_year = _parse_date(match[0], ref)
            return int(date.timestamp() * 1000), None, 'exact' if explicit_year else 'inferred'
        except ValueError:
            continue
    weekend = re.search(r'\b(this|next) weekend\b', text)
    if weekend:
        days = (5 - ref.weekday()) % 7
        if weekend[1] == 'this' and ref.weekday() == 6:
            days = -1
        if weekend[1] == 'next' and days == 0:
            days = 7
        start = (ref + timedelta(days=days)).replace(hour=0, minute=0, second=0, microsecond=0)
        return int(start.timestamp() * 1000), int((start + timedelta(days=2)).timestamp() * 1000), 'range'
    relative = re.search(r'\b(today|tomorrow|(?:this|next)\s+(?:' + '|'.join(WEEKDAYS) + r'))\b', text)
    if relative:
        word = relative[0]
        if word in ('today', 'tomorrow'):
            days = 1 if word == 'tomorrow' else 0
        else:
            prefix, weekday = word.split()
            days = (WEEKDAYS.index(weekday) - ref.weekday()) % 7
            if prefix == 'next' and days == 0:
                days = 7
        date = (ref + timedelta(days=days)).replace(hour=0, minute=0, second=0, microsecond=0)
        return int(date.timestamp() * 1000), None, 'inferred'
    # DD/MM is the configured India/Oman convention. ISO is handled first.
    numeric = re.search(r'(?<![\d-])(\d{1,2})([/-])(\d{1,2})(?:\2(\d{4}|\d{2}))?(?!\d)', text)
    if numeric:
        try:
            day, separator, month, year = numeric.groups()
            if separator == '-' and not year:
                return None, None, 'unknown'  # A score such as 6-2 is not an event date.
            if year and len(year) == 2:
                year = '20' + year
            date = _calendar_date(year, int(month), day, ref)
            return int(date.timestamp() * 1000), None, 'inferred'
        except ValueError:
            pass
    return None, None, 'unknown'


def extract_event_date(text, ref_ts):
    """Compatibility for callers needing only the start date."""
    start, _end, confidence = extract_event_dates(text, ref_ts)
    return start, confidence
