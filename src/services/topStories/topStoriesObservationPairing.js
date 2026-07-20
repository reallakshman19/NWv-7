import {
  buildTopStoriesVersionSegmentKey,
  compareTopStoriesVersionSegments,
  TOP_STORIES_NORMALIZATION_REASON_CODES,
  validateTopStoriesNormalizationEvidence,
} from './topStoriesVersionSegment.js';

const MINUTE = 60 * 1000;

export const TOP_STORIES_PAIR_WINDOWS = Object.freeze({
  fifteenMinute: Object.freeze({
    horizonMs: 15 * MINUTE,
    minIntervalMs: 8 * MINUTE,
    maxIntervalMs: 30 * MINUTE,
  }),
  sixtyMinute: Object.freeze({
    horizonMs: 60 * MINUTE,
    minIntervalMs: 45 * MINUTE,
    maxIntervalMs: 75 * MINUTE,
  }),
});

function getRunAt(observation = {}) {
  const raw = observation.runAt ?? observation.observedAt;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const parsed = Date.parse(raw || 0);
  return Number.isNaN(parsed) ? null : parsed;
}

function getObservationId(observation = {}, index = 0) {
  return observation.observationId ||
    `${observation.studyId || 'study'}:${observation.scheduledAt || getRunAt(observation) || index}`;
}

function getEligibilityReason(observation = {}, expectedNormalizationVersion) {
  if (getRunAt(observation) === null) return 'invalid_run_at';
  if (observation.completenessState && observation.completenessState !== 'COMPLETE') {
    return 'incomplete_observation';
  }
  if (observation.analyticalEligibility && observation.analyticalEligibility !== 'ELIGIBLE') {
    return 'analytically_ineligible';
  }
  return validateTopStoriesNormalizationEvidence(observation, {
    expectedNormalizationVersion,
  }).reasonCodes[0] || null;
}

function sortObservations(observations = []) {
  return observations
    .map((observation, index) => ({ observation, index, runAt: getRunAt(observation) }))
    .sort((left, right) =>
      (left.runAt ?? Infinity) - (right.runAt ?? Infinity) || left.index - right.index);
}

function choosePairCandidate(anchor, rows, startIndex, config) {
  const candidates = [];
  let normalizationBoundary = false;
  for (let index = startIndex; index < rows.length; index += 1) {
    const current = rows[index];
    if (current.runAt === null) continue;
    const intervalMs = current.runAt - anchor.runAt;
    if (intervalMs > config.maxIntervalMs) break;
    if (intervalMs < config.minIntervalMs) continue;
    if (anchor.observation.normalizationVersion && current.observation.normalizationVersion &&
      anchor.observation.normalizationVersion !== current.observation.normalizationVersion) {
      normalizationBoundary = true;
      continue;
    }
    if (getEligibilityReason(current.observation, config.expectedNormalizationVersion)) continue;
    const compatibility = compareTopStoriesVersionSegments(
      anchor.observation,
      current.observation,
      { normalizationVersion: config.expectedNormalizationVersion },
    );
    if (!compatibility.compatible) {
      if (compatibility.reasonCodes.includes(
        TOP_STORIES_NORMALIZATION_REASON_CODES.versionBoundary,
      )) normalizationBoundary = true;
      continue;
    }
    candidates.push({
      current,
      intervalMs,
      distanceMs: Math.abs(intervalMs - config.horizonMs),
    });
  }
  return {
    selected: candidates.sort((left, right) =>
      left.distanceMs - right.distanceMs ||
      left.current.runAt - right.current.runAt ||
      left.current.index - right.current.index)[0] || null,
    normalizationBoundary,
  };
}

export function buildTopStoriesObservationPairs(observations = [], config = {}) {
  const effective = { ...TOP_STORIES_PAIR_WINDOWS.fifteenMinute, ...config };
  const rows = sortObservations(observations);
  const pairs = [];
  const exclusions = [];

  rows.forEach((anchor, index) => {
    const reason = getEligibilityReason(
      anchor.observation,
      effective.expectedNormalizationVersion,
    );
    if (reason) {
      exclusions.push({ anchorId: getObservationId(anchor.observation, anchor.index), reason });
      return;
    }
    const result = choosePairCandidate(anchor, rows, index + 1, effective);
    if (!result.selected) {
      exclusions.push({
        anchorId: getObservationId(anchor.observation, anchor.index),
        reason: result.normalizationBoundary
          ? TOP_STORIES_NORMALIZATION_REASON_CODES.versionBoundary
          : 'no_valid_subsequent_observation_in_window',
      });
      return;
    }
    pairs.push({
      anchorId: getObservationId(anchor.observation, anchor.index),
      currentId: getObservationId(
        result.selected.current.observation,
        result.selected.current.index,
      ),
      anchor: anchor.observation,
      current: result.selected.current.observation,
      anchorAt: anchor.runAt,
      currentAt: result.selected.current.runAt,
      intervalMs: result.selected.intervalMs,
      targetHorizonMs: effective.horizonMs,
      intervalErrorMs: result.selected.distanceMs,
      segmentKey: buildTopStoriesVersionSegmentKey(anchor.observation),
    });
  });

  return {
    pairs,
    exclusions,
    config: effective,
    serialCorrelationNotice:
      'Overlapping pairs are serially correlated and are not independent experiments.',
  };
}

export function buildCanonicalNonOverlappingPairs(pairs = []) {
  const sorted = [...pairs].sort((left, right) =>
    left.anchorAt - right.anchorAt || left.currentAt - right.currentAt);
  const canonical = [];
  let occupiedUntil = -Infinity;
  sorted.forEach(pair => {
    if (pair.anchorAt < occupiedUntil) return;
    canonical.push(pair);
    occupiedUntil = pair.currentAt;
  });
  return canonical;
}

export function buildStandardTopStoriesPairSets(observations = [], options = {}) {
  const build = window => buildTopStoriesObservationPairs(observations, {
    ...window,
    expectedNormalizationVersion: options.expectedNormalizationVersion,
  });
  const fifteen = build(TOP_STORIES_PAIR_WINDOWS.fifteenMinute);
  const sixty = build(TOP_STORIES_PAIR_WINDOWS.sixtyMinute);
  return {
    fifteenMinute: {
      ...fifteen,
      canonicalPairs: buildCanonicalNonOverlappingPairs(fifteen.pairs),
    },
    sixtyMinute: {
      ...sixty,
      canonicalPairs: buildCanonicalNonOverlappingPairs(sixty.pairs),
    },
  };
}
