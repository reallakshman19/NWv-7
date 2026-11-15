import { toLocalDateKey } from '../utils/dateKey.js';
import { buildPlannerMergePayload } from '../utils/plannerIntelligenceBridge.js';
import {
  isUpAheadItemActive, mergeUpAheadItems, upAheadDateKey, upAheadIdentityKeys,
  upAheadTimeMs,
} from './upAheadLifecycle.js';
import { matchesUpAheadLocation } from './upAheadLocation.js';

export function getUpAheadPlannerSuggestions(data, savedPlan, blacklist, settings, now = Date.now()) {
  const today = toLocalDateKey(now);
  const end = new Date(now);
  end.setDate(end.getDate() + 6);
  const lastDay = toLocalDateKey(end);
  const savedKeys = new Set(Object.entries(savedPlan).flatMap(([date, items]) =>
    items.flatMap(item => upAheadIdentityKeys({ ...item, date: upAheadDateKey(item) || date }))
  ));
  const dismissedKeys = new Set([...blacklist].map(id => `id:${id}`));
  const locations = (settings?.locations || []).map(location => String(location).toLowerCase().trim());
  const candidates = (data?.timeline || []).flatMap(day => day.items);

  return mergeUpAheadItems(candidates, { preferEventCategory: true }).flatMap(item => {
    const date = upAheadDateKey(item);
    const ongoing = upAheadTimeMs(item.eventStartAt || date) <= now && upAheadTimeMs(item.eventEndAt) > now;
    if (item.plannerEligible !== true || item.dateConfidence === 'tentative' || !date
      || (date < today && !ongoing) || date > lastDay || !isUpAheadItemActive(item, now)
      || settings?.categories?.[item.category] === false
      || !matchesUpAheadLocation(item, locations)
      || upAheadIdentityKeys(item).some(key => savedKeys.has(key) || dismissedKeys.has(key))) {
      return [];
    }

    const payload = buildPlannerMergePayload({ ...item, eventDateKey: date });
    return [{ ...payload, planDate: ongoing && date < today ? today : date, upAheadIds: item.upAheadIds }];
  }).sort((a, b) => a.planDate.localeCompare(b.planDate));
}
