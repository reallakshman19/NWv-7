import { isBreakingStory } from '../breakingNewsService.js';
import { newsIdentityKey } from '../newsStoryIdentity.js';
import { independentPublisherFamilies, clusterPublisherFamilies, expandNewsEvidenceRows } from '../newsClusterEvidence.js';
import { HOURS_MS, clampScore } from './topStoriesPolicy.js';
import { buildTopFeedSnapshotSignalMap, getTopFeedIdentity } from './topStoriesTopFeedSignals.js';
import {
  getLocationRelevanceScore,
  getLocationRelevanceSignal,
} from './topStoriesLocationSignals.js';
import {
  getStorySourceFamily,
  isAggregatorSourceFamily,
} from './topStoriesSourceIdentity.js';

export { getLocationRelevanceScore, getLocationRelevanceSignal };

const LOW_TS = new Set(['low', 'fallback', 'unknown']);
const FALLBACK_SOURCES = new Set(['fetch_time_fallback', 'fetchedat', 'fetch_fallback', 'missing', 'invalid', 'unknown', 'updated_parsed']);
const TOP_TIER_SOURCE_FAMILIES = new Set([
  'reuters',
  'associated_press',
  'bbc',
  'the_hindu',
  'business_line',
  'times_of_oman',
  'muscat_daily',
]);
const STANDARD_SOURCE_FAMILIES = new Set([
  'ndtv',
  'hindustan_times',
  'economic_times',
  'moneycontrol',
  'google_news',
]);

function textValue(value) {
  return String(value || '').trim().toLowerCase();
}

function toTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function isAggregatorSource(story = {}) {
  return isAggregatorSourceFamily(getStorySourceFamily(story));
}

function getTopFeedSignal(story = {}, context = {}) {
  const map=context.topFeedSignalMap || new Map();
  return map.get(getTopFeedIdentity(story)) || {};
}

function pickTopFeedSignals(signal = {}) {
  return {
    topFeedPresent: Boolean(signal.topFeedPresent),
    topFeedHits: Number(signal.topFeedHits || 0),
    topFeedCorroborationHits: Number(signal.topFeedCorroborationHits || 0),
    topFeedConsensusScore: Number(signal.topFeedConsensusScore || 0),
    topFeedRankScore: Number(signal.topFeedRankScore || 0),
    topFeedSourceCount: Number(signal.topFeedSourceCount || 0),
    topFeedCorroboratingSourceCount: Number(signal.topFeedCorroboratingSourceCount || 0),
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

export function getTimestampConfidence(story = {}, nowMs = Date.now()) {
  const timestampMs = toTimestamp(story.publishedAt);
  if (timestampMs <= 0 || timestampMs > nowMs + 5 * 60_000) return 'low';
  const raw = textValue(story.timestampConfidence || story.publishedAtConfidence);
  const source = textValue(story.publishedAtSource || story.timestampSource);
  if (LOW_TS.has(raw) || FALLBACK_SOURCES.has(source)) return 'low';
  if (looksLikeFetchTimeFallback(story) && !raw && !source) return 'low';
  return toTimestamp(story.publishedAt) ? (raw || 'high') : 'low';
}

export function getAgeHours(story = {}, nowMs = Date.now()) {
  const timestampMs = toTimestamp(story.publishedAt);
  if (timestampMs <= 0 || timestampMs > nowMs + 5 * 60_000) return Infinity;
  return Math.max(0, (nowMs - timestampMs) / HOURS_MS);
}

export function isTopStoryTimeEligible(story, nowMs, policy) {
  return getTimestampConfidence(story, nowMs) !== 'low' &&
    getAgeHours(story, nowMs) <= policy.fallbackWindowHours;
}

export function hasFreshLiveEvidence(story = {}, context = {}) {
  const nowMs = context.nowMs ?? Date.now();
  const updateMs = toTimestamp(story.updatedAt || story.lastUpdatedAt || story.liveUpdatedAt);
  if (context.policy && getCorroborationParts(story,context,context.policy).independentEvidenceCount > 0) return true;
  if (!updateMs) return getAgeHours(story, nowMs) <= 2;
  return updateMs <= nowMs + 5 * 60_000 && ((nowMs - updateMs) / HOURS_MS) <= 2;
}

export function buildTopFeedSignalMap(topFeedItems = []) {
  return buildTopFeedSnapshotSignalMap(topFeedItems);
}

export function getClusterKey(story = {}) { return String(story.clusterId || newsIdentityKey(story)); }

export function getSourceQualityScore(story = {}) {
  const family = getStorySourceFamily(story);
  if (TOP_TIER_SOURCE_FAMILIES.has(family)) return 1;
  if (STANDARD_SOURCE_FAMILIES.has(family)) return 0.72;
  return 0.48;
}

export function getFreshnessScore(ageHours, policy) {
  if (!Number.isFinite(ageHours)) return 0;
  return clampScore(1 - (ageHours / policy.fallbackWindowHours));
}

export function getCorroborationParts(story = {}, context = {}, policy) {
  const nowMs=context.nowMs ?? Date.now();
  const rows=expandNewsEvidenceRows([story]).filter(row=>isTopStoryTimeEligible(row,nowMs,policy));
  const named=independentPublisherFamilies(clusterPublisherFamilies(rows));
  const topFeed=getTopFeedSignal(story,context);
  const feedRows=(topFeed.topFeedEvidenceRows || []).filter(row=>isTopStoryTimeEligible(row,nowMs,policy));
  const union=independentPublisherFamilies(clusterPublisherFamilies([...rows,...feedRows]));
  const corroboratingSources=Math.max(0,named.length-1);
  const total=Math.max(0,union.length-1);
  // Each family contributes once across all lanes; repetition is not additional corroboration.
  const additional=Math.max(0,total-corroboratingSources);
  return {sourceCount:Math.max(1,union.length),corroboratingSources,extraClusterEvidence:0,
    topFeedCorroboration:additional*policy.consensus.topFeedWeight,
    independentEvidenceCount:total, allSources:union.length?union:clusterPublisherFamilies(rows)};
}

export function getConsensusScore(story = {}, context = {}, policy) {
  const parts = getCorroborationParts(story, context, policy);
  const raw = parts.corroboratingSources + parts.extraClusterEvidence + parts.topFeedCorroboration;
  if (raw <= 0) return 0;
  return clampScore(Math.log1p(raw) / Math.log1p(policy.consensus.cap));
}

export function extractTopStorySignals(story = {}, context = {}) {
  const policy = context.policy;
  const nowMs = context.nowMs ?? Date.now();
  const ageHours = getAgeHours(story, nowMs);
  const timestampConfidence = getTimestampConfidence(story, nowMs);
  const topFeed = pickTopFeedSignals(getTopFeedSignal(story, context));
  const isLiveLike = /\b(live|updates|developing|ongoing)\b/i.test(`${story.title || ''} ${story.url || ''}`);
  const corroboration = getCorroborationParts(story, context, policy);
  const locationRelevance = getLocationRelevanceSignal(story);
  return {
    timestampMs: toTimestamp(story.publishedAt || story.updatedAt),
    ageHours,
    ageMinutes: Number.isFinite(ageHours) ? ageHours * 60 : Infinity,
    timestampConfidence,
    isBreaking: isBreakingStory(story),
    breakingScore: Number(story.breakingScore || 0),
    isLiveLike,
    hasFreshLiveEvidence: isLiveLike ? hasFreshLiveEvidence(story, context) : false,
    sourceCount: corroboration.sourceCount,
    corroboratingSourceCount: corroboration.corroboratingSources,
    independentEvidenceCount: corroboration.independentEvidenceCount,
    hasIndependentEvidence: corroboration.independentEvidenceCount > 0,
    isAggregatorSource: isAggregatorSource(story),
    clusteredItems: Number(story.clusteredItems || 1),
    allSources: corroboration.allSources,
    ...topFeed,
    topFeedCorroborationHits: Math.max(0,corroboration.independentEvidenceCount-corroboration.corroboratingSources),
    topFeedNewFamilyCount: Math.max(0,corroboration.independentEvidenceCount-corroboration.corroboratingSources),
    sourceQualityScore: getSourceQualityScore(story),
    locationRelevanceScore: locationRelevance.score,
    locationRelevanceTarget: locationRelevance.target,
    locationRelevanceConfidence: locationRelevance.confidence,
    locationRelevanceEvidence: locationRelevance.evidence,
    freshnessScore: getFreshnessScore(ageHours, policy),
    consensusScore: getConsensusScore(story, context, policy),
    clusterKey: getClusterKey(story),
  };
}
