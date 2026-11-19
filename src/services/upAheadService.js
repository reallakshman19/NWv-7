import { DEFAULT_SETTINGS } from '../utils/storage.js';
import plannerStorage from '../utils/plannerStorage.js';
import { fetchIntelligentUpAheadData } from './intelligentUpAheadFetcher.js';
import { toDateKey } from '../utils/dateDisplay.js';
import { getHolidayCalendarItems, isBundledHoliday } from './holidayCalendar.js';
import {
  isUpAheadItemActive,
  getUpAheadWindowStatus,
  mergeUpAheadItems,
  UP_AHEAD_SOURCE_LOOKBACK_MS,
  upAheadDateKey,
  upAheadIdentityKeys, sameUpAheadOccurrence, upAheadOccurrenceKey,
  upAheadTimeMs,
  upAheadExpiryMs,
  upAheadEventBounds,
} from './upAheadLifecycle.js';

export const CACHE_KEY = 'upAhead_cache';
const MAX_PENDING_ITEMS = 500;
const MAX_PENDING_BYTES = 1_000_000;
const FUTURE_ADMISSION_MS = 180 * 86_400_000;
const MAX_QUARANTINE_ITEMS = 100;
const MAX_QUARANTINE_BYTES = 256_000;
export const UP_AHEAD_UPDATED_EVENT = 'upahead-updated';
let currentRequest = null;
let requestSerial = 0;
export function beginUpAheadRequest(settings) {
  const locations = [...(settings?.locations || DEFAULT_SETTINGS.upAhead.locations || ['Chennai','Muscat'])];
  const scope = JSON.stringify([locations.map(x=>String(x).toLowerCase().trim()).sort(), Object.entries(settings?.categories || {}).sort()]);
  const request = { id: currentRequest?.scope === scope ? currentRequest.id : ++requestSerial, locations, scope };
  currentRequest = request;
  return request;
}
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
    const key = item?.savedPlanId || upAheadOccurrenceKey(item);
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
  if (data.sourceMode === 'dataset-api' && data.datasetApiFreshness !== 'fresh') return false;
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
      .filter(item => !blacklist.has(upAheadOccurrenceKey(item)) && (!blacklist.has(getItemKey(item)) || timeline.flatMap(day=>day.items||[]).filter(row=>getItemKey(row)===getItemKey(item)).some(row=>!sameUpAheadOccurrence(row,item))))
      .filter(item => item.plannerEligible !== false)
      .map(item => ({
        id: item.id || getItemKey(item),
        hiddenKey: getItemKey(item),
        occurrenceKey: upAheadOccurrenceKey(item),
        title: item.title,
        type: item.type || getItemType(item.category),
        icon: item.icon || '📅',
        link: item.link,
        description: item.description,
        isOffer: item.type === 'shopping' || item.type === 'airline'
      }));

    const savedItems = (persistedPlan[dateKey] || [])
      .map(item => ({
        id: item.id || getItemKey(item),
        hiddenKey: getItemKey(item),
        savedPlanId: item.savedPlanId || item.id,
        occurrenceKey: item.occurrenceKey,
        title: item.title,
        type: item.type || item.category || 'event',
        icon: item.icon || '📅',
        link: item.link,
        description: item.description,
        isOffer: Boolean(item.isOffer) || ['shopping', 'airline', 'airlines'].includes(String(item.type || item.category || '').toLowerCase())
      }));

    const merged = [...savedItems, ...uniqByKey(timelineItems).filter(item=>!savedItems.some(saved=>saved.occurrenceKey && saved.occurrenceKey===item.occurrenceKey)).slice(0, Math.max(0,10-savedItems.length))];

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
      sourceMode: item.sourceMode || null,
      retailerId: item.retailerId || null,
      offerMarket: item.offerMarket || null,
      offerChannel: item.offerChannel || null,
      acquisitionLocation: item.acquisitionLocation || null,
      sourceUrl: item.sourceUrl || null,
      sourceAuthority: item.sourceAuthority || null,
      affectedLocations: item.affectedLocations || null,
      affectedScope: item.affectedScope || null,
      city: item.city || null,
      region: item.region || null,
      locationCanonical: item.locationCanonical || item.city || item.region || null,
      dateConfidence: item.dateConfidence || 'none',
      decisionTrace: item.decisionTrace || [],
      plannerEligible: Boolean(item.plannerEligible && eventDateKey),
      displayEligible: item.displayEligible !== false,
      publishedAt: item.publishedAt || item.publishDate || null,
      observedAt: item.observedAt || null,
      firstSeenAt: item.firstSeenAt || null,
      venue: item.venue || item.originalItem?.venue || null,
      datePrecision: item.datePrecision || null,
      eventEndPrecision: item.eventEndPrecision || null,
      eventStartAt: item.eventStartAt || item.originalItem?.eventStartAt || null,
      eventEndAt: item.eventEndAt || item.originalItem?.eventEndAt || null,
      eventDateEndKey: item.eventDateEndKey || null,
      eventDateEndExclusiveKey: item.eventDateEndExclusiveKey || null,
      occurrenceId: item.occurrenceId || null,
      sessionId: item.sessionId || null,
      revisionOf: item.revisionOf || null,
      revisionAt: item.revisionAt || null,
      publicationOnlyId: Boolean(item.publicationOnlyId),
      dateSource: item.dateSource || null,
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
      items: mergeUpAheadItems(day.items, { preferEventCategory: true })
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
      const eventDateKey = upAheadDateKey({ ...it, publicationOnlyId: true });
      return {
        canonicalId:       it.id || it.url || it.title,
        rawSourceId:       it.id || it.url || it.title,
        title:             it.title,
        summary:           it.summary,
        description:       it.summary,
        link:              it.url || it.link,
        category,
        publishedAt:       it.publishedAt || null,
        datePrecision:     it.datePrecision || null,
        eventEndPrecision: it.eventEndPrecision || null,
        posterUrl:         it.posterUrl || null,
        eventStartAt:      it.eventStartAt || null,
        eventEndAt:        it.eventEndAt || null,
        eventDateEndKey:   it.eventDateEndKey || null,
        eventDateEndExclusiveKey: it.eventDateEndExclusiveKey || null,
        occurrenceId:     it.occurrenceId || null,
        sessionId:        it.sessionId || null,
        revisionOf:       it.revisionOf || null,
        revisionAt:       it.revisionAt || null,
        publicationOnlyId: true,
        dateSource:       it.dateSource || null,
        observedAt:       it.observedAt || null,
        firstSeenAt:      it.firstSeenAt || null,
        venue:            it.venue || null,
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
        sourceMode:        it.sourceMode || null,
        retailerId:        it.retailerId || null,
        offerMarket:       it.offerMarket || null,
        offerChannel:      it.offerChannel || null,
        acquisitionLocation: it.acquisitionLocation || null,
        sourceUrl:         it.sourceUrl || null,
        sourceAuthority:   it.sourceAuthority || null,
        affectedLocations: it.affectedLocations || null,
        affectedScope:     it.affectedScope || null,
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
    sourceMode: row.sourceMode || fallback.sourceMode || 'unknown',
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
  for (const item of items) {
    const category = categorySectionKey(item.category);
    (sections[category] ||= []).push(item);
  }
  return Object.fromEntries(Object.entries(sections).map(([key, rows]) => [key, mergeUpAheadItems(rows)]));
}

function normalizeUpAheadData(data) {
  if (!data || typeof data !== 'object') return null;
  const rawSnapshot = Array.isArray(data.items) && !data.timeline && !data.sections;
  if (rawSnapshot) {
    const { items, pendingItems = [], ...metadata } = data;
    const display = transformPythonItemsToDisplay([...items, ...pendingItems]);
    data = { ...display, lastUpdated: null, sourceMode: 'snapshot', ...metadata };
  }
  const observedAt = data.fetchedAt || data.lastUpdated;
  const sourceMode = ['snapshot', 'static', 'dataset-api', 'calendar'].includes(data.sourceMode)
    ? 'snapshot' : data.sourceMode || 'unknown';
  const timelineRows = (Array.isArray(data.timeline) ? data.timeline : []).flatMap(day =>
    (day?.items || []).map(item => prepareItem(item, observedAt, { date: day.date, sourceMode })).filter(Boolean));
  const sectionData = data.sections || {};
  const sectionRows = Object.entries(sectionData).flatMap(([key, items]) =>
    (Array.isArray(items) ? items : []).map(item => prepareItem(item, observedAt, { category: key, sourceMode })).filter(Boolean));
  sectionRows.push(...(Array.isArray(data.pendingItems) ? data.pendingItems : [])
    .map(item => prepareItem(item, observedAt, { sourceMode })).filter(Boolean));
  // Sections are the authoritative observation in the legacy payload; Timeline
  // is a derived routing projection. Preserve timeline-only rows, but never let
  // a stale projection of the same occurrence override the source row.
  const rows = sectionRows.map(item => ({ ...item, _timelineEligible: item._timelineEligible || timelineRows.some(t => categorySectionKey(t.category) === categorySectionKey(item.category) && sameUpAheadOccurrence(t,item)) }));
  for (const item of timelineRows) {
    if (!rows.some(r => categorySectionKey(r.category) === categorySectionKey(item.category) && sameUpAheadOccurrence(r,item))) rows.push({ ...item, _timelineEligible: true });
  }
  const sections = sectionsFromItems(Object.keys(sectionData), rows);
  const timeline = timelineFromItems(mergeUpAheadItems(Object.values(sections).flat().filter(x => x._timelineEligible || x.upAheadEligible), { preferEventCategory: true }));
  return { ...data, pendingItems: [], timeline, sections };
}

function publishedRetirements(data, now = Date.now()) {
  const rows = Array.isArray(data?.retiredOccurrences) ? data.retiredOccurrences.slice(0, 4000) : [];
  return rows.filter(row => row && row.source === 'oman-warnings' && row.category === 'weather_alerts'
    && String(row.occurrenceId || '').startsWith('oman-warnings:')
    && upAheadTimeMs(row.observedAt) > 0 && now >= upAheadTimeMs(row.observedAt)
    && now - upAheadTimeMs(row.observedAt) <= UP_AHEAD_SOURCE_LOOKBACK_MS);
}

function publishedRevisionRetirements(data, now = Date.now()) {
  const unique = new Map();
  for (const row of (Array.isArray(data?.retiredRevisions) ? data.retiredRevisions : [])) {
    if (!Array.isArray(row?.identity) || row.identity.length !== 2
      || !row.identity.every(value => typeof value === 'string' && value.length > 0)) continue;
    const retiredAt = upAheadTimeMs(row.retiredAt), revisionAt = upAheadTimeMs(row.revisionAt);
    if (!retiredAt || !revisionAt || retiredAt > now || retiredAt <= now - UP_AHEAD_SOURCE_LOOKBACK_MS) continue;
    const key = JSON.stringify(row.identity), previous = unique.get(key);
    if (!previous || revisionAt > previous.revisionAt) unique.set(key, { ...row, retiredAt, revisionAt });
  }
  return [...unique.values()].sort((a, b) => b.retiredAt - a.retiredAt).slice(0, 2000);
}

function pruneUpAheadData(data, retiredItems = new Map()) {
  if (!data) return null;
  const now = Date.now();
  const retired = publishedRetirements(data, now);
  const retiredOccurrences = new Set(retired.map(row => row.occurrenceId));
  const publishedRevisions = publishedRevisionRetirements(data, now);
  const isActive = item => !publishedRevisions.some(row => row.identity[0] === item.category
    && [item.revisionOf, item.occurrenceId, item.id, item.canonicalId].includes(row.identity[1])
    && row.revisionAt >= upAheadTimeMs(item.revisionAt || item.updatedAt || item.observedAt || item.publishedAt))
    && !retiredOccurrences.has(item.occurrenceId) && isUpAheadItemActive(item, now) && !upAheadIdentityKeys(item).some(key =>
    [key, `${item.category}:${key}`].some(retiredKey =>
      retiredItems.has(retiredKey) && retiredItems.get(retiredKey).revisionAt >= upAheadTimeMs(item.revisionAt || item.updatedAt || item.observedAt))
  );
  const quarantine = new Map();
  for (const row of (Array.isArray(data.quarantinedItems) ? data.quarantinedItems : [])) {
    const captured = upAheadTimeMs(row?.quarantinedAt);
    if (!row?.item || row.reason !== 'missing_clock' || !captured || captured > now || captured <= now - UP_AHEAD_SOURCE_LOOKBACK_MS) continue;
    const key = upAheadOccurrenceKey(row.item), previous = quarantine.get(key);
    if (!previous || captured < previous.quarantinedAt) quarantine.set(key, { ...row, quarantinedAt: captured });
  }
  const allRows = Object.values(data.sections).flat();
  for (const item of allRows) {
    if (upAheadExpiryMs(item) === 0 && !item.suppressionReason && item.displayEligible !== false) {
      const key = upAheadOccurrenceKey(item);
      if (!quarantine.has(key)) quarantine.set(key, { item, reason: 'missing_clock', quarantinedAt: now });
    }
  }
  let quarantineBytes = 0;
  const quarantinedItems = [...quarantine.values()].slice(0, MAX_QUARANTINE_ITEMS).filter(row => {
    quarantineBytes += new TextEncoder().encode(JSON.stringify(row)).length;
    return quarantineBytes <= MAX_QUARANTINE_BYTES;
  });
  const withinView = item => isBundledHoliday(item)
    || getUpAheadWindowStatus(item, { asOfDate: now }) !== 'after_window';
  let pendingBytes = 0;
  const futureRows = mergeUpAheadItems(allRows.filter(item => isActive(item) && !withinView(item)));
  const pendingItems = futureRows
    .filter(item => upAheadEventBounds(item).start <= now + FUTURE_ADMISSION_MS)
    .slice(0, MAX_PENDING_ITEMS).filter(item => {
      pendingBytes += new TextEncoder().encode(JSON.stringify(item)).length;
      return pendingBytes <= MAX_PENDING_BYTES;
    });
  const isVisible = item => isActive(item) && withinView(item);
  const hasFeedRows = data.timeline.length > 0 || Object.values(data.sections).some(hasItems);
  const timeline = data.timeline
    .map(day => ({ ...day, items: day.items.filter(isVisible) }))
    .filter(day => day.items.length > 0);
  const sections = Object.fromEntries(Object.entries(data.sections).map(([key, items]) => [
    key,
    items.filter(isVisible),
  ]));
  const weekly_plan = !hasFeedRows && Array.isArray(data.weekly_plan)
    ? data.weekly_plan.map(day => ({
      ...day,
      items: filterPastDatedDisplayItems(day.items || [], now),
    }))
    : generateWeeklyPlan(timeline);
  if (!timeline.length && !Object.values(sections).some(hasItems) && !weekly_plan.some(day => hasItems(day.items)) && !pendingItems.length && !quarantinedItems.length) {
    return null;
  }
  return { ...data, retiredOccurrences: retired, retiredRevisions: publishedRevisions,
    timeline, sections, weekly_plan, pendingItems, quarantinedItems,
    cacheRetention: { pendingCount: pendingItems.length, rejectedFutureCount: futureRows.length - pendingItems.length,
      futureAdmissionDays: 180, maxPendingItems: MAX_PENDING_ITEMS, maxPendingBytes: MAX_PENDING_BYTES, historyDays: 7 } };
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

export function loadFromCache(upAheadSettings = null) {
  const stored = readStoredFeed();
  // One atomic cache write also preserves the recovery quarantine and revision
  // tombstones. No user Planner or recovery-archive key is changed here.
  const cached = maintainCache(stored, normalizeUpAheadData(stored));
  if (!upAheadSettings) return cached;
  const locations = upAheadSettings.locations || DEFAULT_SETTINGS.upAhead.locations || ['Chennai', 'Muscat'];
  const selected = sanitizeUpAheadData(attachHolidayCalendar(
    cached || buildFestivalFallbackData(locations), locations
  ));
  return selected ? { ...selected, selectedLocations: [...locations] } : selected;
}

export function saveToCache(incoming, fallback = null, upAheadSettings = null, request = null) {
  // Read at commit time so concurrent loads merge with the latest saved list.
  const stored = readStoredFeed();
  const combined = mergeUpAheadFeed(stored || fallback, incoming);
  if (request && currentRequest && request.id !== currentRequest.id) {
    // A superseded request may render its own result, but cannot commit or
    // publish a stale cache event. The current request owns persistence.
    return pruneUpAheadData(attachHolidayCalendar(combined, request.locations));
  }
  const selectedLocations = request?.locations || fallback?.selectedLocations || stored?.selectedLocations || upAheadSettings?.locations;
  // A fresh dataset API can skip static/live acquisition. Reconcile the
  // independent calendar after every merge, including location changes.
  const merged = selectedLocations ? attachHolidayCalendar(combined, selectedLocations) : combined;
  const updated = maintainCache(stored, merged, selectedLocations);
  if (typeof window !== 'undefined') window.dispatchEvent?.(new Event(UP_AHEAD_UPDATED_EVENT));
  return updated;
}

function maintainCache(stored, merged, selectedLocations = stored?.selectedLocations) {
  const now = Date.now();
  const cutoff = now - UP_AHEAD_SOURCE_LOOKBACK_MS;
  const retiredItems = new Map(Object.entries(stored?.retiredItems || {})
    .map(([key, value]) => [key, typeof value === 'number' ? { revisionAt: value, retiredAt: value } : value])
    .filter(([, value]) => value && value.retiredAt > cutoff && value.retiredAt <= now && Number.isFinite(value.revisionAt)));
  // Keep only the identities of recent expired revisions. A late snapshot can
  // still add a different event, but cannot revive an older version of one.
  const items = [
    ...Object.values(merged?.sections || {}).flat(),
    ...(merged?.timeline || []).flatMap(day => day.items),
  ];
  for (const item of items) {
    const observed = upAheadTimeMs(item.revisionAt || item.updatedAt || item.observedAt);
    if (!observed || isUpAheadItemActive(item, now) || !upAheadExpiryMs(item)) continue;
    for (const key of upAheadIdentityKeys(item)) {
      const retiredKey = `${item.category}:${key}`;
      const previous = retiredItems.get(retiredKey);
      if (!previous || observed > previous.revisionAt) retiredItems.set(retiredKey, { revisionAt: observed, retiredAt: now });
    }
  }
  const updated = pruneUpAheadData(merged, retiredItems);
  const retirements = publishedRetirements(merged, now);
  const retiredRevisions = publishedRevisionRetirements(merged, now);
  try {
    // A storage read racing this maintenance must not be overwritten.
    if (JSON.stringify(readStoredFeed()) !== JSON.stringify(stored)) return updated;
    if (updated || retiredItems.size || retirements.length || retiredRevisions.length) {
      const value = JSON.stringify({ ...updated, retiredOccurrences: retirements, selectedLocations,
        retiredRevisions,
        retiredItems: Object.fromEntries([...retiredItems].sort((a, b) => b[1].retiredAt - a[1].retiredAt).slice(0, 4000)) });
      if (JSON.stringify(stored) !== value) localStorage.setItem(CACHE_KEY, value);
    } else if (stored) {
      localStorage.removeItem(CACHE_KEY);
    }
  } catch {
    // The current request can still show the merged data.
  }
  return updated;
}

export function clearUpAheadCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore cache failures
  }
}

function getUpAheadSnapshotUrls() {
  const baseUrl = import.meta.env.BASE_URL || '/';
  const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const deployed = `${cleanBase}data/up_ahead.json`;
  const location = globalThis.window?.location;
  return location?.origin === 'https://reallakshman19.github.io'
    && (location.pathname === '/NWv-7' || location.pathname.startsWith('/NWv-7/'))
    ? ['https://raw.githubusercontent.com/reallakshman19/NWv-7/main/public/data/up_ahead.json', deployed]
    : [deployed];
}

export async function fetchStaticUpAheadData(upAheadSettings = {}) {
  let snapshot = null;
  const failures = [];
  for (const url of getUpAheadSnapshotUrls()) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      // No custom cross-origin headers: they require a rejected CORS preflight.
      const response = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-cache', signal: controller.signal });
      if (!response.ok) throw new Error(`Snapshot HTTP ${response.status}`);
      const parsed = await response.json();
      if (!parsed || typeof parsed !== 'object' || (!Array.isArray(parsed.items) && !parsed.sections)) {
        throw new Error('Unsupported Up Ahead snapshot');
      }
      const candidate = { ...parsed, sourceMode: parsed.sourceMode || 'snapshot', snapshotUrl: url };
      if (!snapshot || upAheadTimeMs(candidate.fetchedAt) > upAheadTimeMs(snapshot.fetchedAt)) snapshot = candidate;
      if (isUpAheadDataFresh(candidate) && sanitizeUpAheadData(candidate)) break;
    } catch (error) {
      failures.push(error?.message || String(error));
    } finally {
      clearTimeout(timer);
    }
  }
  const locations = upAheadSettings?.locations || DEFAULT_SETTINGS.upAhead.locations || ['Chennai', 'Muscat'];
  if (!snapshot) {
    const fallback = buildFestivalFallbackData(locations);
    return {
      ...fallback,
      auditSummary: { ...fallback.auditSummary, error: failures.join('; ') || 'Up Ahead snapshot unavailable' },
      acquisitionSummary: { status: 'failed', error: failures.join('; ') || 'Up Ahead snapshot unavailable' },
    };
  }
  // The one-time calendar is independent of RSS coverage and feed freshness.
  // Fresh news must not remove holidays; old bundled rows are replaced on read.
  return attachHolidayCalendar(snapshot, locations);
}

function getFestivalFallbackItems(locations = [], asOfDate = new Date()) {
  return getHolidayCalendarItems(locations, asOfDate);
}

function attachHolidayCalendar(data, locations, asOfDate = new Date()) {
  const normalized = normalizeUpAheadData(data) || { timeline: [], sections: {} };
  const keepFeedRows = rows => rows.filter(item => !isBundledHoliday(item) && !isCalendarFallbackItem(item));
  const festivals = getHolidayCalendarItems(locations, asOfDate);
  const timeline = timelineFromItems(mergeUpAheadItems([
    ...keepFeedRows(normalized.timeline.flatMap(day => day.items)), ...festivals,
  ], { preferEventCategory: true }));
  const sections = Object.fromEntries(Object.entries(normalized.sections).map(([key, rows]) => [key, keepFeedRows(rows)]));
  sections.festivals = mergeUpAheadItems([...(sections.festivals || []), ...festivals]);
  return { ...normalized, timeline, sections, weekly_plan: generateWeeklyPlan(timeline) };
}

function buildFestivalFallbackData(locations, asOfDate = new Date()) {
  return attachHolidayCalendar({
    timeline: [], sections: {}, lastUpdated: null,
    auditSummary: { fallback: 'festival_calendar' }, dropReport: [], sourceMode: 'calendar',
  }, locations, asOfDate);
}

function isCalendarFallbackItem(item) {
  return item?.source === 'Festival calendar' || item?.calendarFallback === true;
}

function hasPublisherContent(data) {
  if (data?.auditSummary?.fallback === 'festival_calendar' || data?.auditSummary?.error
    || data?.sourceMode === 'failed' || data?.acquisitionSummary?.status === 'failed') return false;
  return [...Object.values(data?.sections || {}).flat(), ...(data?.timeline || []).flatMap(day => day.items)]
    .some(item => !isCalendarFallbackItem(item) && !isBundledHoliday(item));
}

function mergeUpAheadFeed(baseData, newData) {
  const base = normalizeUpAheadData(baseData);
  const incoming = normalizeUpAheadData(newData);
  if (!base || !incoming) return incoming || base;

  const basePublished = hasPublisherContent(base);
  const incomingPublished = hasPublisherContent(incoming);
  const baseEpoch = upAheadTimeMs(base.fetchedAt || base.lastUpdated);
  const incomingEpoch = upAheadTimeMs(incoming.fetchedAt || incoming.lastUpdated);
  const sameApiEpoch = base.sourceMode === 'dataset-api' && incoming.sourceMode === 'dataset-api'
    && baseEpoch === incomingEpoch;
  const baseFresh = isUpAheadDataFresh(base);
  const incomingFresh = isUpAheadDataFresh(incoming);
  const freshest = basePublished !== incomingPublished
    ? (incomingPublished ? incoming : base)
    : !sameApiEpoch && baseFresh !== incomingFresh
      ? (incomingFresh ? incoming : base)
      : incomingEpoch >= baseEpoch ? incoming : base;
  // Legacy calendar estimates only support a publisher outage. The new
  // source-backed bundled calendar is independent and survives recovery.
  const retainPublished = items => hasPublisherContent(freshest)
    ? items.filter(item => !isCalendarFallbackItem(item)) : items;

  const sections = sectionsFromItems(
    [...new Set([...Object.keys(base.sections), ...Object.keys(incoming.sections)])],
    retainPublished([...Object.values(base.sections).flat(), ...Object.values(incoming.sections).flat()])
  );
  const timeline = timelineFromItems(mergeUpAheadItems(Object.values(sections).flat().filter(x => x._timelineEligible || x.upAheadEligible), { preferEventCategory: true }));
  return {
    ...base,
    ...incoming,
    timeline,
    sections,
    fetchedAt: freshest.fetchedAt || null,
    lastUpdated: freshest.lastUpdated || freshest.fetchedAt || null,
    auditSummary: freshest.auditSummary || null,
    dropReport: incoming.dropReport || base.dropReport || [],
    acquisitionSummary: freshest.acquisitionSummary || null,
    quarantinedItems: [...(base.quarantinedItems || []), ...(incoming.quarantinedItems || [])],
    retiredRevisions: [...(base.retiredRevisions || []), ...(incoming.retiredRevisions || [])],
    retiredOccurrences: [...new Map([...publishedRetirements(base), ...publishedRetirements(incoming)]
      .sort((a, b) => upAheadTimeMs(a.observedAt) - upAheadTimeMs(b.observedAt))
      .map(row => [row.occurrenceId, row])).values()],
    sourceStatuses: Object.fromEntries([...new Set([
      ...Object.keys(base.sourceStatuses || {}), ...Object.keys(incoming.sourceStatuses || {}),
    ])].map(key => [key, [base.sourceStatuses?.[key], incoming.sourceStatuses?.[key]].filter(Boolean)
      .sort((a, b) => upAheadTimeMs(b.checkedAt) - upAheadTimeMs(a.checkedAt))[0]])),
    sourceMode: freshest.sourceMode || null,
    datasetApiFreshness: freshest.datasetApiFreshness || null,
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
    const hasPublication = Array.isArray(result.rankedItems) && result.rankedItems.length > 0;
    const failed = result.acquisitionSummary?.status === 'failed'
      || (Number(result.acquisitionSummary?.attemptedSources) > 0
        && Number(result.acquisitionSummary?.successfulSources) === 0);
    const display = {
      ...buildLegacyDisplayFromRanked(result.rankedItems || [], {
        auditSummary: result.auditSummary,
        dropReport: result.dropReport
      }),
      acquisitionSummary: result.acquisitionSummary || null,
      lastUpdated: hasPublication && !failed ? asOfDate.toISOString() : null,
      sourceMode: failed ? 'failed' : hasPublication ? 'live' : 'calendar',
      ...(!hasPublication && { auditSummary: {
        ...result.auditSummary, fallback: 'festival_calendar',
        ...(failed && { error: 'No Up Ahead source returned a qualified publication.' }),
      } }),
    };

    return attachHolidayCalendar(display, locations, asOfDate);
  } catch (error) {
    console.error('[UpAheadService] Intelligent fetch failed', error);
    return attachHolidayCalendar({
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
      lastUpdated: null,
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
    }, locations, asOfDate);
  }
}

export const __upAheadServiceInternalsForTest = {
  isStaticUpAheadFresh: isUpAheadDataFresh,
  filterPastDatedDisplayItems,
  getFestivalFallbackItems,
  getUpAheadSnapshotUrls,
};
