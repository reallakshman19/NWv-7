import { getTopStoriesPolicy } from './topStoriesPolicy.js';
import {
  classifyTopStoryEvent,
  getPublicInterestScore,
  TOP_STORY_EVENT_TYPES,
} from './topStoriesEventClassifier.js';
import {
  buildTopFeedSignalMap,
  extractTopStorySignals,
} from './topStoriesSignals.js';
import {
  buildTopStoryCandidates as buildCandidates,
  buildTopStoryCandidatesWithTrace,
} from './topStoriesCandidates.js';
import { explainTopStoryRank } from './topStoriesExplanation.js';
import { selectTopStorySlotsWithTrace } from './topStoriesSelection.js';
import {
  cloneTopStoriesPolicy,
  compareRankedTopStories,
  resolveTopStoriesDisplayDepth,
} from './topStoriesEvaluationSupport.js';

const COLD_START_CRITICAL_EVENTS = new Set([
  TOP_STORY_EVENT_TYPES.PUBLIC_SAFETY,
  TOP_STORY_EVENT_TYPES.DISASTER,
  TOP_STORY_EVENT_TYPES.WAR_CONFLICT,
  TOP_STORY_EVENT_TYPES.CIVIC_ALERT,
]);

function getPenalty(signals, eventType, policy) {
  let penalty = 0;
  if (signals.timestampConfidence === 'low') penalty += 22;
  if (signals.ageHours > policy.fallbackWindowHours) penalty += 35;
  if (eventType === TOP_STORY_EVENT_TYPES.ENTERTAINMENT_PROMO) {
    penalty += 18;
  }
  if (signals.isLiveLike && !signals.hasFreshLiveEvidence) penalty += 20;
  return penalty;
}

function getBreakingLiveScore(signals, policy) {
  if (signals.timestampConfidence === 'low') return 0;
  if (
    signals.isBreaking &&
    signals.ageHours <= policy.primaryWindowHours
  ) {
    return 1;
  }
  if (
    signals.isLiveLike &&
    signals.hasFreshLiveEvidence &&
    signals.ageHours <= policy.liveMaxHours
  ) {
    return 0.72;
  }
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
  return Object.values(policy.weights || {}).reduce(
    (sum, value) => sum + Number(value || 0),
    0,
  ) || 1;
}

function getNormalizedScore(score, policy) {
  return Math.max(
    0,
    Math.min(1, Number(score || 0) / getMaxWeightedScore(policy)),
  );
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
    return {
      ageBand,
      admissionThreshold: null,
      slotBand: 'rejected',
      admissionReason: 'low_confidence_timestamp',
    };
  }
  if (ageBand === 'expired') {
    return {
      ageBand,
      admissionThreshold: null,
      slotBand: 'expired',
      admissionReason: 'outside_fallback_window',
    };
  }

  const admissionThreshold = Number(policy.thresholds?.[ageBand] || 0);
  const independentEvidence = hasIndependentEvidence(signals);
  if (event.qualified === false && !independentEvidence) {
    return {
      ageBand,
      admissionThreshold,
      slotBand: 'rejected',
      admissionReason: 'unqualified_without_independent_evidence',
    };
  }

  if (normalizedScore < admissionThreshold) {
    return {
      ageBand,
      admissionThreshold,
      slotBand: 'rejected',
      admissionReason: `below_${ageBand}_threshold`,
    };
  }

  if (
    ageBand === 'fallback' &&
    signals.isAggregatorSource &&
    !independentEvidence
  ) {
    return {
      ageBand,
      admissionThreshold,
      slotBand: 'rejected',
      admissionReason: 'fallback_aggregator_without_corroboration',
    };
  }

  return {
    ageBand,
    admissionThreshold,
    slotBand: ageBand,
    admissionReason: 'admitted',
  };
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

export function buildTopStoryCandidates(input = {}) {
  return buildCandidates(input);
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
    (signals.locationRelevanceScore * policy.weights.locationRelevance) -
    penalties;
  const normalizedScore = getNormalizedScore(rawScore, policy);
  const slotDecision = getSlotDecision(
    signals,
    event,
    policy,
    normalizedScore,
  );
  const coldStartCritical = isColdStartCritical(
    signals,
    event,
    publicInterestScore,
  );
  const priorityBucket = getPriorityBucket({ coldStartCritical });

  return {
    ...story,
    _topStoryRank: {
      score: rawScore,
      normalizedScore,
      priorityBucket,
      priorityBucketLabel: getPriorityBucketLabel(priorityBucket),
      coldStartCritical,
      ageBand: slotDecision.ageBand,
      admissionThreshold: slotDecision.admissionThreshold,
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

export function evaluateTopStories(input = {}, options = {}) {
  const policy = getTopStoriesPolicy(options.policy || {});
  const nowMs = input.nowMs || options.nowMs || Date.now();
  const topFeedSignalMap = buildTopFeedSignalMap(
    input.topFeedItems || [],
  );
  const context = {
    policy,
    nowMs,
    settings: input.settings || {},
    topFeedSignalMap,
  };
  const candidateResult = buildTopStoryCandidatesWithTrace({
    ...input,
    nowMs,
  });
  const scoredCandidates = candidateResult.candidates
    .map(story => scoreTopStoryCandidate(story, context))
    .sort(compareRankedTopStories);
  const displayDepth = resolveTopStoriesDisplayDepth(input, options);
  const selection = selectTopStorySlotsWithTrace(
    scoredCandidates,
    {
      ...options,
      policy,
      displayDepth,
    },
  );
  const selected = selection.selected;
  const displayed = selection.displayed;

  return {
    nowMs,
    policySnapshot: cloneTopStoriesPolicy(policy),
    rawInputCount: candidateResult.rawInputCount,
    candidates: candidateResult.candidates,
    scoredCandidates,
    admittedCandidates: scoredCandidates.filter(item => (
      ['primary', 'secondary', 'fallback']
        .includes(item._topStoryRank?.slotBand)
    )),
    selected,
    displayed,
    candidateBuildTrace: candidateResult.candidateBuildTrace,
    selectionTrace: selection.selectionTrace,
    rankedCount: selected.length,
    displayDepth,
    displayedCount: displayed.length,
    rankedIds: selected.map(item => item.id || null),
    displayedTopNIds: displayed.map(item => item.id || null),
  };
}

export function rankTopStories(input = {}, options = {}) {
  return evaluateTopStories(input, options).selected;
}

export function selectTopStorySlots(ranked = [], options = {}) {
  const policy = options.policy || getTopStoriesPolicy();
  return selectTopStorySlotsWithTrace(
    ranked,
    { ...options, policy },
  ).selected;
}

export { explainTopStoryRank };
