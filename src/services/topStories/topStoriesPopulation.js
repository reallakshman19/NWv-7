import { deduplicateAndCluster } from '../../utils/similarity.js';

/**
 * Build the cross-section population consumed by the Top Stories ranker.
 *
 * Legacy per-section impactScore is intentionally neutralized before clustering.
 * That score belongs to the old section ranker and must not decide which publisher
 * row becomes the representative that the observed Top Stories ranker re-scores.
 */
export function buildTopStoriesClusterPopulation(items = [], dedupeOptions = 0.75) {
  const neutralized = (Array.isArray(items) ? items : [])
    .filter(item => item && typeof item === 'object')
    .map(item => ({
      ...item,
      impactScore: 0,
    }));

  return deduplicateAndCluster(neutralized, dedupeOptions);
}

export function buildTopStoriesRankingSections(items = [], dedupeOptions = 0.75) {
  return {
    __all: buildTopStoriesClusterPopulation(items, dedupeOptions),
  };
}
