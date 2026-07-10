import { rankTopStories, scoreTopStoryCandidate } from './topStoriesRanker.js';
import { explainTopStoriesList } from './topStoriesExplainability.js';
import {
  TOP_STORIES_REGRESSION_INPUT,
  TOP_STORIES_REGRESSION_STORIES,
} from './fixtures/topStoriesRegressionFixtures.js';
import { TOP_STORIES_GOLDEN_REVIEW_SNAPSHOT } from './fixtures/topStoriesGoldenReviewSnapshot.js';

const REQUIRED_EXPLANATION_FIELDS = Object.freeze([
  'rank',
  'id',
  'title',
  'score',
  'slotBand',
  'eventType',
  'freshnessScore',
  'consensusScore',
  'penalties',
  'sourceCount',
  'topFeedHits',
  'clusterKey',
  'nonPrimaryReason',
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function round(value, digits = 3) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function sortedObject(counts = {}) {
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function countBy(rows = [], key) {
  const counts = {};
  rows.forEach(row => {
    const value = row?.[key] || 'unknown';
    counts[value] = (counts[value] || 0) + 1;
  });
  return sortedObject(counts);
}

function uniqueSorted(values = []) {
  return [...new Set(values.filter(Boolean))].sort();
}

function flattenSectionItems(sectionItems = {}) {
  if (Array.isArray(sectionItems)) return sectionItems;
  return Object.values(sectionItems || {}).flatMap(asArray);
}

function stableExplanationRow(row = {}) {
  return {
    rank: row.rank,
    id: row.id,
    title: row.title,
    slotBand: row.slotBand,
    eventType: row.eventType,
    score: round(row.score),
    freshnessScore: round(row.freshnessScore),
    consensusScore: round(row.consensusScore),
    penalties: round(row.penalties),
    sourceCount: Number(row.sourceCount || 0),
    topFeedHits: round(row.topFeedHits),
    clusterKey: row.clusterKey || '',
    nonPrimaryReason: row.nonPrimaryReason,
  };
}

function scoreFixtureStories(input = {}) {
  const nowMs = input.nowMs || TOP_STORIES_REGRESSION_INPUT.nowMs;
  return flattenSectionItems(input.sectionItems || TOP_STORIES_REGRESSION_INPUT.sectionItems)
    .map(story => scoreTopStoryCandidate(story, { nowMs }));
}

function duplicateClusterEvidence(rankedRows = [], sourceStories = TOP_STORIES_REGRESSION_STORIES) {
  const clusterMap = new Map();
  sourceStories.forEach(story => {
    const clusterKey = story.clusterId;
    if (!clusterKey) return;
    if (!clusterMap.has(clusterKey)) clusterMap.set(clusterKey, []);
    clusterMap.get(clusterKey).push(story.id);
  });
  return [...clusterMap.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([clusterKey, ids]) => ({
      clusterKey,
      representativeId: rankedRows.find(row => row.clusterKey === clusterKey)?.id || null,
      candidateIds: uniqueSorted(ids),
    }))
    .sort((a, b) => a.clusterKey.localeCompare(b.clusterKey));
}

function hasRequiredFields(row = {}) {
  return REQUIRED_EXPLANATION_FIELDS.filter(field => !(field in row));
}

function summarizeCore(snapshot = {}) {
  return {
    fixtureVersion: snapshot.fixtureVersion,
    rankedIdsInOrder: snapshot.rankedIdsInOrder || [],
    slotBandCounts: snapshot.slotBandCounts || {},
    eventTypeCounts: snapshot.eventTypeCounts || {},
    topFeedBoostedIds: snapshot.topFeedBoostedIds || [],
    penalizedIds: snapshot.penalizedIds || [],
    rejectedExpiredIds: snapshot.rejectedExpiredIds || [],
  };
}

function compareJson(label, actual, expected, errors) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    errors.push(`${label} drift`);
  }
}

export function buildTopStoriesAuditSnapshot(input = TOP_STORIES_REGRESSION_INPUT, options = {}) {
  const ranked = rankTopStories(input, { limit: options.limit || 25 });
  const explanationRows = explainTopStoriesList(ranked).map(stableExplanationRow);
  const allScored = scoreFixtureStories(input);
  return {
    fixtureVersion: options.fixtureVersion || 'NW-RANK-004.actual.v1',
    fixtureTimestamp: input.nowMs || TOP_STORIES_REGRESSION_INPUT.nowMs,
    rankedIdsInOrder: explanationRows.map(row => row.id),
    slotBandCounts: countBy(explanationRows, 'slotBand'),
    eventTypeCounts: countBy(explanationRows, 'eventType'),
    topFeedBoostedIds: uniqueSorted(explanationRows.filter(row => row.topFeedHits > 0).map(row => row.id)),
    penalizedIds: uniqueSorted([
      ...explanationRows.filter(row => row.penalties > 0).map(row => row.id),
      ...allScored.filter(row => Number(row._topStoryRank?.penalties || 0) > 0).map(row => row.id),
    ]),
    rejectedExpiredIds: uniqueSorted(allScored
      .filter(row => ['rejected', 'expired'].includes(row._topStoryRank?.slotBand))
      .map(row => row.id)),
    duplicateClusterRepresentatives: duplicateClusterEvidence(explanationRows, flattenSectionItems(input.sectionItems)),
    explanationRows,
  };
}

export function buildTopStoriesGoldenReviewSnapshot() {
  return TOP_STORIES_GOLDEN_REVIEW_SNAPSHOT;
}

export function compareTopStoriesAuditSnapshots(actual = {}, expected = {}) {
  const errors = [];
  const warnings = [];
  compareJson('ranked ID order', actual.rankedIdsInOrder, expected.rankedIdsInOrder, errors);
  compareJson('slot band counts', actual.slotBandCounts, expected.slotBandCounts, errors);
  compareJson('event type counts', actual.eventTypeCounts, expected.eventTypeCounts, errors);
  compareJson('top-feed boosted IDs', actual.topFeedBoostedIds, expected.topFeedBoostedIds, errors);
  compareJson('penalized IDs', actual.penalizedIds, expected.penalizedIds, errors);
  compareJson('rejected/expired IDs', actual.rejectedExpiredIds, expected.rejectedExpiredIds, errors);
  compareJson('duplicate-cluster representatives', actual.duplicateClusterRepresentatives, expected.duplicateClusterRepresentatives, errors);

  asArray(actual.explanationRows).forEach((row, index) => {
    const missing = hasRequiredFields(row);
    if (missing.length > 0) errors.push(`actual explanation row ${index + 1} missing fields: ${missing.join(', ')}`);
  });
  asArray(expected.explanationRows).forEach((row, index) => {
    const missing = hasRequiredFields(row);
    if (missing.length > 0) errors.push(`expected explanation row ${index + 1} missing fields: ${missing.join(', ')}`);
  });
  if ((actual.explanationRows || []).length !== (expected.explanationRows || []).length) {
    errors.push('explanation row count drift');
  }
  if (actual.fixtureTimestamp !== expected.fixtureTimestamp) warnings.push('fixture timestamp drift');
  if (actual.fixtureVersion !== expected.fixtureVersion) warnings.push('fixture version differs');
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    actualSummary: summarizeCore(actual),
    expectedSummary: summarizeCore(expected),
  };
}

export function summarizeTopStoriesAuditSnapshot(snapshot = {}) {
  return summarizeCore(snapshot);
}
