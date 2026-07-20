import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildEditorialIdentityFunnelStage,
  EDITORIAL_IDENTITY_POPULATION_ROLE,
  EDITORIAL_IDENTITY_POPULATION_SCHEMA_VERSION_V2,
} from '../../../scripts/top-stories-shadow/editorialIdentityPopulation.mjs';
import {
  buildEditorialIdentityRelations,
  getEditorialIdentityCandidateId,
  validateEditorialIdentityRelations,
} from '../../../scripts/top-stories-shadow/editorialIdentityRelations.mjs';
import {
  TOP_STORIES_IDENTITY_STATES,
  TOP_STORIES_IDENTITY_VERSION,
} from './topStoriesStudyIdentity.js';

const STATES = TOP_STORIES_IDENTITY_STATES;
function identifiedCandidate(id, state, extra = {}) {
  return {
    id,
    title: `Candidate ${id}`,
    source: `Source ${id}`,
    _studyIdentity: {
      identityState: state,
      identityMethod: extra.identityMethod || 'none',
      identityVersion: extra.identityVersion || TOP_STORIES_IDENTITY_VERSION,
      editorialIdentity: extra.editorialIdentity || null,
    },
  };
}
function resolved(id, editorialIdentity = `canonical_id:${id}`) {
  return identifiedCandidate(id, STATES.RESOLVED, {
    identityMethod: 'canonical_id',
    editorialIdentity,
  });
}
function unresolved(id, state) {
  const method = state === STATES.AMBIGUOUS
    ? 'title_fingerprint_fallback'
    : 'none';
  return identifiedCandidate(id, state, { identityMethod: method });
}
function mixedCandidates() {
  return [
    resolved('resolved-a', 'canonical_id:shared'),
    resolved('resolved-b', 'canonical_id:shared'),
    resolved('resolved-c', 'canonical_id:shared'),
    unresolved('ambiguous', STATES.AMBIGUOUS),
    unresolved('conflict', STATES.CONFLICT),
    unresolved('unavailable', STATES.UNAVAILABLE),
  ];
}
function clone(value) { return structuredClone(value); }
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

describe('NW-RANK-012A editorial identity relation ledger v2', () => {
  it('publishes one resolved candidate, identity and membership edge', () => {
    const result = buildEditorialIdentityRelations([resolved('one')]);
    expect(result).toMatchObject({
      schemaVersion: EDITORIAL_IDENTITY_POPULATION_SCHEMA_VERSION_V2,
      populationRole: EDITORIAL_IDENTITY_POPULATION_ROLE,
      candidateCount: 1,
      distinctEditorialIdentityCount: 1,
      resolvedCandidateCount: 1,
      ambiguousCandidateCount: 0,
      conflictCandidateCount: 0,
      unavailableCandidateCount: 0,
      identityMembershipEdgeCount: 1,
      dispositionCount: 0,
      accountingConserved: true,
    });
    expect(result.candidates).toHaveLength(1);
    expect(result.editorialIdentities).toHaveLength(1);
    expect(result.identityMembershipEdges).toHaveLength(1);
    expect(result.identityDispositionRecords).toEqual([]);
  });

  it('represents shared identity fan-in using three explicit edges', () => {
    const result = buildEditorialIdentityRelations(mixedCandidates().slice(0, 3));
    expect(result.candidates).toHaveLength(3);
    expect(result.editorialIdentities).toEqual([expect.objectContaining({
      memberCandidateCount: 3,
    })]);
    expect(result.identityMembershipEdges).toHaveLength(3);
    expect(new Set(result.identityMembershipEdges.map(edge => edge.candidateId)).size)
      .toBe(3);
    expect(result.reasonCounts.shared_editorial_identity).toBeUndefined();
    expect(result.sharedIdentityCandidateCount).toBe(2);
  });

  it.each([
    [STATES.AMBIGUOUS, 'identity_ambiguous'],
    [STATES.CONFLICT, 'identity_conflict'],
    [STATES.UNAVAILABLE, 'identity_unavailable'],
  ])('preserves %s as one explicit disposition without an edge', (state, reason) => {
    const result = buildEditorialIdentityRelations([unresolved('candidate', state)]);
    expect(result.identityMembershipEdges).toEqual([]);
    expect(result.identityDispositionRecords).toEqual([{
      candidateId: 'id:candidate',
      identityState: state,
      terminalReasonCode: reason,
      editorialIdentityId: null,
    }]);
    expect(result.candidates[0]).toMatchObject({
      identityState: state,
      editorialIdentityId: null,
      terminalReasonCode: reason,
    });
  });

  it('proves strict mixed-state conservation from records and edges', () => {
    const result = buildEditorialIdentityRelations(mixedCandidates());
    expect(result.candidateCount).toBe(6);
    expect(result.resolvedCandidateCount + result.ambiguousCandidateCount +
      result.conflictCandidateCount + result.unavailableCandidateCount).toBe(6);
    expect(result.resolvedCandidateCount).toBe(result.identityMembershipEdgeCount);
    expect(result.distinctEditorialIdentityCount).toBe(result.editorialIdentities.length);
    expect(result.identityMembershipEdgeCount + result.dispositionCount).toBe(6);
    expect(validateEditorialIdentityRelations(result).accountingConserved).toBe(true);
    const coverage = new Map(result.candidates.map(row => [row.candidateId, 0]));
    result.identityMembershipEdges.forEach(row =>
      coverage.set(row.candidateId, coverage.get(row.candidateId) + 1));
    result.identityDispositionRecords.forEach(row =>
      coverage.set(row.candidateId, coverage.get(row.candidateId) + 1));
    expect([...coverage.values()]).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it('publishes the required v2 analytical-side funnel fields', () => {
    const population = buildEditorialIdentityRelations(mixedCandidates());
    const stage = buildEditorialIdentityFunnelStage(population);
    expect(stage).toMatchObject({
      populationRole: EDITORIAL_IDENTITY_POPULATION_ROLE,
      populationSchemaVersion: EDITORIAL_IDENTITY_POPULATION_SCHEMA_VERSION_V2,
      inputUnit: 'RANKING_CANDIDATE',
      inputCount: 6,
      outputUnit: 'EDITORIAL_IDENTITY',
      outputCount: 1,
      membershipEdgeCount: 3,
      dispositionCount: 3,
      identityStateCounts: population.identityStateCounts,
      accountingConserved: true,
    });
  });

  it('uses only stable explicit candidate identity authorities', () => {
    expect(getEditorialIdentityCandidateId({ id: 'Story-A' })).toBe('id:story-a');
    expect(getEditorialIdentityCandidateId({ canonicalId: 'Canonical-A' }))
      .toBe('canonical-id:canonical-a');
    expect(getEditorialIdentityCandidateId({
      url: 'https://www.example.com/news/a/?utm_source=test',
    })).toBe('canonical-url:https://example.com/news/a');
    expect(() => getEditorialIdentityCandidateId({ title: 'Title only' }))
      .toThrow('EDITORIAL_IDENTITY_CANDIDATE_ID_UNAVAILABLE');
    expect(() => getEditorialIdentityCandidateId({
      rank: 1,
      displayed: true,
      _studyIdentity: { editorialIdentity: 'canonical_id:not-a-candidate-id' },
    })).toThrow('EDITORIAL_IDENTITY_CANDIDATE_ID_UNAVAILABLE');
  });

  it('fails closed for invalid state and resolved state without identity value', () => {
    expect(() => buildEditorialIdentityRelations([identifiedCandidate(
      'unknown',
      'IDENTITY_UNKNOWN',
    )])).toThrow('EDITORIAL_IDENTITY_STATE_UNSUPPORTED');
    expect(() => buildEditorialIdentityRelations([identifiedCandidate(
      'missing-value',
      STATES.RESOLVED,
      { identityMethod: 'canonical_id' },
    )])).toThrow('EDITORIAL_IDENTITY_RESOLVED_WITHOUT_VALUE');
  });

  it('rejects duplicate candidate IDs, edges and dispositions', () => {
    expect(() => buildEditorialIdentityRelations([
      resolved('duplicate'),
      resolved('DUPLICATE', 'canonical_id:other'),
    ])).toThrow('EDITORIAL_IDENTITY_DUPLICATE_CANDIDATE_ID');
    const invalid = clone(buildEditorialIdentityRelations([resolved('one')]));
    invalid.identityMembershipEdges.push(clone(invalid.identityMembershipEdges[0]));
    expect(() => validateEditorialIdentityRelations(invalid))
      .toThrow('EDITORIAL_IDENTITY_DUPLICATE_MEMBERSHIP_EDGE');
    const disposition = clone(buildEditorialIdentityRelations([
      unresolved('ambiguous', STATES.AMBIGUOUS),
    ]));
    disposition.identityDispositionRecords.push(
      clone(disposition.identityDispositionRecords[0]),
    );
    expect(() => validateEditorialIdentityRelations(disposition))
      .toThrow('EDITORIAL_IDENTITY_DUPLICATE_DISPOSITION');
  });

  it('rejects missing, double and foreign candidate coverage', () => {
    const missing = clone(buildEditorialIdentityRelations([
      resolved('resolved'),
      unresolved('conflict', STATES.CONFLICT),
    ]));
    missing.identityDispositionRecords = [];
    expect(() => validateEditorialIdentityRelations(missing))
      .toThrow('EDITORIAL_IDENTITY_CANDIDATE_COVERAGE_INVALID');
    const both = clone(buildEditorialIdentityRelations([resolved('resolved')]));
    both.identityDispositionRecords.push({
      candidateId: both.candidates[0].candidateId,
      identityState: STATES.CONFLICT,
      terminalReasonCode: 'identity_conflict',
      editorialIdentityId: null,
    });
    expect(() => validateEditorialIdentityRelations(both))
      .toThrow('EDITORIAL_IDENTITY_CANDIDATE_COVERAGE_INVALID');
    const foreign = clone(buildEditorialIdentityRelations([resolved('resolved')]));
    foreign.identityDispositionRecords.push({
      candidateId: 'id:foreign',
      identityState: STATES.UNAVAILABLE,
      terminalReasonCode: 'identity_unavailable',
      editorialIdentityId: null,
    });
    expect(() => validateEditorialIdentityRelations(foreign))
      .toThrow('EDITORIAL_IDENTITY_UNKNOWN_CANDIDATE_REFERENCE');
  });

  it('rejects state-to-record ownership and payload mismatches', () => {
    const swapped = clone(buildEditorialIdentityRelations([
      resolved('resolved'),
      unresolved('conflict', STATES.CONFLICT),
    ]));
    const edgeId = swapped.identityMembershipEdges[0].candidateId;
    swapped.identityMembershipEdges[0].candidateId =
      swapped.identityDispositionRecords[0].candidateId;
    swapped.identityDispositionRecords[0].candidateId = edgeId;
    expect(() => validateEditorialIdentityRelations(swapped))
      .toThrow('EDITORIAL_IDENTITY_RELATION_TYPE_MISMATCH');
    const edgeMismatch = clone(buildEditorialIdentityRelations([resolved('edge')]));
    edgeMismatch.identityMembershipEdges[0].identityMethod = 'other';
    expect(() => validateEditorialIdentityRelations(edgeMismatch))
      .toThrow('EDITORIAL_IDENTITY_EDGE_CANDIDATE_MISMATCH');
    const dispositionMismatch = clone(buildEditorialIdentityRelations([
      unresolved('ambiguous', STATES.AMBIGUOUS),
    ]));
    dispositionMismatch.identityDispositionRecords[0].terminalReasonCode =
      'identity_unavailable';
    expect(() => validateEditorialIdentityRelations(dispositionMismatch))
      .toThrow('EDITORIAL_IDENTITY_DISPOSITION_CANDIDATE_MISMATCH');
  });

  it('rejects orphan identities and member-count mismatches', () => {
    const orphan = clone(buildEditorialIdentityRelations([resolved('one')]));
    orphan.editorialIdentities.push({
      editorialIdentityId: 'v:orphan',
      editorialIdentity: 'orphan',
      identityVersion: 'v',
      memberCandidateCount: 0,
    });
    expect(() => validateEditorialIdentityRelations(orphan))
      .toThrow('EDITORIAL_IDENTITY_ORPHAN_IDENTITY_RECORD');
    const mismatch = clone(buildEditorialIdentityRelations([
      resolved('a', 'canonical_id:shared'),
      resolved('b', 'canonical_id:shared'),
    ]));
    mismatch.editorialIdentities[0].memberCandidateCount = 1;
    expect(() => validateEditorialIdentityRelations(mismatch))
      .toThrow('EDITORIAL_IDENTITY_MEMBER_COUNT_MISMATCH');
  });

  it('rejects declared counts that disagree with explicit records', () => {
    const invalid = clone(buildEditorialIdentityRelations(mixedCandidates()));
    invalid.resolvedCandidateCount -= 1;
    expect(() => validateEditorialIdentityRelations(invalid))
      .toThrow('EDITORIAL_IDENTITY_DECLARED_COUNT_MISMATCH');
  });

  it('is permutation invariant and does not mutate deeply frozen inputs', () => {
    const input = deepFreeze(mixedCandidates());
    const before = JSON.stringify(input);
    const forward = buildEditorialIdentityRelations(input);
    const reverse = buildEditorialIdentityRelations([...input].reverse());
    expect(reverse).toEqual(forward);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('guards v2 conservation, candidate identity and test arithmetic statically', () => {
    const relationSource = readFileSync(
      new URL('../../../scripts/top-stories-shadow/editorialIdentityRelations.mjs', import.meta.url),
      'utf8',
    );
    const testSources = [
      'topStoriesEditorialIdentityPopulation.cert.test.js',
      'topStoriesEditorialIdentityRailFunnel.cert.test.js',
      'topStoriesEditorialIdentityRelations.cert.test.js',
    ].map(file => readFileSync(new URL(file, import.meta.url), 'utf8')).join('\n');
    expect(relationSource).not.toMatch(/totalCounts\s*\(/);
    expect(relationSource).not.toMatch(/account\w*[^\n]*reasonCounts/i);
    expect(relationSource).not.toContain('shared_editorial_identity');
    expect(relationSource).not.toContain('candidate.title');
    expect(relationSource).not.toContain('Date.now');
    expect(relationSource).not.toContain('Math.random');
    expect(relationSource).not.toContain('_topStoryRank');
    expect(relationSource).not.toContain('rankedIds');
    expect(relationSource).not.toContain('displayedTopNIds');
    expect(testSources).not.toMatch(/-\s*(?:conflict|ambiguous|shared|duplicate)/i);
  });
});
