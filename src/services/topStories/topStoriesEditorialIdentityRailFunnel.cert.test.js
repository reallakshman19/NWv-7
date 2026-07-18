import { describe, expect, it } from 'vitest';
import { renderTopStoriesDailyMarkdown } from '../../../scripts/top-stories-shadow/dailyReportMarkdown.mjs';
import {
  EDITORIAL_IDENTITY_FUNNEL_STAGE,
  EDITORIAL_IDENTITY_POPULATION_ROLE,
  EDITORIAL_IDENTITY_POPULATION_SCHEMA_VERSION,
  EDITORIAL_IDENTITY_UNIT,
} from '../../../scripts/top-stories-shadow/editorialIdentityPopulation.mjs';
import { buildTopStoriesRailFunnelAnalytics } from '../../../scripts/top-stories-shadow/railFunnelAnalytics.mjs';

function identityPopulation() {
  return {
    schemaVersion: EDITORIAL_IDENTITY_POPULATION_SCHEMA_VERSION,
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

function observation(id, scheduledAt) {
  const population = identityPopulation();
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
    funnel: [{
      stage: EDITORIAL_IDENTITY_FUNNEL_STAGE,
      populationRole: EDITORIAL_IDENTITY_POPULATION_ROLE,
      populationSchemaVersion: EDITORIAL_IDENTITY_POPULATION_SCHEMA_VERSION,
      inputUnit: population.inputUnit,
      inputCount: population.inputCount,
      outputUnit: population.outputUnit,
      outputCount: population.outputCount,
      reasonCounts: population.reasonCounts,
      accountingConserved: true,
    }],
  };
}

function metric() {
  return {
    count: 2,
    median: 0.95,
    p10: 0.9,
    fractionBelowThreshold: 0,
  };
}

describe('Top Stories editorial identity rail/funnel analytics', () => {
  it('aggregates the analytical side population with exact units', () => {
    const result = buildTopStoriesRailFunnelAnalytics([
      observation('a', '2026-07-18T00:07:00Z'),
      observation('b', '2026-07-18T00:22:00Z'),
    ]);
    const stage = result.funnelStages.find(
      row => row.stage === EDITORIAL_IDENTITY_FUNNEL_STAGE,
    );

    expect(stage).toMatchObject({
      populationRole: EDITORIAL_IDENTITY_POPULATION_ROLE,
      populationSchemaVersion: EDITORIAL_IDENTITY_POPULATION_SCHEMA_VERSION,
      accountingConserved: true,
      inputUnit: 'RANKING_CANDIDATE',
      outputUnit: EDITORIAL_IDENTITY_UNIT,
      totalInputCount: 10,
      totalOutputCount: 4,
    });
    expect(stage.inputCount.median).toBe(5);
    expect(stage.outputCount.median).toBe(2);
    expect(result.editorialIdentityCount.median).toBe(2);
    expect(result.identityResolutionCoverage.median).toBe(0.6);
    expect(result.identityAccountingConserved).toBe(true);
    expect(result.editorialIdentityReasonCounts).toEqual({
      identity_ambiguous: 2,
      identity_unavailable: 2,
      shared_editorial_identity: 2,
    });
    expect(result.identityStateCounts).toEqual({
      IDENTITY_AMBIGUOUS: 2,
      IDENTITY_RESOLVED: 6,
      IDENTITY_UNAVAILABLE: 2,
    });
    expect(result.categoryReasonCounts.identity).toBe(6);
  });

  it('surfaces the population and conservation status in daily Markdown', () => {
    const railAndFunnel = buildTopStoriesRailFunnelAnalytics([
      observation('a', '2026-07-18T00:07:00Z'),
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
      pairing: {
        serialCorrelationNotice: 'Overlapping pairs are serially correlated.',
      },
    });

    expect(markdown).toContain('`EDITORIAL_IDENTITY` population');
    expect(markdown).toContain('`ANALYTICAL_SIDE_POPULATION`');
    expect(markdown).toContain('Identity accounting conserved: **yes**');
  });
});
