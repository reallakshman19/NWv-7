/**
 * Stable editorial identity and ordering, independent of Google News redirect
 * URLs. Different RSS search queries can return the exact same article under
 * distinct Google News article URLs.
 */
import { getTravelStoryPublishedMs } from './travelNewsFreshness.js';

export function travelTitleFingerprint(story) {
  return String(story?.title || story?.headline || '')
    .normalize('NFKC').toLocaleLowerCase()
    .replace(/&(?:amp|quot|apos|nbsp);/gi, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim().replace(/\s+/g, ' ');
}

export function compareTravelStoryRecency(a, b) {
  const age = (getTravelStoryPublishedMs(b) || 0) - (getTravelStoryPublishedMs(a) || 0);
  if (age) return age;
  const byTitle = travelTitleFingerprint(a).localeCompare(travelTitleFingerprint(b));
  if (byTitle) return byTitle;
  return String(a?.url || '').localeCompare(String(b?.url || ''));
}

function nearDuplicate(a, b) {
  if (String(a.source || '').toLocaleLowerCase().trim() !==
      String(b.source || '').toLocaleLowerCase().trim()) return false;
  const pa = getTravelStoryPublishedMs(a), pb = getTravelStoryPublishedMs(b);
  if (pa === null || pb === null || Math.abs(pa - pb) > 6 * 3600000) return false;
  const ta = new Set(travelTitleFingerprint(a).split(' '));
  const tb = new Set(travelTitleFingerprint(b).split(' '));
  const intersection = [...ta].filter(token => tb.has(token)).length;
  const union = new Set([...ta, ...tb]).size;
  return union > 0 && intersection / union >= 0.92;
}

export function dedupeTravelStories(stories) {
  const sorted = [...(Array.isArray(stories) ? stories : [])].sort(compareTravelStoryRecency);
  const seenUrls = new Set(), seenTitles = new Set(), result = [];
  for (const story of sorted) {
    const title = travelTitleFingerprint(story);
    const url = String(story?.url || story?.link || '').trim().toLowerCase();
    if (!title || (url && seenUrls.has(url)) || seenTitles.has(title) ||
        result.some(existing => nearDuplicate(story, existing))) continue;
    if (url) seenUrls.add(url);
    seenTitles.add(title);
    result.push(story);
  }
  return result;
}
