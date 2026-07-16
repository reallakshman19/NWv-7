import { TOP_STORIES_IDENTITY_STATES } from './topStoriesStudyIdentity.js';

function getIdentityRecord(item) {
  return item?._studyIdentity || item || {};
}

function getMetricIdentity(item) {
  if (typeof item === 'string') return item || null;
  const identity = getIdentityRecord(item);
  const state = identity.identityState;
  if (state && state !== TOP_STORIES_IDENTITY_STATES.RESOLVED) return null;
  return identity.editorialIdentity || null;
}

function uniqueMetricIds(items = []) {
  const excluded = [];
  const seen = new Set();
  const ids = [];
  items.forEach((item, index) => {
    const identity = getMetricIdentity(item);
    if (!identity) {
      excluded.push({ index, reason: 'identity_not_resolved' });
      return;
    }
    if (seen.has(identity)) return;
    seen.add(identity);
    ids.push(identity);
  });
  return { ids, excluded };
}

function ratio(numerator, denominator) {
  if (denominator === 0) return null;
  return numerator / denominator;
}

function intersect(left, right) {
  const rightSet = new Set(right);
  return left.filter(value => rightSet.has(value));
}

function getJaccard(left, right) {
  const union = new Set([...left, ...right]);
  if (union.size === 0) return null;
  return intersect(left, right).length / union.size;
}

function getTopRetention(priorIds, currentIds, depth) {
  const prior = priorIds.slice(0, depth);
  const current = new Set(currentIds.slice(0, depth));
  return ratio(prior.filter(id => current.has(id)).length, prior.length);
}

function getRankMap(ids) {
  return new Map(ids.map((identity, index) => [identity, index + 1]));
}

function getRankWeight(rank) {
  return 1 / Math.log2(rank + 1);
}

function getWeightedRankDisplacement(priorIds, currentIds) {
  const union = [...new Set([...priorIds, ...currentIds])];
  if (union.length === 0) return null;
  const priorRanks = getRankMap(priorIds);
  const currentRanks = getRankMap(currentIds);
  const maxLength = Math.max(priorIds.length, currentIds.length, 1);
  const missingRank = maxLength + 1;
  let weightedDistance = 0;
  let totalWeight = 0;

  union.forEach(identity => {
    const priorRank = priorRanks.get(identity) || missingRank;
    const currentRank = currentRanks.get(identity) || missingRank;
    const visibleRank = Math.min(priorRank, currentRank);
    const weight = getRankWeight(visibleRank);
    weightedDistance += weight * (Math.abs(currentRank - priorRank) / maxLength);
    totalWeight += weight;
  });
  return totalWeight > 0 ? Math.min(1, weightedDistance / totalWeight) : null;
}

function getNumberOneContinuity(priorIds, currentIds) {
  if (priorIds.length === 0) return null;
  if (currentIds.length === 0) return false;
  return priorIds[0] === currentIds[0];
}

export function compareDisplayedTopStories(priorItems = [], currentItems = []) {
  const prior = uniqueMetricIds(priorItems);
  const current = uniqueMetricIds(currentItems);
  const retainedIds = intersect(prior.ids, current.ids);
  const priorSet = new Set(prior.ids);
  const currentSet = new Set(current.ids);
  const entrantIds = current.ids.filter(identity => !priorSet.has(identity));
  const exitIds = prior.ids.filter(identity => !currentSet.has(identity));

  return {
    priorCount: prior.ids.length,
    currentCount: current.ids.length,
    retainedCount: retainedIds.length,
    incumbentRetention: ratio(retainedIds.length, prior.ids.length),
    newListContinuity: ratio(retainedIds.length, current.ids.length),
    jaccard: getJaccard(prior.ids, current.ids),
    countDelta: current.ids.length - prior.ids.length,
    entrantCount: entrantIds.length,
    exitCount: exitIds.length,
    entrantIds,
    exitIds,
    retainedIds,
    top3Retention: getTopRetention(prior.ids, current.ids, 3),
    numberOneContinuity: getNumberOneContinuity(prior.ids, current.ids),
    normalizedWeightedRankDisplacement:
      getWeightedRankDisplacement(prior.ids, current.ids),
    priorIdentityIds: prior.ids,
    currentIdentityIds: current.ids,
    excludedPriorItems: prior.excluded,
    excludedCurrentItems: current.excluded,
    metricVersion: 'nw-top-stories-stability-metrics-v1',
  };
}
