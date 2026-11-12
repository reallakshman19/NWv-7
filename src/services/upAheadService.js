import { DEFAULT_SETTINGS } from '../utils/storage.js';
import plannerStorage from '../utils/plannerStorage.js';
import { fetchIntelligentUpAheadData } from './intelligentUpAheadFetcher.js';
import { toDateKey } from '../utils/dateDisplay.js';
import {
  isUpAheadItemActive,
  mergeUpAheadItems,
  UP_AHEAD_SOURCE_LOOKBACK_MS,
  upAheadDateKey,
  upAheadIdentityKeys,
  upAheadTimeMs,
} from './upAheadLifecycle.js';

export const CACHE_KEY = 'upAhead_cache';
export const UP_AHEAD_UPDATED_EVENT = 'upahead-updated';
export const UP_AHEAD_REFRESH_MAX_AGE_MS = 6 * 60 * 60 * 1000;

const STATIC_UPAHEAD_MAX_AGE_MS = 12 * 60 * 60 * 1000;

function normalizeDateKey(value) {
  const key = toDateKey(value, null);
  return key || null;
}

function getItemKey(item) {
  if (!item) return '';
  if (typeof item === 'string') return item.trim();
  return String(item.hiddenKey || item.canonicalId || item.id || item.link || item.title || '').trim();
}

function uniqByKey(items = []) {
  const seen = new Set();
  const output = [];
  for (const item of items || []) {
    const key = getItemKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function hasItems(items = []) {
  return Array.isArray(items) && items.some(Boolean);
}

function filterPastDatedDisplayItems(items = [], now = Date.now()) {
  return uniqByKey(items).filter(item => isUpAheadItemActive(item, now));
}

export function isUpAheadDataFresh(data, maxAgeMs = STATIC_UPAHEAD_MAX_AGE_MS) {
  if (!data || data.auditSummary?.fallback === 'festival_calendar') return false;
  const fetchedAt = upAheadTimeMs(data.fetchedAt || data.lastUpdated);
  if (!fetchedAt) return false;
  const age = Date.now() - fetchedAt;
  return age >= 0 && age <= maxAgeMs;
}

function getItemType(category) {
  const value = String(category || '').toLowerCase();
  const map = {
    movies: 'movie',
    movie: 'movie',
    events: 'event',
    event: 'event',
    festivals: 'festival',
    festival: 'festival',
    alerts: 'alert',
    alert: 'alert',
    sports: 'sport',
    shopping: 'shopping',
    offer: 'shopping',
    civic: 'civic',
    weather_alerts: 'weather_alert',
    weather_alert: 'weather_alert',
    airlines: 'airline',
    airline_offer: 'airline'
  };
  return map[value] || 'event';
}

function categorySectionKey(category) {
  const value = String(category || '').toLowerCase();
  const map = {
    movie: 'movies',
    movies: 'movies',
    event: 'events',
    events: 'events',
    festival: 'festivals',
    festivals: 'festivals',
    alert: 'alerts',
    alerts: 'alerts',
    civic: 'civic',
    sports: 'sports',
    shopping: 'shopping',
    weather_alert: 'weather_alerts',
    weather_alerts: 'weather_alerts',
    offer: 'shopping',
    airline_offer: 'airlines',
    airlines: 'airlines'
  };
  return map[value] || value || 'events';
}

function getDayLabel(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date.getTime() === today.getTime()) return 'Today';
  if (date.getTime() === tomorrow.getTime()) return 'Tomorrow';
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function formatPlanLabel(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  const getOrdinal = (n) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };
  return `${getOrdinal(d.getDate())} ${d.toLocaleDateString('en-US', { month: 'short' })}`;
}

function generateWeeklyPlan(timeline = []) {
  const plan = [];
  const blacklist = plannerStorage.getBlacklist ? plannerStorage.getBlacklist() : new Set();
  const persistedPlan = plannerStorage.getPlan ? plannerStorage.getPlan() : {};
  const timelineByDate = new Map((timeline || []).map(day => [day.date, day.items || []]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < 7; i += 1) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dateKey = normalizeDateKey(d);
    const timelineItems = (timelineByDate.get(dateKey) || [])
      .filter(item => !blacklist.has(getItemKey(item)))
      .filter(item => item.plannerEligible !== false)
      .map(item => ({
        id: item.id || getItemKey(item),
        hiddenKey: getItemKey(item),
        title: item.title,
        type: item.type || getItemType(item.category),
        icon: item.icon || '📅',
        link: item.link,
        description: item.description,
        isOffer: item.type === 'shopping' || item.type === 'airline'
      }));

    const savedItems = (persistedPlan[dateKey] || [])
      .filter(item => !blacklist.has(getItemKey(item)))
      .map(item => ({
        id: item.id || getItemKey(item),
        hiddenKey: getItemKey(item),
        title: item.title,
        type: item.type || item.category || 'event',
        icon: item.icon || '📅',
        link: item.link,
        description: item.description,
        isOffer: Boolean(item.isOffer) || ['shopping', 'airline', 'airlines'].includes(String(item.type || item.category || '').toLowerCase())
      }));

    const merged = uniqByKey([...savedItems, ...timelineItems]).slice(0, 10);

    plan.push({
      day: d.toLocaleDateString('en-US', { weekday: 'long' }),
      date: formatPlanLabel(dateKey),
      items: merged
    });
  }

  return plan;
}

function buildLegacyDisplayFromRanked(items = [], meta = {}) {
  const sections = {
    movies: [],
    festivals: [],
    alerts: [],
    events: [],
    sports: [],
    shopping: [],
    civic: [],
    weather_alerts: [],
    airlines: []
  };

  const timelineMap = new Map();

  for (const item of items || []) {
    if (!item) continue;
    const sectionKey = categorySectionKey(item.category);
    const eventDateKey = item.eventDateKey || normalizeDateKey(item.eventDate) || null;
    const displayItem = {
      id: item.canonicalId || item.rawSourceId || item.link || item.title,
      hiddenKey: item.canonicalId || item.rawSourceId || item.link || item.title,
      canonicalId: item.canonicalId || item.rawSourceId || item.link || item.title,
      title: item.title,
      link: item.link,
      description: item.description || item.summary || '',
      date: eventDateKey,
      eventDateKey,
      releaseDate: eventDateKey,
      planDate: eventDateKey,
      category: sectionKey,
      source: item.sourceDomain || item.source || sectionKey,
      city: item.city || null,
      region: item.region || null,
      locationCanonical: item.locationCanonical || item.city || item.region || null,
      dateConfidence: item.dateConfidence || 'none',
      decisionTrace: item.decisionTrace || [],
      plannerEligible: Boolean(item.plannerEligible && eventDateKey),
      displayEligible: item.displayEligible !== false,
      publishedAt: item.publishedAt || item.publishDate || null,
      eventStartAt: item.eventStartAt || item.originalItem?.eventStartAt || null,
      eventEndAt: item.eventEndAt || item.originalItem?.eventEndAt || null,
      eventDateEndKey: item.eventDateEndKey || null,
      expiryAt: item.expiryAt || item.originalItem?.expiryAt || null,
      lifecycle: item.lifecycle || null,
      suppressionReason: item.suppressionReason || null,
      upAheadIds: [item.rawSourceId, ...(item.mergedWith || [])].filter(Boolean)
    };

    if (displayItem.displayEligible && sections[sectionKey]) {
      sections[sectionKey].push(displayItem);
    }

    if (item.upAheadEligible && eventDateKey) {
      if (!timelineMap.has(eventDateKey)) {
        timelineMap.set(eventDateKey, {
          date: eventDateKey,
          dayLabel: getDayLabel(eventDateKey),
          items: []
        });
      }
      timelineMap.get(eventDateKey).items.push({
        ...displayItem,
        sourceId: item.rawSourceId || displayItem.id,
        type: getItemType(item.category),
        tags: [sectionKey],
        icon: null,
      });
    }
  }

  const timeline = Array.from(timelineMap.values())
    .map(day => ({
      ...day,
      items: mergeUpAheadItems(day.items)
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const weekly_plan = generateWeeklyPlan(timeline);

  return {
    timeline,
    sections,
    weekly_plan,
    lastUpdated: new Date().toISOString(),
    auditSummary: meta.auditSummary || null,
    dropReport: meta.dropReport || []
  };
}

export function isActualWeatherAlertText(text, upAheadSettings = null) {
  const rules = upAheadSettings?.weatherAlertRules || DEFAULT_SETTINGS.upAhead.weatherAlertRules;
  const lower = String(text || '').toLowerCase();
  const weatherWords = [
    ...(rules.contextKeywords || []),
    ...(rules.ambiguousKeywords || []),
    ...((upAheadSettings?.keywords?.weather_alerts) || DEFAULT_SETTINGS.upAhead.keywords.weather_alerts || [])
  ];
  let matches = 0;
  for (const word of weatherWords) {
    if (lower.includes(String(word).toLowerCase())) matches += 1;
  }
  return matches >= (rules.minimumMatches || 2);
}

export function isActualOfferText(text, upAheadSettings = null) {
  const rules = upAheadSettings?.offerRules || DEFAULT_SETTINGS.upAhead.offerRules;
  const lower = String(text || '').toLowerCase();
  let matches = 0;
  for (const word of rules.offerKeywords || []) {
    if (lower.includes(String(word).toLowerCase())) matches += 1;
  }
  return matches >= (rules.minimumMatches || 1);
}

function transformPythonItemsToDisplay(items = []) {
  const ranked = items
    .filter(Boolean)
    .map(it => {
      const category = categorySectionKey(it.category);
      const eventDateKey = upAheadDateKey(it);
      return {
        canonicalId:       it.id || it.url || it.title,
        rawSourceId:       it.id || it.url || it.title,
        title:             it.title,
        summary:           it.summary,
        description:       it.summary,
        link:              it.url || it.link,
        category,
        publishedAt:       it.publishedAt || null,
        eventStartAt:      it.eventStartAt || null,
        eventEndAt:        it.eventEndAt || null,
        expiryAt:          it.expiryAt || null,
        lifecycle:        it.lifecycle || null,
        suppressionReason: it.suppressionReason || null,
        eventDateKey,
        dateConfidence:    it.dateConfidence || (eventDateKey ? 'exact' : 'none'),
        city:              it.city || null,
        region:            it.region || null,
        locationCanonical: it.city || it.region || null,
        sourceDomain:      it.source,
        source:            it.source,
        displayEligible:   it.displayEligible !== false,
        upAheadEligible:   Boolean(eventDateKey),
        plannerEligible:   Boolean(it.plannerEligible && eventDateKey),
        decisionTrace:     it.decisionTrace || [],
      };
    });
  return buildLegacyDisplayFromRanked(ranked, { auditSummary: null, dropReport: [] });
}

function prepareItem(item, observedAt, fallback = {}) {
  const row = typeof item === 'string' ? { title: item } : item;
  if (!row) return null;
  return {
    ...row,
    category: row.category || fallback.category,
    date: upAheadDateKey(row) || fallback.date || null,
    observedAt: row.observedAt || observedAt || null,
    firstSeenAt: row.firstSeenAt || row.observedAt || observedAt || null,
  };
}

function timelineFromItems(items) {
  const days = new Map();
  for (const item of items) {
    const date = upAheadDateKey(item);
    if (!date) continue;
    if (!days.has(date)) days.set(date, { date, dayLabel: getDayLabel(date), items: [] });
    days.get(date).items.push(item);
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function sectionsFromItems(keys, items) {
  const sections = Object.fromEntries(keys.map(key => [key, []]));
  for (const item of mergeUpAheadItems(items)) {
    const category = categorySectionKey(item.category);
    (sections[category] ||= []).push(item);
  }
  return sections;
}

function normalizeUpAheadData(data) {
  if (!data || typeof data !== 'object') return null;
  const rawSnapshot = Array.isArray(data.items) && !data.timeline && !data.sections;
  if (rawSnapshot) {
    const { items, ...metadata } = data;
    const display = transformPythonItemsToDisplay(items);
    data = { ...display, lastUpdated: null, ...metadata };
  }
  const observedAt = data.fetchedAt || data.lastUpdated;
  const timeline = timelineFromItems(mergeUpAheadItems(
    (Array.isArray(data.timeline) ? data.timeline : []).flatMap(day => (
      (day?.items || []).map(item => prepareItem(item, observedAt, { date: day.date }))
    ))
  ));
  const sectionData = data.sections || {};
  const sections = sectionsFromItems(Object.keys(sectionData), Object.entries(sectionData).flatMap(([key, items]) =>
    (Array.isArray(items) ? items : []).map(item => prepareItem(item, observedAt, { category: key }))
  ));
  return { ...data, timeline, sections };
}

function pruneUpAheadData(data, retiredItems = new Map()) {
  if (!data) return null;
  const now = Date.now();
  const isActive = item => isUpAheadItemActive(item, now) && !upAheadIdentityKeys(item).some(key =>
    retiredItems.has(key) && retiredItems.get(key) >= upAheadTimeMs(item.observedAt)
  );
  const hasFeedRows = data.timeline.length > 0 || Object.values(data.sections).some(hasItems);
  const timeline = data.timeline
    .map(day => ({ ...day, items: day.items.filter(isActive) }))
    .filter(day => day.items.length > 0);
  const sections = Object.fromEntries(Object.entries(data.sections).map(([key, items]) => [
    key,
    items.filter(isActive),
  ]));
  const weekly_plan = !hasFeedRows && Array.isArray(data.weekly_plan)
    ? data.weekly_plan.map(day => ({
      ...day,
      items: filterPastDatedDisplayItems(day.items || [], now),
    }))
    : generateWeeklyPlan(timeline);
  if (!timeline.length && !Object.values(sections).some(hasItems) && !weekly_plan.some(day => hasItems(day.items))) {
    return null;
  }
  return { ...data, timeline, sections, weekly_plan };
}

export function sanitizeUpAheadData(data) {
  return pruneUpAheadData(normalizeUpAheadData(data));
}

function readStoredFeed() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY));
  } catch {
    return null;
  }
}

export function loadFromCache() {
  return sanitizeUpAheadData(readStoredFeed());
}

export function saveToCache(incoming, fallback = null) {
  // Read at commit time so concurrent loads merge with the latest saved list.
  const stored = readStoredFeed();
  const merged = mergeUpAheadFeed(stored || fallback, incoming);
  const now = Date.now();
  const cutoff = now - UP_AHEAD_SOURCE_LOOKBACK_MS;
  const retiredItems = new Map(Object.entries(stored?.retiredItems || {}).filter(([, time]) => time >= cutoff));
  // Keep only the identities of recent expired revisions. A late snapshot can
  // still add a different event, but cannot revive an older version of one.
  const items = [
    ...Object.values(merged?.sections || {}).flat(),
    ...(merged?.timeline || []).flatMap(day => day.items),
  ];
  for (const item of items) {
    const observed = upAheadTimeMs(item.observedAt);
    if (observed < cutoff || isUpAheadItemActive(item, now)) continue;
    for (const key of upAheadIdentityKeys(item)) {
      retiredItems.set(key, Math.max(observed, retiredItems.get(key) || 0));
    }
  }
  const updated = pruneUpAheadData(merged, retiredItems);
  try {
    if (updated || retiredItems.size) {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ...updated, retiredItems: Object.fromEntries(retiredItems) }));
    } else if (stored) {
      localStorage.removeItem(CACHE_KEY);
    }
  } catch {
    // The current request can still show the merged data.
  }
  if (typeof window !== 'undefined') window.dispatchEvent?.(new Event(UP_AHEAD_UPDATED_EVENT));
  return updated;
}

export function clearUpAheadCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore cache failures
  }
}

export async function fetchStaticUpAheadData(upAheadSettings = {}) {
  try {
    const baseUrl = import.meta.env.BASE_URL;
    const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const response = await fetch(`${cleanBase}data/up_ahead.json`, { cache: 'no-cache' });
    if (!response.ok) return null;
    const parsed = await response.json();
    const snapshot = { ...parsed, sourceMode: parsed?.sourceMode || 'snapshot' };
    if (sanitizeUpAheadData(snapshot) || !Array.isArray(snapshot.items)) return snapshot;

    const normalized = normalizeUpAheadData(snapshot);
    const fallback = buildFestivalFallbackData(
      upAheadSettings?.locations || DEFAULT_SETTINGS.upAhead.locations || ['Chennai', 'Muscat']
    );
    // Keep expired incoming rows long enough to supersede an older version of
    // the same occurrence. The merge drops them before anything is displayed.
    return {
      ...normalized,
      timeline: [...normalized.timeline, ...fallback.timeline],
      sections: {
        ...normalized.sections,
        festivals: [...(normalized.sections.festivals || []), ...fallback.sections.festivals],
      },
      auditSummary: fallback.auditSummary,
    };
  } catch {
    return null;
  }
}

function makeFestivalItem({ id, title, date, location, description }) {
  return {
    id: `festival-${id}-${date}-${location}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
    hiddenKey: `festival-${id}-${date}-${location}`,
    canonicalId: `festival-${id}-${date}-${location}`,
    title,
    link: '',
    description,
    date,
    releaseDate: date,
    planDate: date,
    category: 'festivals',
    type: 'festival',
    source: 'Festival calendar',
    locationCanonical: location,
    dateConfidence: 'calendar',
    plannerEligible: true,
    displayEligible: true,
  };
}

function getFestivalFallbackItems(locations = [], asOfDate = new Date()) {
  const selected = new Set((locations || []).map(location => String(location || '').toLowerCase()));
  const includeIndia = selected.size === 0 || selected.has('chennai') || selected.has('trichy') || selected.has('india');
  const includeOman = selected.size === 0 || selected.has('muscat') || selected.has('oman');
  const todayKey = normalizeDateKey(asOfDate);

  const indiaFestivals = [
    { id: 'muharram', title: 'Muharram', date: '2026-06-17', location: 'Chennai', description: 'Major public holiday observed in India.' },
    { id: 'independence-day', title: 'Independence Day', date: '2026-08-15', location: 'Chennai', description: 'National holiday in India.' },
    { id: 'onam', title: 'Onam', date: '2026-08-26', location: 'Chennai', description: 'Regional festival widely followed across South India.' },
    { id: 'ganesh-chaturthi', title: 'Ganesh Chaturthi', date: '2026-09-14', location: 'Chennai', description: 'Festival observance and local events expected.' },
    { id: 'gandhi-jayanti', title: 'Gandhi Jayanti', date: '2026-10-02', location: 'Chennai', description: 'National holiday in India.' },
    { id: 'diwali', title: 'Diwali', date: '2026-11-08', location: 'Chennai', description: 'Major festival and public-holiday period.' },
    { id: 'christmas', title: 'Christmas', date: '2026-12-25', location: 'Chennai', description: 'Public holiday and festival observance.' },
  ];

  const omanFestivals = [
    { id: 'islamic-new-year', title: 'Islamic New Year', date: '2026-06-17', location: 'Muscat', description: 'Expected holiday period; official dates may vary by moon sighting.' },
    { id: 'prophets-birthday', title: "Prophet's Birthday", date: '2026-08-25', location: 'Muscat', description: 'Expected holiday period; official dates may vary by moon sighting.' },
    { id: 'oman-national-day', title: 'Oman National Day', date: '2026-11-18', location: 'Muscat', description: 'National holiday in Oman.' },
  ];

  return [
    ...(includeIndia ? indiaFestivals : []),
    ...(includeOman ? omanFestivals : []),
  ]
    .filter(item => !todayKey || item.date >= todayKey)
    .map(makeFestivalItem)
    .slice(0, 12);
}

function buildFestivalFallbackData(locations, asOfDate = new Date()) {
  const festivals = getFestivalFallbackItems(locations, asOfDate);
  const timeline = festivals.map(item => ({
    date: item.date,
    dayLabel: getDayLabel(item.date),
    items: [{
      ...item,
      sourceId: item.id,
      tags: ['festivals'],
    }],
  }));

  return {
    timeline,
    sections: {
      festivals,
    },
    weekly_plan: generateWeeklyPlan(timeline),
    lastUpdated: new Date().toISOString(),
    auditSummary: { fallback: 'festival_calendar' },
    dropReport: [],
  };
}

function mergeUpAheadFeed(baseData, newData) {
  const base = normalizeUpAheadData(baseData);
  const incoming = normalizeUpAheadData(newData);
  if (!base || !incoming) return incoming || base;

  const sections = sectionsFromItems(
    [...new Set([...Object.keys(base.sections), ...Object.keys(incoming.sections)])],
    [...Object.values(base.sections).flat(), ...Object.values(incoming.sections).flat()]
  );
  const timeline = timelineFromItems(mergeUpAheadItems(
    [...base.timeline, ...incoming.timeline].flatMap(day => day.items)
  ));
  const freshest = upAheadTimeMs(incoming.fetchedAt || incoming.lastUpdated)
    >= upAheadTimeMs(base.fetchedAt || base.lastUpdated) ? incoming : base;
  return {
    ...base,
    ...incoming,
    timeline,
    sections,
    fetchedAt: freshest.fetchedAt || null,
    lastUpdated: freshest.lastUpdated || freshest.fetchedAt || null,
    auditSummary: incoming.auditSummary || base.auditSummary || null,
    dropReport: incoming.dropReport || base.dropReport || [],
    acquisitionSummary: incoming.acquisitionSummary || base.acquisitionSummary || null,
    sourceMode: incoming.sourceMode || base.sourceMode || null,
  };
}

export function mergeUpAheadData(baseData, newData) {
  return pruneUpAheadData(mergeUpAheadFeed(baseData, newData));
}

export async function fetchLiveUpAheadData(upAheadSettings = {}) {
  const asOfDate = new Date();
  const categories = Object.entries(upAheadSettings.categories || DEFAULT_SETTINGS.upAhead.categories)
    .filter(([, enabled]) => Boolean(enabled))
    .map(([key]) => key);
  const locations = Array.isArray(upAheadSettings.locations) && upAheadSettings.locations.length > 0
    ? upAheadSettings.locations
    : (DEFAULT_SETTINGS.upAhead.locations || ['Chennai', 'Muscat']);

  try {
    const result = await fetchIntelligentUpAheadData({
      categories,
      locations,
      plannerWindowDays: 7,
      asOfDate,
      mode: 'offline',
      settings: { upAhead: upAheadSettings }
    });

    // My Planner reads eligible suggestions from the rolling feed. Only + Plan
    // writes a suggestion into the user's saved agenda.
    const display = {
      ...buildLegacyDisplayFromRanked(result.rankedItems || [], {
        auditSummary: result.auditSummary,
        dropReport: result.dropReport
      }),
      acquisitionSummary: result.acquisitionSummary || null,
      lastUpdated: asOfDate.toISOString(),
      sourceMode: 'live',
    };

    if (!hasItems(display.sections?.festivals)) {
      const fallback = buildFestivalFallbackData(locations);
      if (!result.rankedItems?.length) {
        return {
          ...fallback,
          lastUpdated: null,
          acquisitionSummary: display.acquisitionSummary,
          sourceMode: 'snapshot',
        };
      }
      return mergeUpAheadData(
        { ...fallback, lastUpdated: null },
        display
      );
    }

    return display;
  } catch (error) {
    console.error('[UpAheadService] Intelligent fetch failed', error);
    return {
      timeline: [],
      sections: {
        movies: [],
        festivals: [],
        alerts: [],
        events: [],
        sports: [],
        shopping: [],
        civic: [],
        weather_alerts: [],
        airlines: []
      },
      weekly_plan: generateWeeklyPlan([]),
      lastUpdated: new Date().toISOString(),
      auditSummary: { total: 0, dropped: 0, error: error?.message || 'unknown' },
      dropReport: [],
      acquisitionSummary: {
        status: 'failed',
        attemptedSources: 0,
        successfulSources: 0,
        failedSources: 0,
        returnedItems: 0,
        unseenItems: 0,
        byCategory: {},
        error: error?.message || 'unknown',
      },
      sourceMode: 'failed',
    };
  }
}

export const __upAheadServiceInternalsForTest = {
  isStaticUpAheadFresh: isUpAheadDataFresh,
  filterPastDatedDisplayItems,
  getFestivalFallbackItems,
};
