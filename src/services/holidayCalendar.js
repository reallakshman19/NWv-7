import {
  LOCAL_HOLIDAYS, HOLIDAY_SOURCES, HOLIDAY_CALENDAR_VERSION, HOLIDAY_CALENDAR_CHECKED_AT,
} from '../data/holidays/localHolidays2026_2027.js';

const LOCATION_OFFSETS = { Chennai: '+05:30', Muscat: '+04:00' };

function nextDateKey(date) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

function selectedLocation(location, locations) {
  const selected = (locations || []).map(value => String(value).toLowerCase().trim());
  if (!selected.length) return true;
  return location === 'Chennai'
    ? selected.some(value => ['chennai', 'tamil nadu', 'tamilnadu', 'india', 'in'].includes(value))
    : selected.some(value => ['muscat', 'oman', 'om'].includes(value));
}

/** A bundled calendar never borrows a feed-fetch time or claims an estimate is announced. */
export function getHolidayCalendarItems(locations = [], now = Date.now()) {
  const nowMs = new Date(now).getTime();
  const groups = new Map();
  for (const row of LOCAL_HOLIDAYS) {
    if (!selectedLocation(row.location, locations)) continue;
    const groupKey = `${row.location}:${row.date}:${row.endDate || row.date}:${row.status}`;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(row);
  }
  return [...groups.values()].map(rows => {
    const row = rows[0];
    const source = HOLIDAY_SOURCES[row.sourceKey];
    const offset = LOCATION_OFFSETS[row.location];
    const eventStartAt = `${row.date}T00:00:00${offset}`;
    const eventEndAt = `${nextDateKey(row.endDate || row.date)}T00:00:00${offset}`;
    const provisional = row.status !== 'announced';
    const bankOnly = rows.every(value => value.scope === 'banks-only');
    const title = rows.map(value => value.title).join(' / ');
    const id = `holiday-${row.location.toLowerCase()}-${row.date.slice(0, 4)}-${rows.map(value => value.key).sort().join('-')}`;
    const scopeDescription = bankOnly
      ? 'Banks only; this is not a general office holiday.'
      : row.location === 'Chennai'
        ? 'Tamil Nadu government offices and commercial / co-operative banks. Private employer leave policies can differ.'
        : 'Oman public and private sectors; essential services may continue under the applicable rules.';
    return {
      id, hiddenKey: id, canonicalId: id,
      title: `${title} · ${row.date.slice(0, 4)}${provisional ? ' (provisional)' : ''}`,
      holidayNames: rows.map(value => value.title),
      holidayStatus: row.status,
      holidayScope: row.scope,
      calendarDataset: HOLIDAY_CALENDAR_VERSION,
      calendarCheckedAt: HOLIDAY_CALENDAR_CHECKED_AT,
      date: row.date, eventDateKey: row.date, releaseDate: row.date, planDate: row.date,
      eventDateEndKey: row.endDate || row.date,
      eventStartAt, eventEndAt, expiryAt: eventEndAt,
      category: 'festivals', type: 'festival',
      city: row.location, locationCanonical: row.location,
      source: source.label, sourceUrl: source.url, link: source.url,
      sourceAuthority: source.authority,
      description: provisional
        ? 'Provisional occasion date. Oman has not announced the 2027 days off; lunar dates and observed leave may change. Check the Ministry of Labour before booking.'
        : scopeDescription,
      dateConfidence: provisional ? 'tentative' : 'official-calendar',
      datePrecision: 'day', displayEligible: true, plannerEligible: !provisional,
    };
  }).filter(item => nowMs < Date.parse(item.expiryAt))
    .sort((a, b) => a.date.localeCompare(b.date) || a.locationCanonical.localeCompare(b.locationCanonical));
}

export function isBundledHoliday(item) {
  return Boolean(item?.calendarDataset);
}
