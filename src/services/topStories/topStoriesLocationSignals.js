const LOCAL_PATTERN = /\b(oman|muscat|chennai|trichy|tamil nadu|india)\b/;
const WORLD_PATTERN = /\b(world|global|international|gaza|ukraine|russia|israel)\b/;
const LOCAL_COUNTRY_CODES = new Set(['in', 'ind', 'om', 'omn']);

const STORY_LOCATION_FIELDS = Object.freeze([
  'region',
  'country',
  'countryCode',
  'city',
  'location',
  'locations',
  'title',
  'headline',
  'summary',
  'description',
]);

function textValue(value) {
  return String(value || '').trim().toLowerCase();
}

function scalarValues(value) {
  if (Array.isArray(value)) return value.flatMap(scalarValues);
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(scalarValues);
  }
  const text = textValue(value);
  return text ? [text] : [];
}

function collectStoryLocationEvidence(story = {}) {
  return STORY_LOCATION_FIELDS.flatMap(field => (
    scalarValues(story[field]).map(value => ({ field, value }))
  ));
}

function hasLocalCountryCode(evidence = []) {
  return evidence.some(item => (
    item.field === 'countryCode' && LOCAL_COUNTRY_CODES.has(item.value)
  ));
}

export function getLocationRelevanceSignal(story = {}) {
  const evidence = collectStoryLocationEvidence(story);
  const text = evidence.map(item => item.value).join(' ');
  if (hasLocalCountryCode(evidence) || LOCAL_PATTERN.test(text)) {
    return { score: 0.82, target: 'local', confidence: 'strong', evidence };
  }
  if (WORLD_PATTERN.test(text)) {
    return { score: 0.66, target: 'world', confidence: 'strong', evidence };
  }
  return {
    score: 0.42,
    target: 'generic',
    confidence: evidence.length > 0 ? 'weak' : 'none',
    evidence,
  };
}

export function getLocationRelevanceScore(story = {}) {
  return getLocationRelevanceSignal(story).score;
}

export const __topStoriesLocationInternalsForTest = {
  collectStoryLocationEvidence,
};
