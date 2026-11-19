import {
  getTravelLocationProfile,
  isTravelLocationProfile,
} from './travelLocationProfile.js';
import { applyAreaRelevance } from './areaRelevanceScorer.js';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[\u064b-\u065f\u0670]/g, '')
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function geoScalarValues(value) {
  if (Array.isArray(value)) return value.flatMap(geoScalarValues);
  if (value && typeof value === 'object') return Object.values(value).flatMap(geoScalarValues);
  return typeof value === 'string' ? [value] : [];
}

function storyText(story) {
  // Source, sourceGroup, section, category, URL and travel profile are acquisition
  // context, never event location evidence.
  return normalize([
    story?.title, story?.headline, story?.summary, story?.description,
    story?.city, story?.country,
    ...geoScalarValues(story?.location), ...geoScalarValues(story?.locations),
  ].filter(Boolean).join(' '));
}

function hasWord(text, keyword) {
  if (!keyword || !text) return false;
  if (/[\u0b80-\u0bff]/u.test(keyword)) {
    return text.split(/\s+/).some(token => token.startsWith(keyword));
  }
  const escaped = keyword.replace(/[.*+?^\x24{}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\s)${escaped}(?=$|\\s)`, 'u').test(text);
}

function storyKey(story) {
  return String(story?.id || story?.url || story?.link || story?.title || story?.headline || '').trim();
}

function collectStories(newsData = {}) {
  const sections = [
    'frontPage',
    'topStories',
    'india',
    'chennai',
    'local',
    'world',
    'business',
    'sports',
    'buzz',
    'tech',
    'technology',
    'travel',
  ];

  const stories = [];

  for (const section of sections) {
    for (const story of asArray(newsData?.[section])) {
      stories.push({
        ...story,
        _travelSection: section,
      });
    }
  }

  for (const [key, value] of Object.entries(newsData || {})) {
    if (sections.includes(key)) continue;
    if (!Array.isArray(value)) continue;

    for (const story of value) {
      stories.push({
        ...story,
        _travelSection: key,
      });
    }
  }

  return stories;
}

export function applyMainAreaRelevance(newsData = {}) {
  const next = { ...newsData };

  if (Array.isArray(newsData.chennai)) {
    next.chennai = applyAreaRelevance(newsData.chennai, 'chennai');
  }

  if (Array.isArray(newsData.local)) {
    next.local = applyAreaRelevance(newsData.local, 'muscat');
  }

  return next;
}

export function scoreStoryForLocation(story, profile) {
  if (!story || !profile?.prioritizeStories) return 0;

  const text = storyText(story);
  if (!text) return 0;
  const city = normalize(profile.display);
  const key = normalize(profile.key);
  const country = normalize(profile.countryLabel);
  const region = normalize(profile.regionLabel);
  const keywords = [...new Set([
    key, city, country, region,
    ...(profile.aliases || []), ...(profile.storyKeywords || []),
  ].map(normalize).filter(term => term.length > 2))];
  let score = 0;
  for (const term of keywords) {
    if (!hasWord(text, term)) continue;
    if (term === city || term === key) score += 70;
    else if (term === country) score += 26;
    else if (term === region) score += 32;
    else score += 24;
  }
  // Structured fields are accepted only when originally supplied by the story.
  if (normalize(story?.city) === city || normalize(story?.city) === key) score += 20;
  if (normalize(story?.country) === country || normalize(story?.countryCode) === normalize(profile.countryCode)) score += 18;
  return score;
}

export function rankStoriesForLocation(newsData = {}, profileInput = null, options = {}) {
  const profile = isTravelLocationProfile(profileInput)
    ? profileInput
    : getTravelLocationProfile(profileInput || {});

  const limit = options.limit || 8;
  const minScore = options.minScore ?? 18;
  const seen = new Set();

  return collectStories(newsData)
    .map(story => ({
      ...story,
      _travelLocationScore: scoreStoryForLocation(story, profile),
      _travelLocationKey: profile.key,
    }))
    .filter(story => story._travelLocationScore >= minScore)
    .sort((a, b) => b._travelLocationScore - a._travelLocationScore)
    .filter(story => {
      const key = storyKey(story);
      if (!key) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

export function prioritizeStoryArrayForLocation(stories = [], profileInput = null, { preservePublicImpact = false } = {}) {
  const profile = isTravelLocationProfile(profileInput)
    ? profileInput
    : getTravelLocationProfile(profileInput || {});

  return asArray(stories)
    .map((story, index) => ({
      story,
      index,
      score: scoreStoryForLocation(story, profile),
    }))
    .sort((a, b) => {
      if (preservePublicImpact) {
        const weakArea = story => ['weak', 'off-area'].includes(story._areaRelevance?.label) ? 1 : 0;
        const areaDelta = weakArea(a.story) - weakArea(b.story);
        if (areaDelta !== 0) return areaDelta;
        const impactDelta = Number(b.story._publicImpact?.priority || 0) - Number(a.story._publicImpact?.priority || 0);
        if (impactDelta !== 0) return impactDelta;
      }
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    })
    .map(item => ({
      ...item.story,
      _travelLocationScore: item.score,
      _travelLocationKey: profile.key,
    }));
}

export function applyTravelLocationPriority(newsData = {}, profileInput = null) {
  const profile = isTravelLocationProfile(profileInput)
    ? profileInput
    : getTravelLocationProfile(profileInput || {});
  const areaNewsData = applyMainAreaRelevance(newsData);

  if (!profile?.prioritizeStories) return areaNewsData;

  const next = { ...areaNewsData };

  for (const [key, value] of Object.entries(areaNewsData || {})) {
    if (Array.isArray(value)) {
      next[key] = prioritizeStoryArrayForLocation(value, profile, {
        preservePublicImpact: ['india', 'chennai', 'tn', 'trichy'].includes(key),
      });
    }
  }

  next.travelLocal = rankStoriesForLocation(areaNewsData, profile, { limit: 8 });
  next.travelLocationProfile = profile;

  return next;
}
