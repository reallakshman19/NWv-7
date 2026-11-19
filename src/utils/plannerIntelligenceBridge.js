import { analyzeDateText, classifyPlannerWindow } from '../intelligence/dateAware.js';
import { annotateItemLocation } from '../intelligence/locationAware.js';
import { upAheadOccurrenceKey, upAheadDateKey, upAheadPlannerDayKey } from '../services/upAheadLifecycle.js';
import { toLocalDateKey } from './dateKey.js';

function formatDateKey(input) {
  // Local-calendar key; the previous setHours+toISOString combo emitted the
  // prior UTC day for IST, desyncing bridge keys from dateAware's local keys.
  return toLocalDateKey(input);
}

export function enrichCanonicalItemForPlanner(item, options = {}) {
  const fullText = [item?.title, item?.description, item?.summary, item?.originalText].filter(Boolean).join(' • ');
  const publishDate = item?.pubDate || item?.publishDate || null;

  const locationAnnotated = annotateItemLocation(
    {
      ...item,
      category: item?.category,
      mode: options.mode || item?.mode || 'offline'
    },
    {
      mode: options.mode || item?.mode || 'offline',
      selectedCities: options.selectedCities,
      locationLibrary: options.locationLibrary,
      allowOnlineBypass: options.allowOnlineBypass !== false,
      category: item?.category
    }
  );
  const dateAnalysis = analyzeDateText(fullText, {
    asOfDate: options.asOfDate,
    publishDate,
    locationCanonical: locationAnnotated.locationCanonical,
    requirePublicationAnchor: true,
    plannerWindowDays: options.plannerWindowDays || 7
  });

  const windowing = classifyPlannerWindow({
    ...dateAnalysis,
    locationCanonical: locationAnnotated.locationCanonical,
  }, {
    asOfDate: options.asOfDate,
    plannerWindowDays: options.plannerWindowDays || 7
  });

  return {
    ...locationAnnotated,
    eventDate: dateAnalysis.eventDate,
    eventDateEnd: dateAnalysis.eventDateEnd,
    eventDateKey: dateAnalysis.eventDateKey,
    eventDateEndKey: dateAnalysis.eventDateEndKey,
    eventDateEndExclusiveKey: dateAnalysis.eventDateEndExclusiveKey,
    dateConfidence: dateAnalysis.dateConfidence,
    temporalType: dateAnalysis.temporalType,
    matchedDateKeys: dateAnalysis.matchedDateKeys,
    routeHint: dateAnalysis.routeHint,
    decisionTrace: [
      ...(item?.decisionTrace || []),
      ...(dateAnalysis.decisionTrace || []),
      ...(locationAnnotated.locationDecisionTrace || [])
    ],
    plannerEligible: Boolean(windowing.plannerEligible && locationAnnotated.locationEligible),
    upAheadEligible: Boolean(windowing.upAheadEligible && locationAnnotated.locationEligible),
    windowStatus: windowing.windowStatus,
    dropReason: item?.dropReason || dateAnalysis.dropReason || locationAnnotated.dropReason,
    planDate: dateAnalysis.eventDateKey || formatDateKey(item?.date) || null
  };
}

export function buildPlannerMergePayload(item) {
  if (!item) return null;
  const eventDateKey = Object.hasOwn(item,'eventDateKey') ? item.eventDateKey : upAheadDateKey(item);
  if (!eventDateKey && !item.planDate) return null;

  return {
    ...item,
    occurrenceKey: upAheadOccurrenceKey(item),
    hiddenKey: item.hiddenKey || item.canonicalId || item.id,
    canonicalId: item.canonicalId || item.hiddenKey || item.id,
    id: item.id || item.canonicalId || item.hiddenKey,
    title: item.title,
    category: item.category,
    type: item.type || item.category || 'event',
    link: item.link,
    description: item.description,
    eventDate: item.eventDate || eventDateKey,
    planDate: item.planDate || eventDateKey,
    eventDateKey,
    ...(item.eventDateEndKey && { eventDateEndKey: item.eventDateEndKey }),
    ...(item.eventDateEndExclusiveKey && { eventDateEndExclusiveKey: item.eventDateEndExclusiveKey }),
    ...(item.eventStartAt && { eventStartAt: item.eventStartAt }),
    ...(item.eventEndAt && { eventEndAt: item.eventEndAt }),
    ...(item.datePrecision && { datePrecision: item.datePrecision }),
    dateConfidence: item.dateConfidence || 'inferred',
    locationCanonical: item.locationCanonical || null,
    isOffer: Boolean(item.isOffer),
    icon: item.icon,
    decisionTrace: item.decisionTrace || []
  };
}

// Shared explicit-save adapter for the routed +Plan action. A planned action
// date does not change the advertised occurrence, including undated cards.
export function buildExplicitPlannerSave(item, dateStr, now = Date.now()) {
  if (!item) return null;
  const eventDateKey = Object.hasOwn(item, 'eventDateKey') && item.eventDateKey === null ? null : upAheadDateKey(item);
  const plannerDay = eventDateKey ? upAheadPlannerDayKey(item, now) : null;
  const planDate = plannerDay && plannerDay !== eventDateKey ? plannerDay
    : item.planDate || toLocalDateKey(dateStr) || eventDateKey || toLocalDateKey(now);
  return buildPlannerMergePayload({ ...item, eventDateKey, planDate,
    category: item.category || item.tags?.[0] || 'event' });
}
