const MINUTE = 60 * 1000;

export const TOP_STORIES_PAIR_WINDOWS = Object.freeze({
  fifteenMinute: {
    horizonMs: 15 * MINUTE,
    minIntervalMs: 8 * MINUTE,
    maxIntervalMs: 30 * MINUTE,
  },
  sixtyMinute: {
    horizonMs: 60 * MINUTE,
    minIntervalMs: 45 * MINUTE,
    maxIntervalMs: 75 * MINUTE,
  },
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

function getSegmentKey(observation = {}) {
  return [
    observation.studyId || 'study',
    observation.rankerVersion || 'ranker',
    observation.identityVersion || 'identity',
    observation.periodClassifierVersion || 'period',
  ].join('|');
}

function getEligibilityReason(observation = {}) {
  if (getRunAt(observation) === null) return 'invalid_run_at';
  if (observation.completenessState && observation.completenessState !== 'COMPLETE') {
    return 'incomplete_observation';
  }
  if (observation.analyticalEligibility && observation.analyticalEligibility !== 'ELIGIBLE') {
    return 'analytically_ineligible';
  }
  return null;
}

function sortObservations(observations = []) {
  return observations
    .map((observation, index) => ({ observation, index, runAt: getRunAt(observation) }))
    .sort((left, right) => (left.runAt ?? Infinity) - (right.runAt ?? Infinity) || left.index - right.index);
}

function choosePairCandidate(anchor, rows, startIndex, config) {
  const candidates = [];
  for (let index = startIndex; index < rows.length; index += 1) {
    const current = rows[index];
    if (current.runAt === null) continue;
    const intervalMs = current.runAt - anchor.runAt;
    if (intervalMs > config.maxIntervalMs) break;
    if (intervalMs < config.minIntervalMs) continue;
    if (getEligibilityReason(current.observation)) continue;
    if (getSegmentKey(anchor.observation) !== getSegmentKey(current.observation)) continue;
    candidates.push({
      current,
      intervalMs,
      distanceMs: Math.abs(intervalMs - config.horizonMs),
    });
  }
  return candidates.sort((left, right) =>
    left.distanceMs - right.distanceMs ||
    left.current.runAt - right.current.runAt ||
    left.current.index - right.current.index,
  )[0] || null;
}

export function buildTopStoriesObservationPairs(observations = [], config = {}) {
  const effective = {
    ...TOP_STORIES_PAIR_WINDOWS.fifteenMinute,
    ...config,
  };
  const rows = sortObservations(observations);
  const pairs = [];
  const exclusions = [];

  rows.forEach((anchor, index) => {
    const reason = getEligibilityReason(anchor.observation);
    if (reason) {
      exclusions.push({
        anchorId: getObservationId(anchor.observation, anchor.index),
        reason,
      });
      return;
    }
    const selected = choosePairCandidate(anchor, rows, index + 1, effective);
    if (!selected) {
      exclusions.push({
        anchorId: getObservationId(anchor.observation, anchor.index),
        reason: 'no_valid_subsequent_observation_in_window',
      });
      return;
    }
    pairs.push({
      anchorId: getObservationId(anchor.observation, anchor.index),
      currentId: getObservationId(selected.current.observation, selected.current.index),
      anchor: anchor.observation,
      current: selected.current.observation,
      anchorAt: anchor.runAt,
      currentAt: selected.current.runAt,
      intervalMs: selected.intervalMs,
      targetHorizonMs: effective.horizonMs,
      intervalErrorMs: selected.distanceMs,
      segmentKey: getSegmentKey(anchor.observation),
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
    left.anchorAt - right.anchorAt || left.currentAt - right.currentAt,
  );
  const canonical = [];
  let occupiedUntil = -Infinity;
  sorted.forEach(pair => {
    if (pair.anchorAt < occupiedUntil) return;
    canonical.push(pair);
    occupiedUntil = pair.currentAt;
  });
  return canonical;
}

export function buildStandardTopStoriesPairSets(observations = []) {
  const fifteen = buildTopStoriesObservationPairs(
    observations,
    TOP_STORIES_PAIR_WINDOWS.fifteenMinute,
  );
  const sixty = buildTopStoriesObservationPairs(
    observations,
    TOP_STORIES_PAIR_WINDOWS.sixtyMinute,
  );
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
