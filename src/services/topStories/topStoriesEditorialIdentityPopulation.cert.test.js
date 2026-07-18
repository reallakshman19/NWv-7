import { describe, expect, it } from 'vitest';
import {
  buildEditorialIdentityFunnelStage,
  buildEditorialIdentityPopulation,
  EDITORIAL_IDENTITY_FUNNEL_STAGE,
  EDITORIAL_IDENTITY_POPULATION_ROLE,
  EDITORIAL_IDENTITY_POPULATION_SCHEMA_VERSION,
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

describe('Top Stories editorial identity population', () => {
  it('conserves candidates across resolved, shared and excluded identities', () => {
    const result = population();

    expect(result).toMatchObject({
      schemaVersion: EDITORIAL_IDENTITY_POPULATION_SCHEMA_VERSION,
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

  it('builds a side-population funnel stage without changing candidate flow', () => {
    const result = population();
    const stage = buildEditorialIdentityFunnelStage(result);

    expect(stage).toEqual({
      stage: EDITORIAL_IDENTITY_FUNNEL_STAGE,
      populationRole: EDITORIAL_IDENTITY_POPULATION_ROLE,
      populationSchemaVersion: EDITORIAL_IDENTITY_POPULATION_SCHEMA_VERSION,
      inputUnit: RANKING_CANDIDATE_UNIT,
      inputCount: 5,
      outputUnit: EDITORIAL_IDENTITY_UNIT,
      outputCount: 1,
      reasonCounts: result.reasonCounts,
      accountingConserved: true,
    });
  });

  it('is deterministic under source permutation', () => {
    const forward = population(candidates());
    const reverse = population([...candidates()].reverse());

    expect(reverse).toEqual(forward);
  });

  it('fails closed when a resolved state has no identity value', () => {
    const result = buildEditorialIdentityPopulation([{
      _studyIdentity: {
        identityState: TOP_STORIES_IDENTITY_STATES.RESOLVED,
        editorialIdentity: null,
        identityMethod: 'canonical_id',
      },
    }]);

    expect(result).toMatchObject({
      inputCount: 1,
      outputCount: 0,
      resolvedCandidateCount: 0,
      unresolvedCandidateCount: 1,
      accountingConserved: true,
      reasonCounts: { identity_resolved_without_value: 1 },
    });
  });
});
