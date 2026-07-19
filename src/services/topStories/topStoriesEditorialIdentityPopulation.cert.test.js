import { describe, expect, it } from 'vitest';
import {
  buildEditorialIdentityFunnelStage,
  buildEditorialIdentityPopulation,
  EDITORIAL_IDENTITY_FUNNEL_STAGE,
  EDITORIAL_IDENTITY_POPULATION_ROLE,
  EDITORIAL_IDENTITY_POPULATION_SCHEMA_VERSION,
  EDITORIAL_IDENTITY_POPULATION_SCHEMA_VERSION_V1,
  EDITORIAL_IDENTITY_POPULATION_SCHEMA_VERSION_V2,
  EDITORIAL_IDENTITY_UNIT,
  RANKING_CANDIDATE_UNIT,
} from '../../../scripts/top-stories-shadow/editorialIdentityPopulation.mjs';
import {
  attachTopStoryStudyIdentities,
  TOP_STORIES_IDENTITY_STATES,
} from './topStoriesStudyIdentity.js';

function candidates() {
  return [
    {
      id: 'resolved-a',
      canonicalId: 'shared-editorial-event',
      title: 'Flood warning issued for coastal residents',
      source: 'Source A',
    },
    {
      id: 'resolved-b',
      canonicalId: 'shared-editorial-event',
      title: 'Flood warning remains active for coastal residents',
      source: 'Source B',
    },
    {
      id: 'ambiguous',
      title: 'Brief update',
      source: 'Source C',
    },
    {
      id: 'conflict',
      clusterId: 'cluster-alpha',
      cluster_id: 'cluster-beta',
      title: 'Public safety alert issued for rail passengers',
      source: 'Source D',
    },
    {
      id: 'unavailable',
      source: 'Source E',
    },
  ];
}

function population(rows = candidates()) {
  return buildEditorialIdentityPopulation(
    attachTopStoryStudyIdentities(rows),
  );
}

describe('Top Stories editorial identity population v1 compatibility', () => {
  it('keeps v1 semantics while publishing v2 as the active contract', () => {
    const result = population();

    expect(EDITORIAL_IDENTITY_POPULATION_SCHEMA_VERSION)
      .toBe(EDITORIAL_IDENTITY_POPULATION_SCHEMA_VERSION_V2);
    expect(result).toMatchObject({
      schemaVersion: EDITORIAL_IDENTITY_POPULATION_SCHEMA_VERSION_V1,
      populationRole: EDITORIAL_IDENTITY_POPULATION_ROLE,
      inputUnit: RANKING_CANDIDATE_UNIT,
      inputCount: 5,
      outputUnit: EDITORIAL_IDENTITY_UNIT,
      outputCount: 1,
      resolvedCandidateCount: 2,
      sharedIdentityCandidateCount: 1,
      unresolvedCandidateCount: 3,
      accountedCandidateCount: 5,
      accountingDelta: 0,
      accountingConserved: true,
    });
    expect(result.identityStateCounts).toEqual({
      [TOP_STORIES_IDENTITY_STATES.AMBIGUOUS]: 1,
      [TOP_STORIES_IDENTITY_STATES.CONFLICT]: 1,
      [TOP_STORIES_IDENTITY_STATES.RESOLVED]: 2,
      [TOP_STORIES_IDENTITY_STATES.UNAVAILABLE]: 1,
    });
    expect(result.reasonCounts).toEqual({
      identity_ambiguous: 1,
      identity_conflict: 1,
      identity_unavailable: 1,
      shared_editorial_identity: 1,
    });
    expect(result.editorialIdentities).toHaveLength(1);
  });

  it('keeps the historical v1 side-population funnel shape', () => {
    const result = population();
    const stage = buildEditorialIdentityFunnelStage(result);

    expect(stage).toEqual({
      stage: EDITORIAL_IDENTITY_FUNNEL_STAGE,
      populationRole: EDITORIAL_IDENTITY_POPULATION_ROLE,
      populationSchemaVersion: EDITORIAL_IDENTITY_POPULATION_SCHEMA_VERSION_V1,
      inputUnit: RANKING_CANDIDATE_UNIT,
      inputCount: 5,
      outputUnit: EDITORIAL_IDENTITY_UNIT,
      outputCount: 1,
      reasonCounts: result.reasonCounts,
      accountingConserved: true,
    });
  });

  it('keeps v1 deterministic under source permutation', () => {
    expect(population([...candidates()].reverse())).toEqual(population());
  });

  it('keeps the v1 resolved-without-value historical disposition', () => {
    const result = buildEditorialIdentityPopulation([{
      _studyIdentity: {
        identityState: TOP_STORIES_IDENTITY_STATES.RESOLVED,
        editorialIdentity: null,
        identityMethod: 'canonical_id',
      },
    }]);

    expect(result).toMatchObject({
      schemaVersion: EDITORIAL_IDENTITY_POPULATION_SCHEMA_VERSION_V1,
      inputCount: 1,
      outputCount: 0,
      resolvedCandidateCount: 0,
      unresolvedCandidateCount: 1,
      accountingConserved: true,
      reasonCounts: { identity_resolved_without_value: 1 },
    });
  });
});
