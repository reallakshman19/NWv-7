import { toLocalDateKey } from '../utils/dateKey.js';

function asText(value, fallback = '') {
  const text = String(value || '').trim();
  return text || fallback;
}

function toDateKey(value) {
  // Local-calendar key (UTC extraction shifted early-morning IST timestamps
  // to the previous day, mismatching plannerStorage's local keys).
  return toLocalDateKey(value) || 'undated';
}

function formatDisplayDate(dateKey) {
  if (!dateKey || dateKey === 'undated') return 'Undated';

  const parsed = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return dateKey;

  return parsed.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

function normalizeCategory(item) {
  return asText(item?.category || item?.type || 'event', 'event')
    .toLowerCase()
    .replace(/\s+/g, '_');
}

export function getPlannerItemInspector(item, fallbackDateKey = 'undated') {
  if (!item) return null;

  const raw = item.raw || item;
  const dateKey = toDateKey(
    item.dateKey ||
    raw.planDate ||
    raw.eventDateKey ||
    raw.date ||
    raw.eventDate ||
    raw.releaseDate ||
    fallbackDateKey
  );

  const title = asText(item.title || raw.title, 'Untitled planner item');
  const description = asText(
    item.description ||
    raw.description ||
    raw.summary ||
    raw.subtitle ||
    ''
  );

  const link = asText(item.link || item.url || raw.link || raw.url || '');
  const source = asText(raw.source || raw.platform || raw.publisher || raw.category || '');
  const category = normalizeCategory(item);

  const facts = [
    { key: 'date', label: 'Date', value: formatDisplayDate(dateKey) },
    { key: 'category', label: 'Category', value: category },
    { key: 'source', label: 'Source', value: source || 'Not specified' },
    { key: 'link', label: 'Link', value: link ? 'Available' : 'Not available' },
  ];

  const actionHints = [
    'Export this item to calendar',
    'Open source link when available',
    'Remove item with undo protection'
  ];

  return {
    id: asText(item.id || raw.savedPlanId || raw.id || title),
    storageDateKey: item.storageDateKey || fallbackDateKey,
    title,
    description,
    category,
    dateKey,
    displayDate: formatDisplayDate(dateKey),
    link,
    source,
    hasLink: Boolean(link),
    raw,
    facts,
    actionHints,
  };
}

export default getPlannerItemInspector;
