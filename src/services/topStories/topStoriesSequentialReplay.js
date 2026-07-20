import { compareTopStoryIdentitySnapshots } from './topStoriesIdentityTransitions.js';
import { classifyTopStoriesPeriod } from './topStoriesPeriodClassifier.js';
import { buildStandardTopStoriesPairSets } from './topStoriesObservationPairing.js';
import { compareDisplayedTopStories } from './topStoriesStabilityMetrics.js';
import {
  attachTopStoryStudyIdentities,
  TOP_STORIES_IDENTITY_VERSION,
} from './topStoriesStudyIdentity.js';
import {
  buildTopStoriesVersionSegmentKey,
  compareTopStoriesVersionSegments,
  validateTopStoriesNormalizationEvidence,
} from './topStoriesVersionSegment.js';

const DEFAULT_MAX_RESIDENCE_GAP_MS = 45 * 60 * 1000;

function parseTime(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Date.parse(value || 0);
  return Number.isNaN(parsed) ? null : parsed;
}

function completenessRank(state) {
  return { FAILED: 0, PARTIAL_INPUT: 1, PARTIAL_TRACE: 2, COMPLETE: 3 }[state] ?? 0;
}

function getSlotKey(observation = {}) {
  return `${observation.studyId || 'study'}|${observation.scheduledAt || 'unscheduled'}`;
}

function chooseCanonicalAttempt(left, right) {
  const leftValid = left.schemaValid !== false;
  const rightValid = right.schemaValid !== false;
  if (leftValid !== rightValid) return rightValid ? right : left;
  const completenessDelta = completenessRank(right.completenessState) -
    completenessRank(left.completenessState);
  if (completenessDelta !== 0) return completenessDelta > 0 ? right : left;
  return Number(right.workflowRunAttempt || 1) >= Number(left.workflowRunAttempt || 1)
    ? right : left;
}

export function canonicalizeTopStoriesObservations(observations = []) {
  const bySlot = new Map();
  const operationalRecords = [];
  observations.forEach((observation, index) => {
    const row = { ...observation, _inputIndex: index };
    const key = getSlotKey(row);
    if (!bySlot.has(key)) {
      bySlot.set(key, row);
      return;
    }
    const previous = bySlot.get(key);
    const selected = chooseCanonicalAttempt(previous, row);
    const superseded = selected === row ? previous : row;
    bySlot.set(key, selected);
    operationalRecords.push({
      slotKey: key,
      status: 'SUPERSEDED_DUPLICATE_SLOT',
      supersededWorkflowRunId: superseded.workflowRunId || null,
      retainedWorkflowRunId: selected.workflowRunId || null,
    });
  });
  const canonical = [...bySlot.values()].sort((left, right) =>
    (parseTime(left.runAt) ?? Infinity) - (parseTime(right.runAt) ?? Infinity) ||
    left._inputIndex - right._inputIndex);
  return { canonical, operationalRecords };
}

function normalizeObservation(observation = {}, options = {}) {
  const identityVersion = observation.identityVersion ||
    options.identityVersion || TOP_STORIES_IDENTITY_VERSION;
  const displayedRows = observation.displayedTopStories || observation.displayed || [];
  const scoredRows = observation.scoredCandidates || [];
  return {
    ...observation,
    observationId: observation.observationId ||
      `${observation.studyId || 'study'}:${observation.scheduledAt || observation.runAt}`,
    runAt: parseTime(observation.runAt),
    completenessState: observation.completenessState || 'COMPLETE',
    analyticalEligibility: observation.analyticalEligibility || 'ELIGIBLE',
    identityVersion,
    displayed: attachTopStoryStudyIdentities(displayedRows, { identityVersion }),
    scoredCandidates: attachTopStoryStudyIdentities(scoredRows, { identityVersion }),
  };
}

function getReplacementClass(period, transitions, prior, current) {
  const transitionTypes = new Set(transitions.transitions.map(item => item.type));
  if (transitionTypes.has('cluster_split') || transitionTypes.has('cluster_merge')) {
    return 'IDENTITY_RESOLUTION';
  }
  if (current.sourceHealth?.ok === false || current.sourceHealth?.complete === false) {
    return 'INPUT_LOSS';
  }
  if (period.periodClass === 'active') return 'CRITICAL_OVERRIDE';
  if (prior.displayed.length !== current.displayed.length) return 'DISPLAY_BOUNDARY';
  return 'ORDINARY_RANK_CHANGE';
}

function comparisonEligibility(prior, current, period, expectedNormalizationVersion) {
  const compatibility = compareTopStoriesVersionSegments(prior, current, {
    normalizationVersion: expectedNormalizationVersion,
  });
  const reasons = [...compatibility.reasonCodes];
  if (period.periodClass === 'uncertain') reasons.push('uncertain_period_classification');
  return {
    eligible: reasons.length === 0,
    reasonCodes: [...new Set(reasons)].sort(),
    compatibility,
  };
}

function buildIntervalComparison(prior, current, classifierPolicy, expectedVersion) {
  const identityTransitions = compareTopStoryIdentitySnapshots(prior.displayed, current.displayed);
  const period = classifyTopStoriesPeriod({
    priorSnapshot: prior,
    currentSnapshot: current,
    candidateTrace: { scoredCandidates: current.scoredCandidates },
    sourceHealth: current.sourceHealth,
    identityTransitions,
    classifierPolicy,
  });
  const metrics = compareDisplayedTopStories(prior.displayed, current.displayed);
  const eligibility = comparisonEligibility(prior, current, period, expectedVersion);
  return {
    priorObservationId: prior.observationId,
    currentObservationId: current.observationId,
    intervalMs: current.runAt - prior.runAt,
    segmentKey: buildTopStoriesVersionSegmentKey(prior),
    period,
    identityTransitions,
    metrics,
    eligibleForHeadlineKpi: eligibility.eligible,
    comparisonEligibilityReasons: eligibility.reasonCodes,
    replacementPrimaryClass: getReplacementClass(period, identityTransitions, prior, current),
  };
}

function closeEpisode(episodes, active, identity, endedAt, rightCensored = false) {
  const episode = active.get(identity);
  if (!episode) return;
  episodes.push({ ...episode, endedAt, rightCensored });
  active.delete(identity);
}

function closeAllEpisodes(episodes, active, endedAt) {
  [...active.keys()].forEach(identity =>
    closeEpisode(episodes, active, identity, endedAt, false));
}

function getResolvedDisplayedIds(observation) {
  return observation.displayed
    .map(item => item._studyIdentity)
    .filter(identity => identity?.identityState === 'IDENTITY_RESOLVED')
    .map(identity => identity.editorialIdentity);
}

function shouldCloseResidence(previous, current, maxGapMs, expectedVersion) {
  if (!previous) return false;
  if (current.runAt - previous.runAt > maxGapMs) return true;
  return !compareTopStoriesVersionSegments(previous, current, {
    normalizationVersion: expectedVersion,
  }).compatible;
}

function addCurrentResidence(active, episodes, observation, observationIndex, previousAt) {
  const currentIds = new Set(getResolvedDisplayedIds(observation));
  [...active.keys()]
    .filter(identity => !currentIds.has(identity))
    .forEach(identity => closeEpisode(
      episodes, active, identity, previousAt ?? observation.runAt, false,
    ));
  currentIds.forEach(identity => {
    if (active.has(identity)) {
      const episode = active.get(identity);
      episode.observationCount += 1;
      episode.lastObservedAt = observation.runAt;
      return;
    }
    const priorEpisodes = episodes.filter(item => item.editorialIdentity === identity);
    active.set(identity, {
      editorialIdentity: identity,
      episodeNumber: priorEpisodes.length + 1,
      startedAt: observation.runAt,
      lastObservedAt: observation.runAt,
      observationCount: 1,
      leftCensored: observationIndex === 0,
    });
  });
}

function buildResidenceEpisodes(observations, maxGapMs, expectedVersion) {
  const episodes = [];
  const active = new Map();
  let previous = null;
  observations.forEach((observation, observationIndex) => {
    const normalization = validateTopStoriesNormalizationEvidence(observation, {
      expectedNormalizationVersion: expectedVersion,
    });
    if (!normalization.eligible) {
      if (previous) closeAllEpisodes(episodes, active, previous.runAt);
      previous = null;
      return;
    }
    if (shouldCloseResidence(previous, observation, maxGapMs, expectedVersion)) {
      closeAllEpisodes(episodes, active, previous.runAt);
    }
    addCurrentResidence(active, episodes, observation, observationIndex, previous?.runAt);
    previous = observation;
  });
  if (previous) {
    [...active.keys()].forEach(identity =>
      closeEpisode(episodes, active, identity, previous.runAt, true));
  }
  return episodes;
}

function comparePairSet(pairSet, observationMap, options) {
  return pairSet.map(pair => buildIntervalComparison(
    observationMap.get(pair.anchorId),
    observationMap.get(pair.currentId),
    options.classifierPolicy,
    options.expectedNormalizationVersion,
  ));
}

export function analyzeTopStoriesSequence(observations = [], options = {}) {
  const expectedNormalizationVersion = options.studyConfig?.normalizationVersion ||
    options.expectedNormalizationVersion;
  const canonicalized = canonicalizeTopStoriesObservations(observations);
  const canonicalObservations = canonicalized.canonical
    .map(observation => normalizeObservation(observation, options))
    .filter(observation => observation.runAt !== null);
  const observationMap = new Map(canonicalObservations
    .map(observation => [observation.observationId, observation]));
  const comparisonOptions = { ...options, expectedNormalizationVersion };
  const adjacentComparisons = canonicalObservations.slice(1).map((current, index) =>
    buildIntervalComparison(
      canonicalObservations[index],
      current,
      options.classifierPolicy,
      expectedNormalizationVersion,
    ));
  const pairSets = buildStandardTopStoriesPairSets(canonicalObservations, {
    expectedNormalizationVersion,
  });
  return {
    canonicalObservations,
    operationalRecords: canonicalized.operationalRecords,
    adjacentComparisons,
    pairSets,
    pairComparisons: {
      fifteenMinute: comparePairSet(pairSets.fifteenMinute.pairs, observationMap, comparisonOptions),
      fifteenMinuteCanonical: comparePairSet(
        pairSets.fifteenMinute.canonicalPairs, observationMap, comparisonOptions,
      ),
      sixtyMinute: comparePairSet(pairSets.sixtyMinute.pairs, observationMap, comparisonOptions),
      sixtyMinuteCanonical: comparePairSet(
        pairSets.sixtyMinute.canonicalPairs, observationMap, comparisonOptions,
      ),
    },
    residenceEpisodes: buildResidenceEpisodes(
      canonicalObservations,
      options.maxResidenceGapMs || DEFAULT_MAX_RESIDENCE_GAP_MS,
      expectedNormalizationVersion,
    ),
    replayVersion: 'nw-top-stories-sequential-replay-v1',
  };
}
