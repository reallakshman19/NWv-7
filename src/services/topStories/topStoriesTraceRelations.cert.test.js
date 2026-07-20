import { describe, expect, it } from 'vitest';
import {
  buildTopStoriesTraceRelations,
  TOP_STORIES_TRACE_RELATION_SCHEMA_VERSION,
} from '../../../scripts/top-stories-shadow/traceRelations.mjs';
import { validateTopStoriesTraceRelations }
  from '../../../scripts/top-stories-shadow/traceRelationsValidation.mjs';
import { evaluateTopStories } from './topStoriesRanker.js';

const NOW = Date.UTC(2026, 6, 20, 8, 0, 0);
const HOUR = 60 * 60 * 1000;
function story(id, extra = {}) {
  return {
    id,
    canonicalId: `canonical-${id}`,
    title: `Flood evacuation alert ${id}`,
    source: 'Trusted Source',
    sourceGroup: 'trusted-source',
    publishedAt: NOW - HOUR,
    timestampConfidence: 'high',
    sourceCount: 2,
    ...extra,
  };
}
function input(sectionItems, topFeedItems = []) {
  return { sectionItems, topFeedItems, nowMs: NOW };
}
function build(bundle, options = {}) {
  const evaluation = evaluateTopStories(bundle, {
    limit: options.limit ?? 10,
    displayDepth: options.displayDepth ?? 10,
    nowMs: NOW,
  });
  return {
    evaluation,
    ledger: buildTopStoriesTraceRelations({ inputBundle: bundle, evaluation }),
  };
}
function clone(value) { return structuredClone(value); }
function sum(rows) {
  return rows.reduce((total, row) => total + row.occurrenceCount, 0);
}

describe('NW-RANK-012C trace relation ledger v3', () => {
  it('connects one source occurrence through candidate, rank, and display', () => {
    const { evaluation, ledger } = build(input({ world: [story('one')] }));
    expect(ledger.schemaVersion).toBe(TOP_STORIES_TRACE_RELATION_SCHEMA_VERSION);
    expect(ledger).toMatchObject({
      rawInputCount: 1,
      candidateCount: 1,
      rankedCount: 1,
      displayedCount: 1,
      accountingDelta: 0,
      accountingConserved: true,
    });
    expect(ledger.sourceCandidateEdges).toHaveLength(1);
    expect(ledger.candidateRankEdges).toHaveLength(1);
    expect(ledger.rankDisplayEdges).toHaveLength(1);
    expect(ledger.rankedPositions[0]).toMatchObject({ rank: 1 });
    expect(ledger.displayedPositions[0]).toMatchObject({ displayRank: 1 });
    expect(ledger.rankedPositions.map(row => row.candidateId))
      .toEqual(ledger.candidateRankEdges.map(row => row.candidateId));
    expect(evaluation.rankedIds).toEqual(['one']);
  });

  it('represents identical source occurrences through multiplicity', () => {
    const repeated = story('same');
    const { ledger } = build(input({ world: [repeated, repeated, repeated] }));
    expect(ledger.sourceEvidenceGroups).toHaveLength(1);
    expect(ledger.sourceEvidenceGroups[0].occurrenceCount).toBe(3);
    expect(ledger.sourceCandidateEdges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        buildDisposition: 'PROMOTED_TO_CANDIDATE',
        reasonCode: 'candidate_created',
        occurrenceCount: 1,
      }),
      expect.objectContaining({
        buildDisposition: 'COLLAPSED_AS_DUPLICATE',
        reasonCode: 'duplicate_identity',
        occurrenceCount: 2,
      }),
    ]));
    expect(sum(ledger.sourceCandidateEdges)).toBe(3);
    expect(ledger.accountingDelta).toBe(0);
  });

  it('keeps identical evidence in different lanes as distinct groups', () => {
    const repeated = story('lane');
    const { ledger } = build(input({ world: [repeated] }, [repeated]));
    expect(ledger.sourceEvidenceGroups).toHaveLength(2);
    expect(new Set(ledger.sourceEvidenceGroups.map(row => row.sourceLane)).size).toBe(2);
    expect(new Set(ledger.sourceCandidateEdges.map(row => row.candidateId)).size).toBe(1);
    expect(sum(ledger.sourceCandidateEdges)).toBe(2);
  });

  it('retains primitive input through explicit source dispositions', () => {
    const { ledger } = build(input({ world: [null, 42, story('valid')] }));
    expect(ledger.rawInputCount).toBe(3);
    expect(sum(ledger.sourceDispositionRecords)).toBe(2);
    expect(ledger.sourceDispositionRecords.every(row => (
      row.buildDisposition === 'INVALID_INPUT' && row.candidateId === null
    ))).toBe(true);
    expect(ledger.candidateCount).toBe(1);
    expect(ledger.accountingConserved).toBe(true);
  });

  it('publishes explicit candidate and rank terminal dispositions', () => {
    const rows = [
      story('displayed'),
      story('ranked-not-displayed'),
      story('rejected', { title: 'Community update', sourceCount: 1 }),
    ];
    const { ledger } = build(input({ world: rows }), { limit: 2, displayDepth: 1 });
    expect(ledger.candidateRankEdges).toHaveLength(2);
    expect(ledger.candidateDispositionRecords).toEqual([
      expect.objectContaining({
        finalDisposition: 'REJECTED_BY_ADMISSION',
        rankedPositionId: null,
      }),
    ]);
    expect(ledger.rankDisplayEdges).toHaveLength(1);
    expect(ledger.rankDispositionRecords).toEqual([
      expect.objectContaining({
        finalDisposition: 'RANKED_NOT_DISPLAYED',
        terminalReasonCode: 'outside_display_limit',
        displayedPositionId: null,
      }),
    ]);
  });

  it('fails closed when an emitted candidate lacks strict identity', () => {
    const bundle = input({ world: [{
      title: 'Flood evacuation alert without authoritative identity',
      source: 'Trusted Source',
      publishedAt: NOW - HOUR,
      timestampConfidence: 'high',
      sourceCount: 2,
    }] });
    const evaluation = evaluateTopStories(bundle, { nowMs: NOW });
    expect(() => buildTopStoriesTraceRelations({ inputBundle: bundle, evaluation }))
      .toThrow(/TRACE_RELATION_CANDIDATE_ID_UNAVAILABLE/);
  });

  it('excludes sensitive evidence and returns a deeply frozen ledger', () => {
    const unsafe = story('safe', {
      body: 'licensed body',
      html: '<p>secret</p>',
      token: 'secret-token',
      viewed: true,
    });
    const { ledger } = build(input({ world: [unsafe] }));
    const serialized = JSON.stringify(ledger);
    expect(serialized).not.toContain('licensed body');
    expect(serialized).not.toContain('secret-token');
    expect(serialized).not.toContain('"body"');
    expect(serialized).not.toContain('"html"');
    expect(serialized).not.toContain('"viewed"');
    expect(Object.isFrozen(ledger)).toBe(true);
    expect(Object.isFrozen(ledger.sourceEvidenceGroups[0].sanitizedEvidence)).toBe(true);
  });

  it('rejects malformed endpoints, multiplicities, ranks, and declarations', () => {
    const { ledger } = build(input({ world: [story('a'), story('b')] }), {
      displayDepth: 1,
    });
    const cases = [
      value => { value.sourceCandidateEdges[0].candidateId = 'missing'; },
      value => { value.sourceCandidateEdges[0].occurrenceCount = 0; },
      value => { value.rankedPositions[0].rank = 2; },
      value => { value.rankDisplayEdges[0].displayedPositionId = 'missing'; },
      value => { value.candidateCount += 1; },
      value => { value.accountingConserved = false; },
      value => { value.sourceEvidenceGroups[0].sanitizedEvidence.token = 'secret'; },
    ];
    cases.forEach(mutate => {
      const corrupted = clone(ledger);
      mutate(corrupted);
      expect(() => validateTopStoriesTraceRelations(corrupted)).toThrow();
    });
  });
});
