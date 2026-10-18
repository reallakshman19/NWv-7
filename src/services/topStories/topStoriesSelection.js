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

function getSelectionBlockReason(item, chosen, policy, displayDepth = 0) {
  const key = getTopStoryDedupeKey(item);
  if (chosen.some(existing => getTopStoryDedupeKey(existing) === key)) {
    return 'duplicate_identity';
  }

  const sourceCount = countMatches(
    chosen,
    existing => getSourceKey(existing) === getSourceKey(item),
  );
  const sectionCount = countMatches(
    chosen,
    existing => existing.section === item.section,
  );
  const geoCount = countMatches(
    chosen,
    existing => getGeoKey(existing) === getGeoKey(item),
  );
  const insideDisplayWindow = displayDepth > 0 && chosen.length < displayDepth;

  if (
    insideDisplayWindow &&
    sourceCount >= Number(policy.diversity.displayMaxPerSource || policy.diversity.maxPerSource)
  ) {
    return 'display_max_per_source';
  }
  if (
    insideDisplayWindow &&
    sectionCount >= Number(policy.diversity.displayMaxPerSection || policy.diversity.maxPerSection)
  ) {
    return 'display_max_per_section';
  }
  if (
    insideDisplayWindow &&
    geoCount >= Number(policy.diversity.displayMaxPerGeo || policy.diversity.maxPerGeo)
  ) {
    return 'display_max_per_geo';
  }

  if (sourceCount >= policy.diversity.maxPerSource) {
    return 'max_per_source';
  }
  if (sectionCount >= policy.diversity.maxPerSection) {
    return 'max_per_section';
  }
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

function isDisplayOnlyBlock(reasonCode) {
  return String(reasonCode || '').startsWith('display_');
}

function drainDeferredDisplay({
  chosen,
  deferredDisplay,
  limit,
  policy,
  attempts,
}) {
  if (!Array.isArray(deferredDisplay) || deferredDisplay.length === 0) return;

  const pending = deferredDisplay.splice(0, deferredDisplay.length);
  for (const entry of pending) {
    if (chosen.length >= limit) {
      deferredDisplay.push(entry);
      continue;
    }

    const reasonCode = getSelectionBlockReason(entry.item, chosen, policy, 0);
    getAttemptList(attempts, entry.item).push({
      pool: `${entry.poolName}:deferred`,
      status: reasonCode ? 'blocked' : 'selected',
      reasonCodes: reasonCode ? [reasonCode] : [],
    });
    if (reasonCode) continue;

    chosen.push(markSlot(
      entry.item,
      entry.slotBand || entry.item._topStoryRank.slotBand,
    ));
  }
}

function fillSlots({
  chosen,
  pool,
  limit,
  policy,
  slotBand,
  attempts,
  poolName,
  displayDepth,
  deferredDisplay,
}) {
  if (chosen.length >= displayDepth) {
    drainDeferredDisplay({
      chosen,
      deferredDisplay,
      limit,
      policy,
      attempts,
    });
  }

  for (const item of pool) {
    if (chosen.length >= limit) break;
    const reasonCode = getSelectionBlockReason(item, chosen, policy, displayDepth);
    getAttemptList(attempts, item).push({
      pool: poolName,
      status: reasonCode ? 'blocked' : 'selected',
      reasonCodes: reasonCode ? [reasonCode] : [],
    });
    if (reasonCode) {
      if (isDisplayOnlyBlock(reasonCode)) {
        deferredDisplay.push({ item, slotBand, poolName });
      }
      continue;
    }

    chosen.push(markSlot(
      item,
      slotBand || item._topStoryRank.slotBand,
    ));

    if (chosen.length >= displayDepth) {
      drainDeferredDisplay({
        chosen,
        deferredDisplay,
        limit,
        policy,
        attempts,
      });
    }
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
  const deferredDisplay = [];
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
    displayDepth,
    deferredDisplay,
  });
  fillSlots({
    chosen,
    pool: current,
    limit,
    policy,
    attempts,
    poolName: 'current',
    displayDepth,
    deferredDisplay,
  });
  fillSlots({
    chosen,
    pool: fallback,
    limit,
    policy,
    slotBand: 'fallback',
    attempts,
    poolName: 'fallback',
    displayDepth,
    deferredDisplay,
  });

  if (chosen.length >= displayDepth) {
    drainDeferredDisplay({
      chosen,
      deferredDisplay,
      limit,
      policy,
      attempts,
    });
  }

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
