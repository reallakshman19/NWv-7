import { getTopStoriesPolicy } from './topStoriesPolicy.js';
import { classifyTopStoryEvent, getPublicInterestScore, TOP_STORY_EVENT_TYPES } from './topStoriesEventClassifier.js';
import { buildTopFeedSignalMap, extractTopStorySignals } from './topStoriesSignals.js';

const COLD_START_CRITICAL_EVENTS = new Set([
  TOP_STORY_EVENT_TYPES.PUBLIC_SAFETY,
  TOP_STORY_EVENT_TYPES.DISASTER,
  TOP_STORY_EVENT_TYPES.WAR_CONFLICT,
  TOP_STORY_EVENT_TYPES.CIVIC_ALERT,
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function flattenSectionItems(sectionItems) {
  if (Array.isArray(sectionItems)) return sectionItems;
  return Object.values(sectionItems || {}).flatMap(asArray);
}

function dedupeKey(story = {}) {
  return String(story.id || story.canonicalId || story.url || story.link || story.title || '').trim().toLowerCase();
}

function mergeDuplicate(existing, next) {
  const sourceCount = Math.max(Number(existing.sourceCount || 1), Number(next.sourceCount || 1));
  const clusteredItems = Math.max(Number(existing.clusteredItems || 1), Number(next.clusteredItems || 1));
  const allSources = [...new Set([...(existing.allSources || []), ...(next.allSources || []), existing.source, next.source].filter(Boolean))];
  return { ...existing, sourceCount, clusteredItems, allSources };
}

function getPenalty(signals, eventType, policy) {
  let penalty = 0;
  if (signals.timestampConfidence === 'low') penalty += 22;
  if (signals.ageHours > policy.fallbackWindowHours) penalty += 35;
  if (eventType === TOP_STORY_EVENT_TYPES.ENTERTAINMENT_PROMO) penalty += 18;
  if (signals.isLiveLike && !signals.hasFreshLiveEvidence) penalty += 20;
  return penalty;
}

function getBreakingLiveScore(signals, policy) {
  if (signals.timestampConfidence === 'low') return 0;
  if (signals.isBreaking && signals.ageHours <= policy.primaryWindowHours) return 1;
  if (signals.isLiveLike && signals.hasFreshLiveEvidence && signals.ageHours <= policy.liveMaxHours) return 0.72;
  return 0;
}

function getAgeBand(signals, policy) {
  if (signals.timestampConfidence === 'low') return 'rejected';
  if (signals.ageHours <= policy.primaryWindowHours) return 'primary';
  if (signals.ageHours <= policy.secondaryWindowHours) return 'secondary';
  if (signals.ageHours <= policy.fallbackWindowHours) return 'fallback';
  return 'expired';
}

function getMaxWeightedScore(policy) {
  return Object.values(policy.weights || {}).reduce((sum, value) => sum + Number(value || 0), 0) || 1;
}

function getNormalizedScore(score, policy) {
  return Math.max(0, Math.min(1, Number(score || 0) / getMaxWeightedScore(policy)));
}

function hasIndependentEvidence(signals = {}) {
  return Boolean(
    signals.hasIndependentEvidence ||
    Number(signals.sourceCount || 0) >= 2 ||
    Number(signals.topFeedCorroborationHits || 0) >= 1,
  );
}

function getSlotDecision(signals, event, policy, normalizedScore) {
  const ageBand = getAgeBand(signals, policy);
  if (ageBand === 'rejected') {
    return { slotBand: 'rejected', admissionReason: 'low_confidence_timestamp' };
  }
  if (ageBand === 'expired') {
    return { slotBand: 'expired', admissionReason: 'outside_fallback_window' };
  }

  const independentEvidence = hasIndependentEvidence(signals);
  if (event.qualified === false && !independentEvidence) {
    return { slotBand: 'rejected', admissionReason: 'unqualified_without_independent_evidence' };
  }

  const threshold = Number(policy.thresholds?.[ageBand] || 0);
  if (normalizedScore < threshold) {
    return { slotBand: 'rejected', admissionReason: `below_${ageBand}_threshold` };
  }

  if (ageBand === 'fallback' && signals.isAggregatorSource && !independentEvidence) {
    return { slotBand: 'rejected', admissionReason: 'fallback_aggregator_without_corroboration' };
  }

  return { slotBand: ageBand, admissionReason: 'admitted' };
}

function isColdStartCritical(signals, event, publicInterestScore) {
  return signals.ageMinutes <= 15 &&
    signals.timestampConfidence === 'high' &&
    signals.sourceQualityScore >= 0.75 &&
    publicInterestScore >= 0.9 &&
    event.qualified !== false &&
    COLD_START_CRITICAL_EVENTS.has(event.eventType) &&
    event.eventType !== TOP_STORY_EVENT_TYPES.ENTERTAINMENT_PROMO;
}

function getPriorityBucket({ coldStartCritical }) {
  return coldStartCritical ? 2 : 1;
}

function getPriorityBucketLabel(priorityBucket) {
  return priorityBucket === 2 ? 'cold-start-critical' : 'standard';
}

function getPublishedAtMs(story = {}) {
  if (typeof story.publishedAt === 'number' && Number.isFinite(story.publishedAt)) return story.publishedAt;
  const parsed = Date.parse(story.publishedAt || story.updatedAt || 0);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function compareRankedTopStories(a, b) {
  const ar = a._topStoryRank || {};
  const br = b._topStoryRank || {};
  return (Number(br.priorityBucket || 0) - Number(ar.priorityBucket || 0)) ||
    (Number(br.score || 0) - Number(ar.score || 0)) ||
    (Number(br.freshnessScore || 0) - Number(ar.freshnessScore || 0)) ||
    (getPublishedAtMs(b) - getPublishedAtMs(a)) ||
    dedupeKey(a).localeCompare(dedupeKey(b));
}

function getSourceKey(story = {}) {
  return String(story.sourceGroup || story.source || 'unknown').toLowerCase();
}

function getGeoKey(story = {}) {
  return String(story.region || story.geo || story.section || story.sourceSection || 'unknown').toLowerCase();
}

function markSlot(story, slotBand) {
  const rank = {
    ...story._topStoryRank,
    slotBand,
  };
  return {
    ...story,
    _topStoryRank: {
      ...rank,
      explanation: explainTopStoryRank({ ...story, _topStoryRank: rank }),
    },
  };
}

export function buildTopStoryCandidates({ sectionItems = {}, topFeedItems = [], nowMs = Date.now() } = {}) {
  const merged = new Map();
  for (const item of [...flattenSectionItems(sectionItems), ...asArray(topFeedItems)]) {
    if (!item) continue;
    const key = dedupeKey(item);
    if (!key) continue;
    const enriched = { ...item, _candidateSeenAt: nowMs };
    merged.set(key, merged.has(key) ? mergeDuplicate(merged.get(key), enriched) : enriched);
  }
  return [...merged.values()];
}

export function scoreTopStoryCandidate(story, context = {}) {
  const policy = context.policy || getTopStoriesPolicy();
  const event = classifyTopStoryEvent(story);
  const signals = extractTopStorySignals(story, { ...context, policy });
  const publicInterestScore = getPublicInterestScore(event.eventType);
  const breakingLiveScore = getBreakingLiveScore(signals, policy);
  const penalties = getPenalty(signals, event.eventType, policy);
  const rawScore = (signals.freshnessScore * policy.weights.freshness) +
    (publicInterestScore * policy.weights.publicInterest) +
    (signals.consensusScore * policy.weights.consensus) +
    (breakingLiveScore * policy.weights.breakingLive) +
    (signals.sourceQualityScore * policy.weights.sourceQuality) +
    (signals.locationRelevanceScore * policy.weights.locationRelevance) - penalties;
  const normalizedScore = getNormalizedScore(rawScore, policy);
  const slotDecision = getSlotDecision(signals, event, policy, normalizedScore);
  const coldStartCritical = isColdStartCritical(signals, event, publicInterestScore);
  const priorityBucket = getPriorityBucket({ coldStartCritical });

  return {
    ...story,
    _topStoryRank: {
      score: rawScore,
      normalizedScore,
      priorityBucket,
      priorityBucketLabel: getPriorityBucketLabel(priorityBucket),
      coldStartCritical,
      slotBand: slotDecision.slotBand,
      admissionReason: slotDecision.admissionReason,
      eventType: event.eventType,
      eventQualified: event.qualified !== false,
      eventEvidence: event.evidence || [],
      freshnessScore: signals.freshnessScore,
      publicInterestScore,
      consensusScore: signals.consensusScore,
      breakingLiveScore,
      penalties,
      timestampConfidence: signals.timestampConfidence,
      ageHours: signals.ageHours,
      ageMinutes: signals.ageMinutes,
      sourceQualityScore: signals.sourceQualityScore,
      sourceCount: signals.sourceCount,
      corroboratingSourceCount: signals.corroboratingSourceCount,
      independentEvidenceCount: signals.independentEvidenceCount,
      hasIndependentEvidence: signals.hasIndependentEvidence,
      isAggregatorSource: signals.isAggregatorSource,
      topFeedPresent: signals.topFeedPresent,
      topFeedHits: signals.topFeedHits || 0,
      topFeedCorroborationHits: signals.topFeedCorroborationHits || 0,
      clusterKey: signals.clusterKey,
    },
  };
}

export function rankTopStories(input = {}, options = {}) {
  const policy = getTopStoriesPolicy(options.policy || {});
  const topFeedSignalMap = buildTopFeedSignalMap(input.topFeedItems || []);
  const context = {
    policy,
    nowMs: input.nowMs || options.nowMs || Date.now(),
    settings: input.settings || {},
    topFeedSignalMap,
  };
  const ranked = buildTopStoryCandidates(input)
    .map(story => scoreTopStoryCandidate(story, context))
    .sort(compareRankedTopStories);

  return selectTopStorySlots(ranked, { ...options, policy });
}

export function selectTopStorySlots(ranked = [], options = {}) {
  const policy = options.policy || getTopStoriesPolicy();
  const limit = Math.min(Number(options.limit || policy.limit), policy.limit);
  const chosen = [];
  const primary = ranked.filter(item => item._topStoryRank.slotBand === 'primary');
  const current = ranked.filter(item => ['primary', 'secondary'].includes(item._topStoryRank.slotBand));
  const fallback = ranked.filter(item => item._topStoryRank.slotBand === 'fallback');

  fillSlots(chosen, primary, policy.primaryLimit, policy, 'primary');
  fillSlots(chosen, current, limit, policy);
  fillSlots(chosen, fallback, limit, policy, 'fallback');
  return chosen.slice(0, limit);
}

export function explainTopStoryRank(story = {}) {
  const r = story._topStoryRank || {};
  return [
    `event=${r.eventType || 'unknown'}`,
    `qualified=${r.eventQualified !== false}`,
    `band=${r.slotBand || 'unknown'}`,
    `reason=${r.admissionReason || 'unknown'}`,
    `priority=${r.priorityBucketLabel || 'standard'}`,
    `score=${Number(r.normalizedScore || 0).toFixed(2)}`,
    `fresh=${Number(r.freshnessScore || 0).toFixed(2)}`,
    `consensus=${Number(r.consensusScore || 0).toFixed(2)}`,
    `sources=${Number(r.sourceCount || 0)}`,
    `corroboration=${Number(r.independentEvidenceCount || 0).toFixed(2)}`,
    `penalty=${Number(r.penalties || 0).toFixed(1)}`,
  ].join('; ');
}

function fillSlots(chosen, pool, limit, policy, slotBand) {
  for (const item of pool) {
    if (chosen.length >= limit) break;
    if (!canUse(item, chosen, policy)) continue;
    chosen.push(markSlot(item, slotBand || item._topStoryRank.slotBand));
  }
}

function canUse(item, chosen, policy) {
  const duplicate = chosen.some(existing => dedupeKey(existing) === dedupeKey(item));
  if (duplicate) return false;
  const sourceCount = chosen.filter(existing => getSourceKey(existing) === getSourceKey(item)).length;
  const sectionCount = chosen.filter(existing => existing.section === item.section).length;
  const geoCount = chosen.filter(existing => getGeoKey(existing) === getGeoKey(item)).length;
  const clusterCount = chosen.filter(existing => existing._topStoryRank?.clusterKey === item._topStoryRank?.clusterKey).length;
  return sourceCount < policy.diversity.maxPerSource &&
    sectionCount < policy.diversity.maxPerSection &&
    geoCount < policy.diversity.maxPerGeo &&
    clusterCount < policy.diversity.maxPerCluster;
}
