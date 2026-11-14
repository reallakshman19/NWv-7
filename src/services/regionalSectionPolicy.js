import { normalizeTopStoryCanonicalUrl } from './topStories/topStoriesStudyIdentity.js';

const TAMIL_SECTION_KEYS = new Set(['tn', 'chennai', 'tamilnadu', 'tamilNadu']);
const TAMIL_NADU = /\b(?:tamil nadu|chennai|coimbatore|madurai|tiruchirappalli|trichy|tirunelveli|cuddalore|nagapattinam|nilgiris)\b/i;
const WEATHER = /\b(?:rain(?:fall)?|monsoon|cyclone|low[- ]pressure|flood(?:ing)?|depression|weather)\b/i;
const WIDER_SCOPE = /\b(?:across india|nationwide|pan[- ]india|multiple states|andhra pradesh|odisha|west bengal|kerala|karnataka)\b/i;
const INDIA = /\b(?:india(?:ns?)?|bharat|delhi|mumbai|bengaluru|kolkata|hyderabad|ahmedabad|lok sabha|rajya sabha|bjp|modi|rupee|isro|iits?|iisc|csir|drdo|kerala|karnataka|maharashtra|odisha|gujarat|punjab|uttar pradesh|bihar)\b/i;
const FOREIGN_PLACE = /\b(?:peru(?:vian)?|lambayeque|california|united states|united kingdom|canada|australia|china|japan|france|germany|brazil|mexico|russia|ukraine|israel|gaza|pakistan|bangladesh|sri lanka|oman|muscat|dubai)\b/i;

function articleText(item) {
  return `${item.title || item.headline || ''} ${item.description || item.summary || ''}`
    .replace(/<[^>]+>/g, ' ')
    .replace(/\b(?:times of india|(?:new )?indian express|indian ocean|indian wells)\b/gi, ' ');
}

function articleUrl(item) {
  try {
    return new URL(item.url || item.link || item.canonicalUrl);
  } catch {
    return null;
  }
}

export function isTamilNaduStory(item) {
  const text = articleText(item);
  if (WIDER_SCOPE.test(text)) return false;
  return /\/(?:tamil[-_]?nadu|chennai)(?:\/|$)/i.test(articleUrl(item)?.pathname || '')
    || (TAMIL_NADU.test(text) && WEATHER.test(text));
}

export function belongsInRegionalSection(item, section) {
  if (section !== 'india' && !TAMIL_SECTION_KEYS.has(section)) return true;
  if (isTamilNaduStory(item)) return section !== 'india';

  const text = articleText(item);
  const url = articleUrl(item);
  const path = url?.pathname || '';
  const hasIndiaText = INDIA.test(text) || TAMIL_NADU.test(text);
  const hasIndiaPath = /\/(?:india(?:-news|-business)?|national)(?:\/|$)/i.test(path);
  const isWorld = /^\/(?:news\/)?(?:world(?:-news)?|international)(?:\/|$)/i.test(path);
  const isMixedToiTopic = /(?:^|\.)timesofindia\.(?:indiatimes\.com|com)$/i.test(url?.hostname || '')
    && /^\/(?:science|real-estate)(?:\/|$)/i.test(path);
  if (isWorld && !hasIndiaText) return false;
  if ((isMixedToiTopic || FOREIGN_PLACE.test(text)) && !hasIndiaText && !hasIndiaPath) return false;
  return section === 'india' || item.backfilledFrom !== 'india' || TAMIL_NADU.test(text);
}

function storyKeys(item) {
  const url = normalizeTopStoryCanonicalUrl(item.url || item.link || item.canonicalUrl);
  const headline = (item.title || item.headline || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  return [
    item.id && `id:${item.id}`,
    url && `url:${url}`,
    headline.split(' ').length >= 5 && `headline:${headline}`,
  ].filter(Boolean);
}

// The specific regional version wins. A national item copied to fill the
// regional feed stays with India unless the regional version has local scope.
export function removeRegionalSectionOverlap(items, section, otherItems = []) {
  const isIndia = section === 'india';
  if (!isIndia && !TAMIL_SECTION_KEYS.has(section)) return items;
  const otherSection = isIndia ? 'tn' : 'india';
  const overlapping = new Set(otherItems
    .filter(item => belongsInRegionalSection(item, otherSection))
    .filter(item => !isIndia || isTamilNaduStory(item))
    .flatMap(storyKeys));
  return items.filter(item => {
    if (!belongsInRegionalSection(item, section)) return false;
    if (!isIndia && isTamilNaduStory(item)) return true;
    return !storyKeys(item).some(key => overlapping.has(key));
  });
}
