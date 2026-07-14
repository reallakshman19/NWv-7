import { isBreakingStory } from '../breakingNewsService.js';
import { HOURS_MS, clampScore } from './topStoriesPolicy.js';
import { buildTopFeedSnapshotSignalMap, getTopFeedIdentity } from './topStoriesTopFeedSignals.js';

const LOW_TS = new Set(['low', 'fallback', 'unknown']);
const FALLBACK_SOURCES = new Set(['fetch_time_fallback', 'fetchedat', 'fetch_fallback']);

function textValue(value) {
  return String(value || '').trim().toLowerCase();
}

function sourceKey(value) {
  return textValue(value).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function toTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function uniqueSources(story = {}) {
  const explicit = Array.isArray(story.allSources)
    ? story.allSources.map(sourceKey).filter(Boolean)
    : [];
  if (explicit.length > 0) return [...new Set(explicit)];

  const primary = sourceKey(story.sourceGroup || story.source);
  return primary ? [primary] : [];
}

function declaredSourceCount(story = {}) {
  return Math.max(0, Number(story.sourceCount || 0));
}

function isAggregatorSource(story = {}) {
  return /\bgoogle[ _-]?news\b/i.test(`${story.source || ''} ${story.sourceGroup || ''}`);
}

function getTopFeedSignal(story = {}, context = {}) {
  const map = context.topFeedSignalMap || new Map();
  const keys = [
    story.id,
    story.canonicalId,
    story.url,
    story.link,
    story.title,
    getTopFeedIdentity(story),
    textValue(story.url || story.link),
    textValue(story.title),
  ].filter(Boolean);
  for (const key of keys) {
    const signal = map.get(String(key)) || map.get(textValue(key));
    if (signal) return signal;
  }
  return {};
}

function pickTopFeedSignals(signal = {}) {
  return {
    topFeedHits: Number(signal.topFeedHits || 0),
    topFeedConsensusScore: Number(signal.topFeedConsensusScore || 0),
    topFeedRankScore: Number(signal.topFeedRankScore || 0),
    topFeedSourceCount: Number(signal.topFeedSourceCount || 0),
    topFeedSources: Array.isArray(signal.topFeedSources) ? signal.topFeedSources : [],
    topFeedBestRank: signal.topFeedBestRank || null,
    normalizedTopFeedIdentity: signal.normalizedIdentity || '',
  };
}

function looksLikeFetchTimeFallback(story = {}) {
  const publishedAt = toTimestamp(story.publishedAt || story.updatedAt);
  const fetchedAt = toTimestamp(story.fetchedAt);
  if (!publishedAt || !fetchedAt) return false;
  return Math.abs(publishedAt - fetchedAt) <= 30_000;
}

export function getTimestampConfidence(story = {}) {
  const raw = textValue(story.timestampConfidence || story.publishedAtConfidence);
  const source = textValue(story.publishedAtSource || story.timestampSource);
  if (LOW_TS.has(raw) || FALLBACK_SOURCES.has(source)) return 'low';
  if (looksLikeFetchTimeFallback(story) && !raw && !source) return 'low';
  return toTimestamp(story.publishedAt || story.updatedAt) ? (raw || 'high') : 'low';
}

export function getAgeHours(story = {}, nowMs = Date.now()) {
  const timestampMs = toTimestamp(story.publishedAt || story.updatedAt);
  if (!timestampMs) return Infinity;
  return Math.max(0, (nowMs - timestampMs) / HOURS_MS);
}

export function hasFreshLiveEvidence(story = {}, context = {}) {
  const nowMs = context.nowMs || Date.now();
  const updateMs = toTimestamp(story.updatedAt || story.lastUpdatedAt || story.liveUpdatedAt);
  const topFeed = getTopFeedSignal(story, context);
  if (Number(topFeed.topFeedConsensusScore || 0) > 0) return true;
  if (!updateMs) return getAgeHours(story, nowMs) <= 2;
  return ((nowMs - updateMs) / HOURS_MS) <= 2;
}

export function buildTopFeedSignalMap(topFeedItems = []) {
  return buildTopFeedSnapshotSignalMap(topFeedItems);
}

export function getClusterKey(story = {}) {
  const explicit = story.clusterId || story.canonicalId || story.id || story.url || story.link;
  if (explicit) return String(explicit);
  return textValue(story.title || story.headline).replace(/[^a-z0-9]+/g, ' ').trim();
}

export function getSourceQualityScore(story = {}) {
  const source = textValue(`${story.source || ''} ${story.sourceGroup || ''}`);
  if (/\b(reuters|ap|bbc|the hindu|business_line|times_of_oman|muscat_daily)\b/i.test(source)) return 1;
  if (/\b(ndtv|hindustan|economic_times|moneycontrol|google_news)\b/i.test(source)) return 0.72;
  return 0.48;
}

export function getLocationRelevanceScore(story = {}) {
  const text = textValue(`${story.section || ''} ${story.sourceSection || ''} ${story.region || ''} ${story.title || ''}`);
  if (/\b(oman|muscat|chennai|trichy|tamil nadu|india)\b/.test(text)) return 0.82;
  if (/\b(world|global|international|gaza|ukraine|russia|israel)\b/.test(text)) return 0.66;
  return 0.42;
}

export function getFreshnessScore(ageHours, policy) {
  if (!Number.isFinite(ageHours)) return 0;
  return clampScore(1 - (ageHours / policy.fallbackWindowHours));
}

export function getConsensusScore(story = {}, context = {}, policy) {
  const sourceCount = Math.max(uniqueSources(story).length, declaredSourceCount(story), 1);
  const cluster = Number(story.clusteredItems || 1) * policy.consensus.clusterWeight;
  const topFeed = getTopFeedSignal(story, context);
  const top = Number(topFeed.topFeedHits || 0) * policy.consensus.topFeedWeight;
  const raw = sourceCount + Math.max(0, cluster - 1) + top;
  return clampScore(Math.log1p(raw) / Math.log1p(policy.consensus.cap));
}

export function extractTopStorySignals(story = {}, context = {}) {
  const policy = context.policy;
  const nowMs = context.nowMs || Date.now();
  const ageHours = getAgeHours(story, nowMs);
  const timestampConfidence = getTimestampConfidence(story);
  const topFeed = pickTopFeedSignals(getTopFeedSignal(story, context));
  const isLiveLike = /\b(live|updates|developing|ongoing)\b/i.test(`${story.title || ''} ${story.url || ''}`);
  const sourceCount = Math.max(uniqueSources(story).length, declaredSourceCount(story), 1);
  return {
    timestampMs: toTimestamp(story.publishedAt || story.updatedAt),
    ageHours,
    ageMinutes: Number.isFinite(ageHours) ? ageHours * 60 : Infinity,
    timestampConfidence,
    isBreaking: isBreakingStory(story),
    breakingScore: Number(story.breakingScore || 0),
    isLiveLike,
    hasFreshLiveEvidence: isLiveLike ? hasFreshLiveEvidence(story, context) : false,
    sourceCount,
    isAggregatorSource: isAggregatorSource(story),
    clusteredItems: Number(story.clusteredItems || 1),
    allSources: uniqueSources(story),
    ...topFeed,
    sourceQualityScore: getSourceQualityScore(story),
    locationRelevanceScore: getLocationRelevanceScore(story),
    freshnessScore: getFreshnessScore(ageHours, policy),
    consensusScore: getConsensusScore(story, context, policy),
    clusterKey: getClusterKey(story),
  };
}
