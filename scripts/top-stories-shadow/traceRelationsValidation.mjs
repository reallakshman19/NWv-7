import { getTopStoryDedupeKey, TOP_STORY_SOURCE_LANES }
  from '../../src/services/topStories/topStoriesCandidates.js';
import { digestCanonicalJson } from './canonicalJson.mjs';
import { getEditorialIdentityCandidateId } from './editorialIdentityRelations.mjs';
export const TOP_STORIES_TRACE_RELATION_SCHEMA_VERSION = 'nw-top-stories-trace-relations/v3';
export const TRACE_RELATION_ARRAY_FIELDS = Object.freeze([
  'sourceEvidenceGroups', 'candidates', 'rankedPositions', 'displayedPositions',
  'sourceCandidateEdges', 'sourceDispositionRecords', 'candidateRankEdges',
  'candidateDispositionRecords', 'rankDisplayEdges', 'rankDispositionRecords',
]);
const SOURCE_LANES = new Set(Object.values(TOP_STORY_SOURCE_LANES));
const SENSITIVE_KEYS = new Set([
  'apikey', 'authorization', 'body', 'content', 'cookie', 'html', 'password',
  'personalisation', 'personalization', 'readstate', 'secret', 'token',
  'userid', 'viewed', '_candidateseenat',
]);
export class TopStoriesTraceRelationError extends Error {
  constructor(code, detail = '') {
    super(`${code}${detail ? `: ${detail}` : ''}`); this.code = code;
    this.name = 'TopStoriesTraceRelationError';
  }
}
function fail(code, detail = '') { throw new TopStoriesTraceRelationError(code, detail); }
function text(value) { return String(value ?? '').trim(); }
function integer(value, positive, code, detail = '') {
  if (!Number.isInteger(value) || value < (positive ? 1 : 0)) fail(code, detail);
}
function tuple(values) { return JSON.stringify(values.map(value => value ?? null)); }
function padded(value) { return String(value ?? 0).padStart(12, '0'); }
function canonicalKey(field, row) {
  const keys = {
    sourceEvidenceGroups: [row.sourceEvidenceId], candidates: [row.candidateId],
    rankedPositions: [padded(row.rank), row.rankedPositionId],
    displayedPositions: [padded(row.displayRank), row.displayedPositionId],
    sourceCandidateEdges: [row.sourceEvidenceId, row.candidateId, row.buildDisposition, row.reasonCode],
    sourceDispositionRecords: [row.sourceEvidenceId, row.buildDisposition, row.reasonCode],
    candidateRankEdges: [padded(row.rank), row.candidateId],
    candidateDispositionRecords: [row.candidateId, row.finalDisposition, row.terminalStage, row.terminalReasonCode],
    rankDisplayEdges: [padded(row.rank), padded(row.displayRank), row.candidateId],
    rankDispositionRecords: [padded(row.rank), row.candidateId],
  };
  return tuple(keys[field] || []);
}
export function sortTopStoriesTraceRelationArray(field, rows = []) {
  return [...rows].sort((left, right) => canonicalKey(field, left)
    .localeCompare(canonicalKey(field, right)));
}
function assertCanonicalOrder(field, rows) {
  const actual = rows.map(row => canonicalKey(field, row));
  const expected = [...actual].sort((left, right) => left.localeCompare(right));
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    fail('TRACE_RELATION_ARRAY_ORDER_INVALID', field);
}
function uniqueMap(rows, field, code) {
  const result = new Map();
  rows.forEach(row => {
    const value = text(row?.[field]);
    if (!value || result.has(value)) fail(code, value || field);
    result.set(value, row);
  });
  return result;
}
function assertUniqueRelations(rows, field) {
  const keys = new Set();
  rows.forEach(row => {
    const key = canonicalKey(field, row);
    if (keys.has(key)) fail('TRACE_RELATION_DUPLICATE_RELATION', field);
    keys.add(key);
  });
}
function assertContiguous(rows, field, code) {
  const values = rows.map(row => row[field]).sort((left, right) => left - right);
  values.forEach((value, index) => { if (value !== index + 1) fail(code, `${field}:${value}`); });
}
function hasSensitiveKey(value) {
  if (Array.isArray(value)) return value.some(hasSensitiveKey);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, nested]) =>
    SENSITIVE_KEYS.has(key.toLowerCase()) || hasSensitiveKey(nested));
}
function expectedSourceId(group, digest) {
  return `source-evidence:${digestCanonicalJson({ sourceLane: group.sourceLane,
    sourceSectionKey: group.sourceSectionKey, evidenceDigest: digest })}`;
}
function validateSourceGroups(ledger) {
  ledger.sourceEvidenceGroups.forEach(group => {
    const digest = digestCanonicalJson(group.sanitizedEvidence);
    const objectEvidence = group.sanitizedEvidence && typeof group.sanitizedEvidence === 'object' &&
      !Array.isArray(group.sanitizedEvidence);
    const sectionValid = group.sourceSectionKey === null || typeof group.sourceSectionKey === 'string';
    const objectLane = group.sourceLane === TOP_STORY_SOURCE_LANES.SECTION_ITEMS_OBJECT;
    if (!SOURCE_LANES.has(group.sourceLane) || !sectionValid ||
      objectLane !== (group.sourceSectionKey !== null) || !objectEvidence ||
      hasSensitiveKey(group.sanitizedEvidence) || group.evidenceDigest !== digest ||
      group.sourceEvidenceId !== expectedSourceId(group, digest)) {
      fail('TRACE_RELATION_SOURCE_GROUP_INVALID', group.sourceEvidenceId);
    }
    integer(group.occurrenceCount, true, 'TRACE_RELATION_MULTIPLICITY_INVALID');
  });
}
function validatePositionNodes(ledger, candidateMap, rankedMap) {
  ledger.candidates.forEach(candidate => { if (!text(candidate.candidateKey))
    fail('TRACE_RELATION_CANDIDATE_KEY_INVALID'); });
  const rankedCandidates = new Set();
  ledger.rankedPositions.forEach(position => {
    integer(position.rank, true, 'TRACE_RELATION_RANK_INVALID');
    if (position.rankedPositionId !== `ranked-position:${position.rank}` ||
      !candidateMap.has(position.candidateId) || rankedCandidates.has(position.candidateId))
      fail('TRACE_RELATION_RANKED_POSITION_INVALID', position.rankedPositionId);
    rankedCandidates.add(position.candidateId);
  });
  const displayedCandidates = new Set();
  ledger.displayedPositions.forEach(position => {
    integer(position.displayRank, true, 'TRACE_RELATION_DISPLAY_RANK_INVALID');
    const ranked = rankedMap.get(position.rankedPositionId);
    if (position.displayedPositionId !== `displayed-position:${position.displayRank}` ||
      !ranked || ranked.candidateId !== position.candidateId ||
      displayedCandidates.has(position.candidateId))
      fail('TRACE_RELATION_DISPLAYED_POSITION_INVALID', position.displayedPositionId);
    displayedCandidates.add(position.candidateId);
  });
}
function validateSourceRelations(ledger, sourceMap, candidateMap) {
  const accounted = new Map();
  const promoted = new Map();
  const add = (map, key, value) => map.set(key, (map.get(key) || 0) + value);
  ['sourceCandidateEdges', 'sourceDispositionRecords'].forEach(field => assertUniqueRelations(ledger[field], field));
  ledger.sourceCandidateEdges.forEach(edge => {
    if (!sourceMap.has(edge.sourceEvidenceId)) fail('TRACE_RELATION_SOURCE_ENDPOINT_UNKNOWN');
    if (!candidateMap.has(edge.candidateId)) fail('TRACE_RELATION_CANDIDATE_ENDPOINT_UNKNOWN');
    integer(edge.occurrenceCount, true, 'TRACE_RELATION_MULTIPLICITY_INVALID');
    const reasons = { PROMOTED_TO_CANDIDATE: 'candidate_created',
      COLLAPSED_AS_DUPLICATE: 'duplicate_identity' };
    if (reasons[edge.buildDisposition] !== edge.reasonCode)
      fail('TRACE_RELATION_SOURCE_EDGE_DISPOSITION_INVALID', edge.buildDisposition);
    add(accounted, edge.sourceEvidenceId, edge.occurrenceCount);
    if (edge.buildDisposition === 'PROMOTED_TO_CANDIDATE')
      add(promoted, edge.candidateId, edge.occurrenceCount);
  });
  ledger.sourceDispositionRecords.forEach(record => {
    if (!sourceMap.has(record.sourceEvidenceId)) fail('TRACE_RELATION_SOURCE_ENDPOINT_UNKNOWN');
    if (record.candidateId !== null || record.buildDisposition !== 'INVALID_INPUT' ||
      !['invalid_input', 'missing_identity'].includes(record.reasonCode))
      fail('TRACE_RELATION_SOURCE_DISPOSITION_INVALID');
    integer(record.occurrenceCount, true, 'TRACE_RELATION_MULTIPLICITY_INVALID');
    add(accounted, record.sourceEvidenceId, record.occurrenceCount);
  });
  ledger.sourceEvidenceGroups.forEach(group => {
    if (accounted.get(group.sourceEvidenceId) !== group.occurrenceCount)
      fail('TRACE_RELATION_SOURCE_CONSERVATION_FAILED', group.sourceEvidenceId);
  });
  candidateMap.forEach((candidate, id) => { if (promoted.get(id) !== 1)
    fail('TRACE_RELATION_ORPHAN_CANDIDATE', id); });
}
function validateCandidateCoverage(ledger, candidateMap, rankedMap) {
  const edges = new Map();
  const dispositions = new Map();
  ['candidateRankEdges', 'candidateDispositionRecords'].forEach(field => assertUniqueRelations(ledger[field], field));
  ledger.candidateRankEdges.forEach(edge => {
    const position = rankedMap.get(edge.rankedPositionId);
    if (!candidateMap.has(edge.candidateId) || !position ||
      position.candidateId !== edge.candidateId || position.rank !== edge.rank ||
      edges.has(edge.candidateId)) fail('TRACE_RELATION_CANDIDATE_RANK_ENDPOINT_INVALID');
    edges.set(edge.candidateId, edge);
  });
  ledger.candidateDispositionRecords.forEach(record => {
    const allowed = ['REJECTED_BY_ADMISSION', 'ELIGIBLE_NOT_SELECTED'];
    if (!candidateMap.has(record.candidateId) || record.rankedPositionId !== null ||
      !allowed.includes(record.finalDisposition) || !text(record.terminalStage) ||
      !text(record.terminalReasonCode) || dispositions.has(record.candidateId)) {
      fail('TRACE_RELATION_CANDIDATE_DISPOSITION_INVALID', record.candidateId);
    }
    dispositions.set(record.candidateId, record);
  });
  candidateMap.forEach((candidate, id) => {
    if (Number(edges.has(id)) + Number(dispositions.has(id)) !== 1)
      fail('TRACE_RELATION_CANDIDATE_COVERAGE_INVALID', id);
  });
}
function validateRankCoverage(ledger, rankedMap, displayedMap) {
  const edges = new Map();
  const displayIds = new Set();
  const dispositions = new Map();
  ['rankDisplayEdges', 'rankDispositionRecords'].forEach(field => assertUniqueRelations(ledger[field], field));
  ledger.rankDisplayEdges.forEach(edge => {
    const ranked = rankedMap.get(edge.rankedPositionId);
    const displayed = displayedMap.get(edge.displayedPositionId);
    if (!ranked || !displayed || ranked.candidateId !== edge.candidateId ||
      displayed.candidateId !== edge.candidateId ||
      displayed.rankedPositionId !== edge.rankedPositionId || ranked.rank !== edge.rank ||
      displayed.displayRank !== edge.displayRank || edges.has(edge.rankedPositionId) ||
      displayIds.has(edge.displayedPositionId)) fail('TRACE_RELATION_RANK_DISPLAY_ENDPOINT_INVALID');
    edges.set(edge.rankedPositionId, edge);
    displayIds.add(edge.displayedPositionId);
  });
  ledger.rankDispositionRecords.forEach(record => {
    const ranked = rankedMap.get(record.rankedPositionId);
    if (!ranked || ranked.candidateId !== record.candidateId || ranked.rank !== record.rank ||
      record.finalDisposition !== 'RANKED_NOT_DISPLAYED' ||
      record.terminalReasonCode !== 'outside_display_limit' ||
      record.displayedPositionId !== null || dispositions.has(record.rankedPositionId)) {
      fail('TRACE_RELATION_RANK_DISPOSITION_INVALID');
    }
    dispositions.set(record.rankedPositionId, record);
  });
  rankedMap.forEach((position, id) => {
    if (Number(edges.has(id)) + Number(dispositions.has(id)) !== 1)
      fail('TRACE_RELATION_RANK_COVERAGE_INVALID', id);
  });
  if (displayIds.size !== displayedMap.size) fail('TRACE_RELATION_DISPLAY_COVERAGE_INVALID');
}
function validateExpectedEvidence(ledger, expected = {}) {
  const candidates = expected.candidates || expected.candidateEvidence;
  if (Array.isArray(candidates)) {
    const expectedMap = new Map(candidates.map(candidate =>
      [getEditorialIdentityCandidateId(candidate), candidate]));
    const expectedIds = [...expectedMap.keys()].sort((a, b) => a.localeCompare(b));
    if (JSON.stringify(ledger.candidates.map(row => row.candidateId)) !==
      JSON.stringify(expectedIds)) fail('TRACE_RELATION_ROOT_CANDIDATE_MISMATCH');
    ledger.candidates.forEach(row => {
      if (row.candidateKey !== getTopStoryDedupeKey(expectedMap.get(row.candidateId))) {
        fail('TRACE_RELATION_CANDIDATE_KEY_MISMATCH', row.candidateId);
      }
    });
  }
  const assertOrder = (code, rows, positions) => {
    if (!Array.isArray(rows)) return;
    const expectedIds = rows.map(getEditorialIdentityCandidateId);
    const actualIds = positions.map(row => row.candidateId);
    if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) fail(code);
  };
  assertOrder('TRACE_RELATION_ROOT_RANK_ORDER_MISMATCH', expected.ranked, ledger.rankedPositions);
  assertOrder('TRACE_RELATION_ROOT_DISPLAY_ORDER_MISMATCH', expected.displayed, ledger.displayedPositions);
  const counts = {
    rawInputCount: expected.rawInputCount,
    candidateCount: candidates?.length,
    rankedCount: expected.rankedCount,
    displayedCount: expected.displayedCount,
  };
  Object.entries(counts).forEach(([field, value]) => {
    if (value !== undefined && Number(value) !== ledger[field]) {
      fail('TRACE_RELATION_ROOT_COUNT_MISMATCH', field);
    }
  });
}
function validateDeclaredCounts(ledger) {
  const sum = rows => rows.reduce((total, row) => total + row.occurrenceCount, 0);
  const derived = {
    rawInputCount: sum(ledger.sourceEvidenceGroups),
    candidateCount: ledger.candidates.length,
    rankedCount: ledger.rankedPositions.length,
    displayedCount: ledger.displayedPositions.length,
  };
  Object.entries(derived).forEach(([field, value]) => {
    integer(ledger[field], false, 'TRACE_RELATION_DECLARED_COUNT_INVALID', field);
    if (ledger[field] !== value) fail('TRACE_RELATION_DECLARED_COUNT_MISMATCH', field);
  });
  const deltas = [
    ledger.rawInputCount - sum(ledger.sourceCandidateEdges) -
      sum(ledger.sourceDispositionRecords),
    ledger.candidateCount - ledger.candidateRankEdges.length -
      ledger.candidateDispositionRecords.length,
    ledger.rankedCount - ledger.candidateRankEdges.length,
    ledger.rankedCount - ledger.rankDisplayEdges.length -
      ledger.rankDispositionRecords.length,
    ledger.displayedCount - ledger.rankDisplayEdges.length,
  ];
  const accountingDelta = deltas.reduce((total, value) => total + Math.abs(value), 0);
  if (ledger.accountingDelta !== accountingDelta || accountingDelta !== 0 ||
    ledger.accountingConserved !== true) fail('TRACE_RELATION_ACCOUNTING_CONSERVATION_FAILED');
  return { ...derived, accountingDelta, accountingConserved: true };
}
export function validateTopStoriesTraceRelations(ledger = {}, expected = {}) {
  if (ledger.schemaVersion !== TOP_STORIES_TRACE_RELATION_SCHEMA_VERSION) {
    fail('TRACE_RELATION_SCHEMA_UNSUPPORTED', ledger.schemaVersion || 'missing');
  }
  TRACE_RELATION_ARRAY_FIELDS.forEach(field => {
    if (!Array.isArray(ledger[field])) fail('TRACE_RELATION_ARRAY_REQUIRED', field);
    assertCanonicalOrder(field, ledger[field]);
  });
  const sourceMap = uniqueMap(ledger.sourceEvidenceGroups, 'sourceEvidenceId', 'TRACE_RELATION_DUPLICATE_SOURCE_EVIDENCE_ID');
  const candidateMap = uniqueMap(ledger.candidates, 'candidateId', 'TRACE_RELATION_DUPLICATE_CANDIDATE_ID');
  const rankedMap = uniqueMap(ledger.rankedPositions, 'rankedPositionId', 'TRACE_RELATION_DUPLICATE_RANKED_POSITION_ID');
  const displayedMap = uniqueMap(ledger.displayedPositions, 'displayedPositionId', 'TRACE_RELATION_DUPLICATE_DISPLAYED_POSITION_ID');
  validateSourceGroups(ledger);
  validatePositionNodes(ledger, candidateMap, rankedMap);
  assertContiguous(ledger.rankedPositions, 'rank', 'TRACE_RELATION_RANKS_NOT_CONTIGUOUS');
  assertContiguous(ledger.displayedPositions, 'displayRank',
    'TRACE_RELATION_DISPLAY_RANKS_NOT_CONTIGUOUS');
  validateSourceRelations(ledger, sourceMap, candidateMap);
  validateCandidateCoverage(ledger, candidateMap, rankedMap);
  validateRankCoverage(ledger, rankedMap, displayedMap);
  validateExpectedEvidence(ledger, expected);
  return validateDeclaredCounts(ledger);
}
