import { toLocalDateKey } from '../utils/dateKey.js';
import { isUpAheadItemActive, upAheadTimeMs } from './upAheadLifecycle.js';
import { getUpAheadPlannerSuggestions } from './upAheadPlannerSuggestions.js';

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  return value && typeof value === 'object' ? value : {};
}

function asDateValue(value) {
  if (!value) return Number.POSITIVE_INFINITY;
  const time = upAheadTimeMs(value);
  return Number.isFinite(time) && time > 0 ? time : Number.POSITIVE_INFINITY;
}

function normalizeItemDate(item) {
  return item?.date || item?.releaseDate || item?.eventDate || item?.planDate || item?.eventStartAt || '';
}

function getItemId(item, fallbackPrefix, index) {
  return item?.hiddenKey || item?.canonicalId || item?.id || `${fallbackPrefix}-${index}`;
}

function getItemType(item, fallbackType) {
  return item?.type || item?.category || item?.tags?.[0] || fallbackType;
}

function makeBriefingItem(item, fallbackType, index) {
  const date = normalizeItemDate(item);

  return {
    id: getItemId(item, fallbackType, index),
    title: item?.title || 'Untitled item',
    description: item?.description || item?.summary || '',
    date,
    dateValue: asDateValue(date),
    type: getItemType(item, fallbackType),
    source: item?.source || item?.platform || item?.category || 'Up Ahead',
    link: item?.link || item?.url || '',
    icon: item?.icon || '•',
    raw: item,
  };
}

function sortByDateThenTitle(items) {
  return [...items].sort((a, b) => {
    if (a.dateValue !== b.dateValue) return a.dateValue - b.dateValue;
    return String(a.title).localeCompare(String(b.title));
  });
}

function takeUnique(items, limit) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    const key = `${String(item.title).toLowerCase()}|${item.date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }

  return result;
}

function getLocations(settings) {
  const locations = safeArray(settings?.upAhead?.locations)
    .map(location => String(location || '').trim())
    .filter(Boolean);

  return locations.length > 0 ? locations : ['Chennai'];
}

function fromSection(data, key, fallbackType) {
  return safeArray(safeObject(data?.sections)[key]).map((item, index) => (
    makeBriefingItem(item, fallbackType, index)
  ));
}

function fromTimeline(data) {
  return safeArray(data?.timeline).flatMap(day => (
    safeArray(day?.items).map((item, index) => makeBriefingItem({
      ...item,
      date: item?.date || day?.date,
    }, item?.type || 'timeline', index))
  ));
}

function fromWeeklyPlan(data) {
  return safeArray(data?.weekly_plan).flatMap(day => (
    safeArray(day?.items).map((item, index) => makeBriefingItem({
      ...item,
      date: item?.planDate || item?.eventDate || day?.date,
    }, item?.type || 'plan', index))
  ));
}

function buildUrgencyLabel(alertCount, offerCount, todayCount) {
  if (alertCount > 0) return 'Alerts need attention';
  if (todayCount > 0) return 'Today has actionable items';
  if (offerCount > 0) return 'Offers are available';
  return 'No urgent action';
}

export function getUpAheadBriefing({ data, settings, visible = {}, now = Date.now() }) {
  const locations = getLocations(settings);

  const alertItems = sortByDateThenTitle(
    safeArray(visible.combinedAlerts).map((item, index) => makeBriefingItem(item, 'alert', index))
  );

  const offerItems = sortByDateThenTitle(
    safeArray(visible.offerItems).map((item, index) => makeBriefingItem(item, 'offer', index))
  );

  const movieItems = sortByDateThenTitle(
    safeArray(visible.movieCards).map((item, index) => makeBriefingItem(item, 'movie', index))
  );

  const festivalItems = sortByDateThenTitle(
    safeArray(visible.festivalCards).map((item, index) => makeBriefingItem(item, 'festival', index))
  );

  const eventItems = sortByDateThenTitle(Array.isArray(visible.eventItems)
    ? visible.eventItems.map((item, index) => makeBriefingItem(item, 'event', index))
    : [...fromSection(data, 'events', 'event'), ...fromSection(data, 'sports', 'sports')]);

  const timelineItems = visible.projectedSections ? [] : sortByDateThenTitle(fromTimeline(data));
  const planItems = visible.projectedSections ? [] : sortByDateThenTitle(fromWeeklyPlan(data));

  const soonCutoff = now + 72 * 60 * 60 * 1000;
  const todayKey = toLocalDateKey(now);

  const allDated = takeUnique(sortByDateThenTitle([
    ...eventItems,
    ...movieItems,
    ...festivalItems,
    ...offerItems,
    ...timelineItems,
    ...planItems,
    ...alertItems,
  ]).filter(item => Number.isFinite(item.dateValue) && isUpAheadItemActive(item.raw, now)), Infinity);

  const todayItems = takeUnique(
    allDated.filter(item => toLocalDateKey(item.dateValue) === todayKey
      || (item.dateValue < now && upAheadTimeMs(item.raw.eventEndAt) > now)),
    Infinity
  );

  const next72hItems = takeUnique(
    allDated.filter(item => (toLocalDateKey(item.dateValue) >= todayKey
      || upAheadTimeMs(item.raw.eventEndAt) > now) && item.dateValue <= soonCutoff),
    Infinity
  );

  const highlights = [
    ...takeUnique(alertItems, 2),
    ...takeUnique(todayItems, 2),
    ...takeUnique(eventItems, 2),
    ...takeUnique(movieItems, 1),
    ...takeUnique(offerItems, 1),
  ];

  const buckets = [
    {
      key: 'alerts',
      label: 'Alerts',
      count: alertItems.length,
      items: takeUnique(alertItems, 3),
    },
    {
      key: 'today',
      label: 'Today',
      count: todayItems.length,
      items: todayItems.slice(0, 5),
    },
    {
      key: 'next72h',
      label: 'Next 72h',
      count: next72hItems.length,
      items: next72hItems.slice(0, 8),
    },
    {
      key: 'events',
      label: 'Events',
      count: eventItems.length,
      items: takeUnique(eventItems, 4),
    },
    {
      key: 'releases',
      label: 'Releases',
      count: movieItems.length,
      items: takeUnique(movieItems, 4),
    },
    {
      key: 'offers',
      label: 'Offers',
      count: offerItems.length,
      items: takeUnique(offerItems, 4),
    },
    {
      key: 'festivals',
      label: 'Festivals',
      count: festivalItems.length,
      items: takeUnique(festivalItems, 4),
    },
  ];

  const plannerReadyCount = getUpAheadPlannerSuggestions({ timeline: [{ items: allDated.map(item => item.raw) }] },
    {}, new Set(), settings?.upAhead, now).length;
  const coverageMissing = visible.coverageAvailable === false;
  const urgencyLabel = coverageMissing && !alertItems.length && !todayItems.length && !offerItems.length
    ? 'Current coverage unavailable' : buildUrgencyLabel(alertItems.length, offerItems.length, todayItems.length);

  const notes = [];

  if (alertItems.length > 0) notes.push(`${alertItems.length} alert item(s) should be reviewed first.`);
  if (todayItems.length > 0) notes.push(`${todayItems.length} item(s) are scheduled for today or still running.`);
  if (next72hItems.length > 0) notes.push(`${next72hItems.length} item(s) are visible within the next 72 hours.`);
  if (offerItems.length > 0) notes.push(`${offerItems.length} offer item(s) can be saved or dismissed.`);
  if (plannerReadyCount > 0) notes.push(`${plannerReadyCount} planner-ready item(s) available.`);
  if (coverageMissing) notes.push('Current source coverage is unavailable; an empty tab does not confirm there are no alerts or events.');
  if (notes.length === 0) notes.push('No urgent Up Ahead actions found.');

  return {
    status: alertItems.length > 0 ? 'urgent' : plannerReadyCount > 0 ? 'active' : coverageMissing ? 'limited' : 'quiet',
    title: urgencyLabel,
    locations,
    locationLabel: locations.join(', '),
    highlights: takeUnique(highlights, 6),
    buckets,
    alertCount: alertItems.length,
    offerCount: offerItems.length,
    eventCount: eventItems.length,
    movieCount: movieItems.length,
    festivalCount: festivalItems.length,
    todayCount: todayItems.length,
    next72hCount: next72hItems.length,
    plannerReadyCount,
    notes,
  };
}

export default getUpAheadBriefing;
