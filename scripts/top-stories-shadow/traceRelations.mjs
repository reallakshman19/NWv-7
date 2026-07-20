import {
  getTopStoryDedupeKey,
  listTopStorySourceRows,
} from '../../src/services/topStories/topStoriesCandidates.js';
import { digestCanonicalJson } from './canonicalJson.mjs';
import { getEditorialIdentityCandidateId } from './editorialIdentityRelations.mjs';
import {
  sanitizeObservationEvidence,
  sanitizeStoryEvidence,
} from './inputContract.mjs';
import {
  sortTopStoriesTraceRelationArray,
  TOP_STORIES_TRACE_RELATION_SCHEMA_VERSION,
  TopStoriesTraceRelationError,
  validateTopStoriesTraceRelations,
} from './traceRelationsValidation.mjs';
export { TOP_STORIES_TRACE_RELATION_SCHEMA_VERSION } from './traceRelationsValidation.mjs';
function fail(code, detail = '') {
  throw new TopStoriesTraceRelationError(code, detail);
}
function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function strictCandidateId(candidate) {
  try { return getEditorialIdentityCandidateId(candidate); }
  catch { return fail('TRACE_RELATION_CANDIDATE_ID_UNAVAILABLE'); }
}
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}
function sanitizeSourceEvidence(value) {
  if (isPlainObject(value)) return sanitizeStoryEvidence(value);
  const primitiveType = Array.isArray(value) ? 'array' : typeof value;
  const primitiveValue = ['bigint', 'function', 'symbol'].includes(typeof value)
    ? String(value) : value ?? null;
  return sanitizeObservationEvidence({ primitiveType, primitiveValue });
}
function sourceIdentity(row) {
  const sanitizedEvidence = sanitizeSourceEvidence(row.sourceRow);
  const evidenceDigest = digestCanonicalJson(sanitizedEvidence);
  const sourceEvidenceId = `source-evidence:${digestCanonicalJson({
    sourceLane: row.sourceLane,
    sourceSectionKey: row.sourceSectionKey,
    evidenceDigest,
  })}`;
  return {
    sourceEvidenceId,
    sourceLane: row.sourceLane,
    sourceSectionKey: row.sourceSectionKey,
    evidenceDigest,
    sanitizedEvidence,
  };
}
function candidateRecords(evaluation) {
  const candidates = Array.isArray(evaluation?.scoredCandidates)
    ? evaluation.scoredCandidates
    : [];
  const byId = new Map();
  const byKey = new Map();
  const records = candidates.map(candidate => {
    const candidateId = strictCandidateId(candidate);
    const candidateKey = getTopStoryDedupeKey(candidate);
    if (!candidateKey) fail('TRACE_RELATION_CANDIDATE_KEY_UNAVAILABLE', candidateId);
    if (byId.has(candidateId)) fail('TRACE_RELATION_DUPLICATE_CANDIDATE_ID', candidateId);
    if (byKey.has(candidateKey)) fail('TRACE_RELATION_DUPLICATE_CANDIDATE_KEY', candidateKey);
    const record = { candidateId, candidateKey };
    byId.set(candidateId, { candidate, record });
    byKey.set(candidateKey, { candidate, record });
    return record;
  });
  return { records, byId, byKey };
}
function incrementRecord(map, key, record) {
  const current = map.get(key);
  map.set(key, current
    ? { ...current, occurrenceCount: current.occurrenceCount + 1 }
    : { ...record, occurrenceCount: 1 });
}
function buildSourceRelations(inputBundle, evaluation, candidates) {
  const rows = listTopStorySourceRows(inputBundle);
  const traces = Array.isArray(evaluation?.candidateBuildTrace)
    ? evaluation.candidateBuildTrace
    : [];
  if (rows.length !== traces.length || rows.length !== evaluation.rawInputCount) {
    fail('TRACE_RELATION_SOURCE_TRACE_COUNT_MISMATCH');
  }
  const groups = new Map();
  const edges = new Map();
  const dispositions = new Map();
  rows.forEach((row, index) => {
    const trace = traces[index];
    if (trace?.sourceRowIndex !== row.sourceRowIndex) {
      fail('TRACE_RELATION_SOURCE_TRACE_ORDER_MISMATCH', String(index));
    }
    const source = sourceIdentity(row);
    const group = groups.get(source.sourceEvidenceId);
    groups.set(source.sourceEvidenceId, group
      ? { ...group, occurrenceCount: group.occurrenceCount + 1 }
      : { ...source, occurrenceCount: 1 });
    const isCandidate = ['PROMOTED_TO_CANDIDATE', 'COLLAPSED_AS_DUPLICATE']
      .includes(trace.buildDisposition);
    if (isCandidate) {
      const target = candidates.byKey.get(String(trace.representativeKey || ''));
      if (!target) fail('TRACE_RELATION_SOURCE_CANDIDATE_UNRESOLVED', trace.representativeKey);
      const record = {
        sourceEvidenceId: source.sourceEvidenceId,
        candidateId: target.record.candidateId,
        buildDisposition: trace.buildDisposition,
        reasonCode: trace.reasonCode,
      };
      incrementRecord(edges, JSON.stringify([
        record.sourceEvidenceId,
        record.candidateId,
        record.buildDisposition,
        record.reasonCode,
      ]), record);
      return;
    }
    const record = {
      sourceEvidenceId: source.sourceEvidenceId,
      buildDisposition: trace.buildDisposition,
      reasonCode: trace.reasonCode,
      candidateId: null,
    };
    incrementRecord(dispositions, JSON.stringify([
      record.sourceEvidenceId,
      record.buildDisposition,
      record.reasonCode,
    ]), record);
  });
  return {
    sourceEvidenceGroups: [...groups.values()],
    sourceCandidateEdges: [...edges.values()],
    sourceDispositionRecords: [...dispositions.values()],
  };
}
function selectionTraceMap(evaluation, candidates) {
  const traces = Array.isArray(evaluation?.selectionTrace) ? evaluation.selectionTrace : [];
  if (traces.length !== candidates.records.length) {
    fail('TRACE_RELATION_SELECTION_TRACE_COUNT_MISMATCH');
  }
  const result = new Map();
  traces.forEach(trace => {
    const target = candidates.byKey.get(String(trace.candidateKey || ''));
    if (!target) fail('TRACE_RELATION_SELECTION_TRACE_CANDIDATE_UNKNOWN');
    const candidateId = target.record.candidateId;
    if (result.has(candidateId)) fail('TRACE_RELATION_SELECTION_TRACE_DUPLICATE', candidateId);
    result.set(candidateId, trace);
  });
  return result;
}
function rankedRelations(evaluation, candidates) {
  const selected = Array.isArray(evaluation?.selected) ? evaluation.selected : [];
  const rankedPositions = [];
  const candidateRankEdges = [];
  const selectedIds = new Set();
  selected.forEach((candidate, index) => {
    const candidateId = strictCandidateId(candidate);
    if (!candidates.byId.has(candidateId) || selectedIds.has(candidateId)) {
      fail('TRACE_RELATION_RANKED_CANDIDATE_INVALID', candidateId);
    }
    selectedIds.add(candidateId);
    const rank = index + 1;
    const rankedPositionId = `ranked-position:${rank}`;
    rankedPositions.push({ rankedPositionId, rank, candidateId });
    candidateRankEdges.push({ candidateId, rankedPositionId, rank });
  });
  return { rankedPositions, candidateRankEdges, selectedIds };
}
function candidateDispositions(evaluation, candidates, ranked) {
  const traces = selectionTraceMap(evaluation, candidates);
  return candidates.records
    .filter(candidate => !ranked.selectedIds.has(candidate.candidateId))
    .map(candidate => {
      const trace = traces.get(candidate.candidateId);
      if (!trace || ['DISPLAYED', 'RANKED_NOT_DISPLAYED'].includes(trace.finalDisposition)) {
        fail('TRACE_RELATION_CANDIDATE_DISPOSITION_INVALID', candidate.candidateId);
      }
      return {
        candidateId: candidate.candidateId,
        finalDisposition: trace.finalDisposition,
        terminalStage: trace.terminalStage,
        terminalReasonCode: trace.terminalReasonCode,
        rankedPositionId: null,
      };
    });
}
function displayRelations(evaluation, ranked) {
  const displayed = Array.isArray(evaluation?.displayed) ? evaluation.displayed : [];
  const displayedPositions = [];
  const rankDisplayEdges = [];
  const rankDispositionRecords = [];
  ranked.rankedPositions.forEach(position => {
    const displayedCandidate = displayed[position.rank - 1];
    if (displayedCandidate) {
      const candidateId = strictCandidateId(displayedCandidate);
      if (candidateId !== position.candidateId) {
        fail('TRACE_RELATION_DISPLAY_ORDER_MISMATCH', candidateId);
      }
      const displayRank = position.rank;
      const displayedPositionId = `displayed-position:${displayRank}`;
      displayedPositions.push({
        displayedPositionId,
        displayRank,
        rankedPositionId: position.rankedPositionId,
        candidateId,
      });
      rankDisplayEdges.push({
        rankedPositionId: position.rankedPositionId,
        displayedPositionId,
        candidateId,
        rank: position.rank,
        displayRank,
      });
      return;
    }
    rankDispositionRecords.push({
      rankedPositionId: position.rankedPositionId,
      candidateId: position.candidateId,
      rank: position.rank,
      finalDisposition: 'RANKED_NOT_DISPLAYED',
      terminalReasonCode: 'outside_display_limit',
      displayedPositionId: null,
    });
  });
  if (displayed.length !== displayedPositions.length) {
    fail('TRACE_RELATION_DISPLAY_COUNT_MISMATCH');
  }
  return { displayedPositions, rankDisplayEdges, rankDispositionRecords };
}
function sortedArrays(arrays) {
  return Object.fromEntries(Object.entries(arrays).map(([field, rows]) => [
    field,
    sortTopStoriesTraceRelationArray(field, rows),
  ]));
}
function accountingDelta(ledger) {
  const sourceEdgeCount = ledger.sourceCandidateEdges
    .reduce((sum, row) => sum + row.occurrenceCount, 0);
  const sourceDispositionCount = ledger.sourceDispositionRecords
    .reduce((sum, row) => sum + row.occurrenceCount, 0);
  return [
    ledger.rawInputCount - sourceEdgeCount - sourceDispositionCount,
    ledger.candidateCount - ledger.candidateRankEdges.length -
      ledger.candidateDispositionRecords.length,
    ledger.rankedCount - ledger.candidateRankEdges.length,
    ledger.rankedCount - ledger.rankDisplayEdges.length -
      ledger.rankDispositionRecords.length,
    ledger.displayedCount - ledger.rankDisplayEdges.length,
  ].reduce((sum, value) => sum + Math.abs(value), 0);
}
export function buildTopStoriesTraceRelations({ inputBundle, evaluation } = {}) {
  if (!inputBundle || !evaluation) fail('TRACE_RELATION_BUILD_INPUT_REQUIRED');
  const candidates = candidateRecords(evaluation);
  const source = buildSourceRelations(inputBundle, evaluation, candidates);
  const ranked = rankedRelations(evaluation, candidates);
  const display = displayRelations(evaluation, ranked);
  const arrays = sortedArrays({
    ...source,
    candidates: candidates.records,
    rankedPositions: ranked.rankedPositions,
    displayedPositions: display.displayedPositions,
    candidateRankEdges: ranked.candidateRankEdges,
    candidateDispositionRecords: candidateDispositions(evaluation, candidates, ranked),
    rankDisplayEdges: display.rankDisplayEdges,
    rankDispositionRecords: display.rankDispositionRecords,
  });
  const ledger = {
    schemaVersion: TOP_STORIES_TRACE_RELATION_SCHEMA_VERSION,
    rawInputCount: evaluation.rawInputCount,
    candidateCount: candidates.records.length,
    rankedCount: ranked.rankedPositions.length,
    displayedCount: display.displayedPositions.length,
    ...arrays,
  };
  ledger.accountingDelta = accountingDelta(ledger);
  ledger.accountingConserved = ledger.accountingDelta === 0;
  validateTopStoriesTraceRelations(ledger, {
    rawInputCount: evaluation.rawInputCount,
    candidates: evaluation.scoredCandidates,
    ranked: evaluation.selected,
    displayed: evaluation.displayed,
    rankedCount: evaluation.rankedCount,
    displayedCount: evaluation.displayedCount,
  });
  return deepFreeze(ledger);
}
