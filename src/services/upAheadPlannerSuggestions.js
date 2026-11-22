import { addCalendarDays } from '../utils/dateKey.js';
import { buildPlannerMergePayload } from '../utils/plannerIntelligenceBridge.js';
import {
  isUpAheadItemActive, mergeUpAheadItems, upAheadDateKey,
  upAheadEventDayKey, upAheadPlannerDayKey, upAheadOccurrenceKey, sameUpAheadOccurrence, sameUpAheadDisplayOccurrence,
} from './upAheadLifecycle.js';
import { isActualOfferText } from './upAheadService.js';
import { classifyRetailOffer, isLocalHoliday, matchesLocalAlert, isActionableCivicNotice, isActionableLocalAlert } from './upAheadLocalPolicy.js';
import { groupReviewOnlyEventListings } from './upAheadReviewGrouping.js';
import { matchesUpAheadLocation } from './upAheadLocation.js';

export function getUpAheadPlannerSuggestions(data, savedPlan, blacklist, settings, now = Date.now()) {
  const locations = (settings?.locations || ['Chennai', 'Muscat']).map(location => String(location).toLowerCase().trim());
  const saved = Object.entries(savedPlan || {}).flatMap(([date, items]) => (items || []).map(item => ({ ...item, date: upAheadDateKey(item) || date })));
  const candidates = (data?.timeline || []).flatMap(day => day.items || []);
  // Ambiguous source-review groups must never auto-select a physical session
  // or emit multiple duplicate Planner suggestions. Events/Suggested still
  // expose every original listing for the user to choose independently.
  const reviewGroups = groupReviewOnlyEventListings(candidates)
    .filter(item => item.reviewGroupStatus === 'POSSIBLE_DUPLICATE_UNCONFIRMED');
  const needsSourceChoice = new Set(reviewGroups.flatMap(item =>
    item.reviewAlternateListings.map(source => source.id)));
  const eligibleCandidates = candidates.filter(item => !needsSourceChoice.has(item.id));
  return mergeUpAheadItems(eligibleCandidates, { preferEventCategory: true }).flatMap(item => {
    const date = upAheadDateKey(item);
    const today = upAheadEventDayKey(now, item);
    const lastDay = addCalendarDays(today, 6);
    const planDate = upAheadPlannerDayKey(item, now);
    const key = upAheadOccurrenceKey(item);
    // A bare legacy publisher ID can belong to several distinct occurrences.
    const matchedLegacy = [item.id, item.hiddenKey, item.canonicalId].filter(id => blacklist?.has(id));
    const unambiguousLegacy = matchedLegacy.length > 0 && candidates
      .filter(row => [row.id, row.hiddenKey, row.canonicalId].some(id => matchedLegacy.includes(id)))
      .every(row => sameUpAheadOccurrence(row, item));
    const local = matchesUpAheadLocation(item, locations);
    const offer = ['shopping', 'offer'].includes(item.category);
    if (settings?.categories?.[item.category] === false || item.plannerEligible !== true || item.dateConfidence === 'tentative' || !date
      || !planDate || planDate < today || planDate > lastDay || !isUpAheadItemActive(item, now)
      || item.suppressionReason || item.displayEligible === false || !local
      || (offer && (!isActualOfferText(`${item.title || ''} ${item.description || item.summary || ''}`, settings) || !classifyRetailOffer(item, locations)))
      || (['airlines', 'airline_offer'].includes(item.category) && !isActualOfferText(`${item.title || ''} ${item.description || item.summary || ''}`, settings))
      || (item.category === 'festivals' && !isLocalHoliday(item, locations))
      || (['alerts', 'weather_alerts', 'civic'].includes(item.category) && !matchesLocalAlert(item, locations))
      || (item.category === 'civic' && !isActionableCivicNotice(item))
      || (item.category === 'alerts' && !isActionableLocalAlert(item))
      || saved.some(row => sameUpAheadDisplayOccurrence(row, item)) || blacklist?.has(key) || unambiguousLegacy) return [];

    const payload = buildPlannerMergePayload({ ...item, eventDateKey: date });
    return payload ? [{ ...payload, planDate, upAheadIds: item.upAheadIds, occurrenceKey: key }] : [];
  }).sort((a, b) => a.planDate.localeCompare(b.planDate));
}
