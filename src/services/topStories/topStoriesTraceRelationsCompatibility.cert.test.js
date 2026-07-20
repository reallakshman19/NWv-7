import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildTopStoryCandidatesWithTrace,
  getTopStoryDedupeKey,
  listTopStorySourceRows,
  TOP_STORY_SOURCE_LANES,
} from './topStoriesCandidates.js';
import { evaluateTopStories } from './topStoriesRanker.js';
import { TOP_STORY_TRACE_SCHEMA_VERSION } from './topStoriesTrace.js';
import {
  buildTopStoriesRunSnapshot,
  RUN_SNAPSHOT_SCHEMA_VERSION,
} from '../../../scripts/top-stories-shadow/snapshotBuilder.mjs';
import {
  buildTopStoriesTraceRelations,
  TOP_STORIES_TRACE_RELATION_SCHEMA_VERSION,
} from '../../../scripts/top-stories-shadow/traceRelations.mjs';

const NOW = Date.UTC(2026, 6, 20, 8, 0, 0);
const CONFIG = JSON.parse(readFileSync(
  new URL('../../../config/top_stories_shadow_study.json', import.meta.url),
  'utf8',
));
function story(id, extra = {}) {
  return {
    id,
    canonicalId: `canonical-${id}`,
    title: `Flood evacuation alert ${id}`,
    source: `Source ${id}`,
    sourceGroup: `source-${id}`,
    publishedAt: NOW - (60 * 60 * 1000),
    timestampConfidence: 'high',
    sourceCount: 2,
    ...extra,
  };
}
function bundle(extra = {}) {
  return {
    sectionItems: { world: [story('a'), story('b')] },
    topFeedItems: [],
    settings: {},
    sourceHealth: { ok: true, complete: true, failedSourceCount: 0 },
    inputSource: 'repository-public-newsdata-sections',
    inputSnapshotGeneratedAt: '2026-07-20T07:55:00.000Z',
    ...extra,
  };
}
function metadata() {
  return {
    repositorySha: 'abc123def456',
    workflowRunId: '460001',
    workflowRunAttempt: 1,
    scheduledAt: '2026-07-20T07:52:00.000Z',
    runAt: new Date(NOW).toISOString(),
  };
}
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}
function legacyRows(sectionItems, topFeedItems) {
  const sections = Array.isArray(sectionItems)
    ? sectionItems
    : Object.values(sectionItems || {}).flatMap(value => Array.isArray(value) ? value : []);
  return [...sections, ...(Array.isArray(topFeedItems) ? topFeedItems : [])];
}
function mergeDuplicate(existing, next) {
  return {
    ...existing,
    sourceCount: Math.max(Number(existing.sourceCount || 1), Number(next.sourceCount || 1)),
    clusteredItems: Math.max(
      Number(existing.clusteredItems || 1),
      Number(next.clusteredItems || 1),
    ),
    allSources: [...new Set([
      ...(existing.allSources || []), ...(next.allSources || []),
      existing.source, next.source,
    ].filter(Boolean))],
  };
}
function legacyBuild(input = {}) {
  const rows = legacyRows(input.sectionItems, input.topFeedItems);
  const merged = new Map();
  const candidateBuildTrace = [];
  rows.forEach((item, index) => {
    const key = item && typeof item === 'object' ? getTopStoryDedupeKey(item) : '';
    const disposition = !item || typeof item !== 'object' || !key
      ? 'INVALID_INPUT'
      : merged.has(key) ? 'COLLAPSED_AS_DUPLICATE' : 'PROMOTED_TO_CANDIDATE';
    const reasonCode = disposition === 'INVALID_INPUT'
      ? (!item || typeof item !== 'object' ? 'invalid_input' : 'missing_identity')
      : disposition === 'COLLAPSED_AS_DUPLICATE' ? 'duplicate_identity' : 'candidate_created';
    if (disposition === 'PROMOTED_TO_CANDIDATE') {
      merged.set(key, { ...item, _candidateSeenAt: input.nowMs });
    } else if (disposition === 'COLLAPSED_AS_DUPLICATE') {
      merged.set(key, mergeDuplicate(merged.get(key), { ...item, _candidateSeenAt: input.nowMs }));
    }
    candidateBuildTrace.push({
      sourceRowIndex: index,
      sourceRowKey: key || `row:${index}`,
      populationUnit: 'SOURCE_ROW',
      outputUnit: disposition === 'PROMOTED_TO_CANDIDATE' ? 'RANKING_CANDIDATE' : null,
      buildDisposition: disposition,
      reasonCode,
      representativeKey: disposition === 'INVALID_INPUT' ? null : key,
    });
  });
  return { rawInputCount: rows.length, candidates: [...merged.values()], candidateBuildTrace };
}

describe('NW-RANK-012C compatibility and publication', () => {
  it('lists the exact candidate source lanes in existing order', () => {
    const rows = listTopStorySourceRows({
      sectionItems: { world: [story('world')], tech: [story('tech')] },
      topFeedItems: [story('top')],
    });
    expect(rows.map(row => [row.sourceLane, row.sourceSectionKey, row.sourceRowIndex]))
      .toEqual([
        [TOP_STORY_SOURCE_LANES.SECTION_ITEMS_OBJECT, 'world', 0],
        [TOP_STORY_SOURCE_LANES.SECTION_ITEMS_OBJECT, 'tech', 1],
        [TOP_STORY_SOURCE_LANES.TOP_FEED_ITEMS, null, 2],
      ]);
    const arrayRows = listTopStorySourceRows({ sectionItems: [story('array')] });
    expect(arrayRows[0].sourceLane).toBe(TOP_STORY_SOURCE_LANES.SECTION_ITEMS_ARRAY);
  });

  it('preserves legacy candidate output and trace deeply', () => {
    const input = {
      sectionItems: { world: [story('same'), story('same'), null, {}] },
      topFeedItems: [story('top')],
      nowMs: NOW,
    };
    expect(buildTopStoryCandidatesWithTrace(input)).toEqual(legacyBuild(input));
  });

  it('is deterministic under source permutation when evaluation is unchanged', () => {
    const same = story('same');
    const firstInput = { sectionItems: { world: [same, same, story('b')] },
      topFeedItems: [], nowMs: NOW };
    const secondInput = { sectionItems: { world: [same, story('b'), same] },
      topFeedItems: [], nowMs: NOW };
    const firstEvaluation = evaluateTopStories(firstInput, { nowMs: NOW });
    const secondEvaluation = evaluateTopStories(secondInput, { nowMs: NOW });
    expect(secondEvaluation.candidates).toEqual(firstEvaluation.candidates);
    const first = buildTopStoriesTraceRelations({
      inputBundle: firstInput, evaluation: firstEvaluation,
    });
    const second = buildTopStoriesTraceRelations({
      inputBundle: secondInput, evaluation: secondEvaluation,
    });
    expect(second).toEqual(first);
  });

  it('publishes v3 additively without changing evaluator evidence', () => {
    const input = deepFreeze(bundle());
    const snapshot = buildTopStoriesRunSnapshot({
      studyConfig: deepFreeze({ ...CONFIG }), inputBundle: input, metadata: metadata(),
    });
    const direct = evaluateTopStories({ ...input, nowMs: NOW }, {
      limit: CONFIG.rankerLimit,
      displayDepth: CONFIG.displayDepth,
      nowMs: NOW,
    });
    expect(snapshot.schemaVersion).toBe(RUN_SNAPSHOT_SCHEMA_VERSION);
    expect(snapshot.candidateTraceSchemaVersion).toBe(TOP_STORY_TRACE_SCHEMA_VERSION);
    expect(snapshot.traceRelationSchemaVersion)
      .toBe(TOP_STORIES_TRACE_RELATION_SCHEMA_VERSION);
    expect(snapshot.traceRelations.schemaVersion)
      .toBe(TOP_STORIES_TRACE_RELATION_SCHEMA_VERSION);
    expect(snapshot.rankedIds).toEqual(direct.rankedIds);
    expect(snapshot.displayedTopNIds).toEqual(direct.displayedTopNIds);
    expect(snapshot.candidateBuildTrace).toEqual(direct.candidateBuildTrace);
    expect(snapshot.selectionTrace).toEqual(direct.selectionTrace);
    expect(snapshot.policySnapshot).toEqual(direct.policySnapshot);
    expect(snapshot.traceRelations.accountingConserved).toBe(true);
    expect(snapshot.traceRelations.accountingDelta).toBe(0);
    expect(input.sectionItems.world[0]._candidateSeenAt).toBeUndefined();
  });

  it('serializes identical snapshots deterministically', () => {
    const args = { studyConfig: CONFIG, inputBundle: bundle(), metadata: metadata() };
    expect(buildTopStoriesRunSnapshot(args)).toEqual(buildTopStoriesRunSnapshot(args));
  });

  it('guards shared authority and prohibited identity fallbacks statically', () => {
    const candidatesSource = readFileSync(
      new URL('./topStoriesCandidates.js', import.meta.url), 'utf8');
    const relationsSource = readFileSync(
      new URL('../../../scripts/top-stories-shadow/traceRelations.mjs', import.meta.url),
      'utf8',
    );
    expect(candidatesSource).toMatch(
      /const rows = listTopStorySourceRows\(\{ sectionItems, topFeedItems \}\)/,
    );
    expect(relationsSource).toContain('listTopStorySourceRows(inputBundle)');
    expect(relationsSource).toContain('getEditorialIdentityCandidateId(candidate)');
    expect(relationsSource).not.toMatch(/Math\.random|Date\.now/);
    const identityStart = relationsSource.indexOf('function sourceIdentity');
    const identityEnd = relationsSource.indexOf('\n}', identityStart) + 2;
    const sourceIdentity = relationsSource.slice(identityStart, identityEnd);
    expect(sourceIdentity).not.toMatch(/sourceRowIndex|rank|workflowRun|scheduledAt|runAt/);
  });
});
