import { getTopStoryDedupeKey } from './topStoriesCandidates.js';
import { explainTopStoryRank } from './topStoriesExplanation.js';
import { buildTopStorySelectionTrace } from './topStoriesTrace.js';
import { getStorySourceFamily } from './topStoriesSourceIdentity.js';

function getSourceKey(story = {}) {
  return getStorySourceFamily(story);
}

function getGeoKey(story = {}) {
  return String(
    story.region ||
    story.geo ||
    story.section ||
    story.sourceSection ||
    'unknown',
  ).toLowerCase();
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

function countMatches(chosen, predicate) {
  return chosen.reduce(
    (count, item) => count + (predicate(item) ? 1 : 0),
    0,
  );
}

function getSelectionBlockReason(item, chosen, policy) {
  const key = getTopStoryDedupeKey(item);
  if (chosen.some(existing => getTopStoryDedupeKey(existing) === key)) {
    return 'duplicate_identity';
  }

  const sourceCount = countMatches(
    chosen,
    existing => getSourceKey(existing) === getSourceKey(item),
  );
  if (sourceCount >= policy.diversity.maxPerSource) {
    return 'max_per_source';
  }

  const sectionCount = countMatches(
    chosen,
    existing => existing.section === item.section,
  );
  if (sectionCount >= policy.diversity.maxPerSection) {
    return 'max_per_section';
  }

  const geoCount = countMatches(
    chosen,
    existing => getGeoKey(existing) === getGeoKey(item),
  );
  if (geoCount >= policy.diversity.maxPerGeo) {
    return 'max_per_geo';
  }

  const clusterKey = item._topStoryRank?.clusterKey;
  const clusterCount = countMatches(
    chosen,
    existing => existing._topStoryRank?.clusterKey === clusterKey,
  );
  if (clusterCount >= policy.diversity.maxPerCluster) {
    return 'max_per_cluster';
  }

  return null;
}

function getAttemptList(attempts, item) {
  const key = getTopStoryDedupeKey(item);
  if (!attempts.has(key)) attempts.set(key, []);
  return attempts.get(key);
}

function fillSlots({
  chosen,
  pool,
  limit,
  policy,
  slotBand,
  attempts,
  poolName,
}) {
  for (const item of pool) {
    if (chosen.length >= limit) break;
    const reasonCode = getSelectionBlockReason(item, chosen, policy);
    getAttemptList(attempts, item).push({
      pool: poolName,
      status: reasonCode ? 'blocked' : 'selected',
      reasonCodes: reasonCode ? [reasonCode] : [],
    });
    if (reasonCode) continue;
    chosen.push(markSlot(
      item,
      slotBand || item._topStoryRank.slotBand,
    ));
  }
}

function normalizeDisplayDepth(options = {}) {
  const value = Number(options.displayDepth ?? 10);
  if (!Number.isFinite(value)) return 10;
  return Math.max(0, Math.floor(value));
}

export function selectTopStorySlotsWithTrace(
  ranked = [],
  options = {},
) {
  const policy = options.policy;
  const limit = Math.min(
    Number(options.limit || policy.limit),
    policy.limit,
  );
  const displayDepth = normalizeDisplayDepth(options);
  const chosen = [];
  const attempts = new Map();
  const primary = ranked.filter(
    item => item._topStoryRank.slotBand === 'primary',
  );
  const current = ranked.filter(
    item => ['primary', 'secondary'].includes(item._topStoryRank.slotBand),
  );
  const fallback = ranked.filter(
    item => item._topStoryRank.slotBand === 'fallback',
  );

  fillSlots({
    chosen,
    pool: primary,
    limit: policy.primaryLimit,
    policy,
    slotBand: 'primary',
    attempts,
    poolName: 'primary',
  });
  fillSlots({
    chosen,
    pool: current,
    limit,
    policy,
    attempts,
    poolName: 'current',
  });
  fillSlots({
    chosen,
    pool: fallback,
    limit,
    policy,
    slotBand: 'fallback',
    attempts,
    poolName: 'fallback',
  });

  const selected = chosen.slice(0, limit);
  return {
    selected,
    displayed: selected.slice(0, displayDepth),
    displayDepth,
    selectionTrace: buildTopStorySelectionTrace({
      ranked,
      selected,
      attempts,
      displayDepth,
      limit,
    }),
  };
}
