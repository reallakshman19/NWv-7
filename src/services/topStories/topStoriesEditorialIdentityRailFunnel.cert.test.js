import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderTopStoriesDailyMarkdown } from '../../../scripts/top-stories-shadow/dailyReportMarkdown.mjs';
import {
  buildEditorialIdentityFunnelStage,
  EDITORIAL_IDENTITY_FUNNEL_STAGE,
  EDITORIAL_IDENTITY_POPULATION_ROLE,
  EDITORIAL_IDENTITY_POPULATION_SCHEMA_VERSION_V1,
  EDITORIAL_IDENTITY_POPULATION_SCHEMA_VERSION_V2,
  EDITORIAL_IDENTITY_UNIT,
} from '../../../scripts/top-stories-shadow/editorialIdentityPopulation.mjs';
import { buildEditorialIdentityRelations } from '../../../scripts/top-stories-shadow/editorialIdentityRelations.mjs';
import { buildTopStoriesRailFunnelAnalytics } from '../../../scripts/top-stories-shadow/railFunnelAnalytics.mjs';
import { buildTopStoriesRunSnapshot } from '../../../scripts/top-stories-shadow/snapshotBuilder.mjs';
import { evaluateTopStories } from './topStoriesRanker.js';
import {
  TOP_STORIES_IDENTITY_STATES,
  TOP_STORIES_IDENTITY_VERSION,
} from './topStoriesStudyIdentity.js';

const RUN_AT = '2026-07-19T12:00:00.000Z';
const RUN_MS = Date.parse(RUN_AT);
const CONFIG = JSON.parse(readFileSync(
  new URL('../../../config/top_stories_shadow_study.json', import.meta.url),
  'utf8',
));

function v1Population() {
  return {
    schemaVersion: EDITORIAL_IDENTITY_POPULATION_SCHEMA_VERSION_V1,
    populationRole: EDITORIAL_IDENTITY_POPULATION_ROLE,
    inputUnit: 'RANKING_CANDIDATE',
    inputCount: 5,
    outputUnit: EDITORIAL_IDENTITY_UNIT,
    outputCount: 2,
    resolvedCandidateCount: 3,
    sharedIdentityCandidateCount: 1,
    unresolvedCandidateCount: 2,
    accountingConserved: true,
    identityStateCounts: {
      IDENTITY_AMBIGUOUS: 1,
      IDENTITY_RESOLVED: 3,
      IDENTITY_UNAVAILABLE: 1,
    },
    identityMethodCounts: {
      canonical_id: 3,
      none: 1,
      title_fingerprint_fallback: 1,
    },
    reasonCounts: {
      identity_ambiguous: 1,
      identity_unavailable: 1,
      shared_editorial_identity: 1,
    },
  };
}

function identified(id, state, editorialIdentity = null) {
  return {
    id,
    _studyIdentity: {
      identityState: state,
      editorialIdentity,
      identityVersion: TOP_STORIES_IDENTITY_VERSION,
      identityMethod: state === TOP_STORIES_IDENTITY_STATES.RESOLVED
        ? 'canonical_id'
        : 'none',
    },
  };
}

function v2Population() {
  return buildEditorialIdentityRelations([
    identified('resolved-a', TOP_STORIES_IDENTITY_STATES.RESOLVED, 'canonical_id:shared'),
    identified('resolved-b', TOP_STORIES_IDENTITY_STATES.RESOLVED, 'canonical_id:shared'),
    identified('ambiguous', TOP_STORIES_IDENTITY_STATES.AMBIGUOUS),
    identified('conflict', TOP_STORIES_IDENTITY_STATES.CONFLICT),
    identified('unavailable', TOP_STORIES_IDENTITY_STATES.UNAVAILABLE),
  ]);
}

function observation(id, scheduledAt, population) {
  return {
    observationId: id,
    scheduledAt,
    runAt: scheduledAt,
    inputDigest: `digest-${id}`,
    completenessState: 'COMPLETE',
    analyticalEligibility: 'ELIGIBLE',
    sourceHealth: { ok: true, complete: true },
    rankedCount: 2,
    displayDepth: 10,
    displayedCount: 2,
    displayed: [],
    candidateEvidence: [],
    candidateBuildTrace: [],
    selectionTrace: [],
    editorialIdentityPopulation: population,
    funnel: [buildEditorialIdentityFunnelStage(population)],
  };
}

function legacyObservation(id, scheduledAt) {
  const result = observation(id, scheduledAt, v1Population());
  delete result.editorialIdentityPopulation;
  result.funnel = [];
  return result;
}

function metric() {
  return { count: 2, median: 0.95, p10: 0.9, fractionBelowThreshold: 0 };
}

function story(index) {
  return {
    id: `story-${index}`,
    canonicalId: `canonical-${index}`,
    title: `Explosion injures residents near railway station ${index}`,
    source: `Trusted Source ${index}`,
    sourceGroup: `publisher-${index}`,
    section: `section-${index}`,
    country: `country-${index}`,
    publishedAt: RUN_MS - (30 * 60 * 1000),
    timestampConfidence: 'high',
  };
}

function snapshotInput() {
  return {
    sectionItems: Object.fromEntries(
      Array.from({ length: 12 }, (_, index) => [`section-${index}`, [story(index)]]),
    ),
    topFeedItems: [],
    settings: {},
    sourceHealth: { ok: true, complete: true, failedSourceCount: 0 },
    inputSource: 'repository-public-newsdata-sections',
    inputSnapshotGeneratedAt: '2026-07-19T11:55:00.000Z',
  };
}

function snapshotMetadata() {
  return {
    repositorySha: 'nw-rank-012a-fixture',
    workflowRunId: 'nw-rank-012a',
    workflowRunAttempt: 1,
    scheduledAt: '2026-07-19T11:45:00.000Z',
    runAt: RUN_AT,
  };
}

describe('Top Stories editorial identity rail/funnel analytics', () => {
  it('preserves historical v1 analytics consumption', () => {
    const result = buildTopStoriesRailFunnelAnalytics([
      observation('a', '2026-07-18T00:07:00Z', v1Population()),
      observation('b', '2026-07-18T00:22:00Z', v1Population()),
    ]);
    const stage = result.funnelStages.find(
      row => row.stage === EDITORIAL_IDENTITY_FUNNEL_STAGE,
    );

    expect(stage).toMatchObject({
      populationRole: EDITORIAL_IDENTITY_POPULATION_ROLE,
      populationSchemaVersion: EDITORIAL_IDENTITY_POPULATION_SCHEMA_VERSION_V1,
      accountingConserved: true,
      totalInputCount: 10,
      totalOutputCount: 4,
    });
    expect(result.editorialIdentityCount.median).toBe(2);
    expect(result.identityResolutionCoverage.median).toBe(0.6);
    expect(result.identityAccountingConserved).toBe(true);
    expect(result.editorialIdentityReasonCounts.shared_editorial_identity).toBe(2);
  });

  it('derives v2 analytics from records and relation edges', () => {
    const result = buildTopStoriesRailFunnelAnalytics([
      observation('v2', '2026-07-18T00:07:00Z', v2Population()),
    ]);
    const row = result.observations[0];
    const stage = result.funnelStages[0];

    expect(row).toMatchObject({
      editorialIdentityPopulationSchemaVersion:
        EDITORIAL_IDENTITY_POPULATION_SCHEMA_VERSION_V2,
      editorialIdentityInputCount: 5,
      editorialIdentityCount: 1,
      resolvedIdentityCandidateCount: 2,
      sharedIdentityCandidateCount: 1,
      unresolvedIdentityCandidateCount: 3,
      identityResolutionCoverage: 0.4,
      identityAccountingConserved: true,
      identityRelationValidationError: null,
    });
    expect(stage).toMatchObject({
      populationSchemaVersion: EDITORIAL_IDENTITY_POPULATION_SCHEMA_VERSION_V2,
      inputCount: expect.objectContaining({ median: 5 }),
      outputCount: expect.objectContaining({ median: 1 }),
    });
  });

  it('separates mixed v1/v2 evidence and blocks homogeneous conservation', () => {
    const result = buildTopStoriesRailFunnelAnalytics([
      observation('v1', '2026-07-18T00:07:00Z', v1Population()),
      observation('v2', '2026-07-18T00:22:00Z', v2Population()),
    ]);

    expect(result.identityAccountingEvidenceCount).toBe(2);
    expect(result.identityAccountingConserved).toBe(false);
    expect(result.funnelStages).toHaveLength(2);
    expect(Object.keys(result.identityAccountingBySchemaVersion)).toEqual([
      EDITORIAL_IDENTITY_POPULATION_SCHEMA_VERSION_V1,
      EDITORIAL_IDENTITY_POPULATION_SCHEMA_VERSION_V2,
    ]);
    expect(Object.values(result.identityAccountingBySchemaVersion)
      .every(entry => entry.accountingConserved === true)).toBe(true);
  });

  it('reports absent legacy evidence as unknown, not conserved', () => {
    const result = buildTopStoriesRailFunnelAnalytics([
      legacyObservation('legacy-a', '2026-07-18T00:07:00Z'),
      legacyObservation('legacy-b', '2026-07-18T00:22:00Z'),
    ]);

    expect(result.identityAccountingEvidenceCount).toBe(0);
    expect(result.identityAccountingConserved).toBeNull();
    expect(result.editorialIdentityCount.count).toBe(0);
  });

  it('surfaces the v2 population and conservation status in Markdown', () => {
    const railAndFunnel = buildTopStoriesRailFunnelAnalytics([
      observation('a', '2026-07-18T00:07:00Z', v2Population()),
    ]);
    const markdown = renderTopStoriesDailyMarkdown({
      date: '2026-07-18',
      studyId: 'nw-rank-011-shadow-pilot-2026-07',
      status: 'OBSERVED',
      coverage: {
        scheduleSlotCoverage: 1,
        observedSlotCount: 96,
        successfulRuns: 96,
        valid15mPairs: 10,
        valid60mPairs: 5,
        invalidArtifacts: 0,
        supersededDuplicateCount: 0,
      },
      railAndFunnel,
      stability: {
        fifteenMinute: { overlapping: { calm: { incumbentRetention: metric() } } },
        sixtyMinute: { overlapping: { calm: { incumbentRetention: metric() } } },
      },
      pairing: { serialCorrelationNotice: 'Overlapping pairs are serially correlated.' },
    });

    expect(markdown).toContain('`EDITORIAL_IDENTITY` population');
    expect(markdown).toContain('`ANALYTICAL_SIDE_POPULATION`');
    expect(markdown).toContain('Identity accounting conserved: **yes**');
  });

  it('preserves ranking, ranked and displayed order in v2 snapshots', () => {
    const input = snapshotInput();
    const snapshot = buildTopStoriesRunSnapshot({
      studyConfig: CONFIG,
      inputBundle: input,
      metadata: snapshotMetadata(),
    });
    const direct = evaluateTopStories(
      { ...input, nowMs: RUN_MS },
      { limit: CONFIG.rankerLimit, displayDepth: CONFIG.displayDepth, nowMs: RUN_MS },
    );

    expect(snapshot.editorialIdentityPopulation.schemaVersion)
      .toBe(EDITORIAL_IDENTITY_POPULATION_SCHEMA_VERSION_V2);
    expect(snapshot.rankedIds).toEqual(direct.rankedIds);
    expect(snapshot.displayedTopNIds).toEqual(direct.displayedTopNIds);
    expect(snapshot.ranked.map(row => row.id)).toEqual(direct.selected.map(row => row.id));
    expect(snapshot.displayed.map(row => row.id)).toEqual(direct.displayed.map(row => row.id));
    expect(snapshot.ranked.map(row => row._topStoryRank))
      .toEqual(direct.selected.map(row => row._topStoryRank));
  });
});
