import {
  normalizeTopStoryCanonicalUrl,
  TOP_STORIES_IDENTITY_STATES,
} from '../../src/services/topStories/topStoriesStudyIdentity.js';
import {
  EDITORIAL_IDENTITY_POPULATION_ROLE,
  EDITORIAL_IDENTITY_POPULATION_SCHEMA_VERSION_V1,
  EDITORIAL_IDENTITY_POPULATION_SCHEMA_VERSION_V2,
  EDITORIAL_IDENTITY_UNIT,
  RANKING_CANDIDATE_UNIT,
} from './editorialIdentityPopulation.mjs';

const STATES = TOP_STORIES_IDENTITY_STATES;
const KNOWN_STATES = new Set(Object.values(STATES));
const ARRAY_FIELDS = [
  'candidates',
  'editorialIdentities',
  'identityMembershipEdges',
  'identityDispositionRecords',
];
const REASON_BY_STATE = Object.freeze({
  [STATES.AMBIGUOUS]: 'identity_ambiguous',
  [STATES.CONFLICT]: 'identity_conflict',
  [STATES.UNAVAILABLE]: 'identity_unavailable',
});

function fail(code, detail = '') {
  throw new Error(`${code}${detail ? `: ${detail}` : ''}`);
}
function token(value) {
  return String(value || '').trim().toLowerCase();
}
function increment(counts, key) {
  counts[key] = (counts[key] || 0) + 1;
}
function sortedCounts(counts) {
  return Object.fromEntries(Object.entries(counts).sort());
}
function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}
function expectedReason(state) {
  return REASON_BY_STATE[state] || null;
}

export function getEditorialIdentityCandidateId(candidate = {}) {
  const explicitId = token(candidate.id);
  if (explicitId) return `id:${explicitId}`;
  const canonicalId = token(candidate.canonicalId || candidate.canonical_id);
  if (canonicalId) return `canonical-id:${canonicalId}`;
  const url = normalizeTopStoryCanonicalUrl(
    candidate.canonicalUrl || candidate.canonical_url || candidate.url || candidate.link,
  );
  if (url) return `canonical-url:${url}`;
  return fail('EDITORIAL_IDENTITY_CANDIDATE_ID_UNAVAILABLE');
}

function identityState(identity) {
  if (KNOWN_STATES.has(identity.identityState)) return identity.identityState;
  return fail(
    'EDITORIAL_IDENTITY_STATE_UNSUPPORTED',
    identity.identityState || 'missing',
  );
}
function resolvedRelation(candidateId, identity) {
  const editorialIdentity = String(identity.editorialIdentity || '').trim();
  const identityVersion = String(identity.identityVersion || '').trim();
  if (!editorialIdentity) fail('EDITORIAL_IDENTITY_RESOLVED_WITHOUT_VALUE');
  if (!identityVersion) fail('EDITORIAL_IDENTITY_VERSION_UNAVAILABLE');
  const editorialIdentityId = `${identityVersion}:${editorialIdentity}`;
  const identityMethod = identity.identityMethod || 'none';
  return {
    candidate: {
      candidateId,
      identityState: STATES.RESOLVED,
      identityMethod,
      editorialIdentityId,
      terminalReasonCode: null,
    },
    edge: { candidateId, editorialIdentityId, identityMethod, identityVersion },
    identity: { editorialIdentityId, editorialIdentity, identityVersion },
  };
}
function dispositionRelation(candidateId, state, identity) {
  const terminalReasonCode = expectedReason(state);
  return {
    candidate: {
      candidateId,
      identityState: state,
      identityMethod: identity.identityMethod || 'none',
      editorialIdentityId: null,
      terminalReasonCode,
    },
    disposition: {
      candidateId,
      identityState: state,
      terminalReasonCode,
      editorialIdentityId: null,
    },
  };
}
function relationFor(candidate) {
  const candidateId = getEditorialIdentityCandidateId(candidate);
  const identity = candidate?._studyIdentity || {};
  const state = identityState(identity);
  return state === STATES.RESOLVED
    ? resolvedRelation(candidateId, identity)
    : dispositionRelation(candidateId, state, identity);
}
function addIdentity(identityMap, identity) {
  if (!identity) return;
  const current = identityMap.get(identity.editorialIdentityId) || {
    ...identity,
    memberCandidateCount: 0,
  };
  identityMap.set(identity.editorialIdentityId, {
    ...current,
    memberCandidateCount: current.memberCandidateCount + 1,
  });
}
function sortRecords(records, identityMap) {
  const byCandidate = (left, right) =>
    left.candidateId.localeCompare(right.candidateId);
  return {
    candidates: records.candidates.sort(byCandidate),
    editorialIdentities: [...identityMap.values()].sort((left, right) =>
      left.editorialIdentityId.localeCompare(right.editorialIdentityId)),
    identityMembershipEdges: records.identityMembershipEdges.sort(byCandidate),
    identityDispositionRecords: records.identityDispositionRecords.sort(byCandidate),
  };
}
function relationRecords(input) {
  const records = {
    candidates: [],
    identityMembershipEdges: [],
    identityDispositionRecords: [],
  };
  const candidateIds = new Set();
  const identityMap = new Map();
  input.forEach(candidate => {
    const relation = relationFor(candidate);
    const id = relation.candidate.candidateId;
    if (candidateIds.has(id)) {
      fail('EDITORIAL_IDENTITY_DUPLICATE_CANDIDATE_ID', id);
    }
    candidateIds.add(id);
    records.candidates.push(relation.candidate);
    if (relation.edge) records.identityMembershipEdges.push(relation.edge);
    if (relation.disposition) {
      records.identityDispositionRecords.push(relation.disposition);
    }
    addIdentity(identityMap, relation.identity);
  });
  return sortRecords(records, identityMap);
}
function aggregateCounts(records) {
  const identityStateCounts = {};
  const identityMethodCounts = {};
  const reasonCounts = {};
  records.candidates.forEach(candidate => {
    increment(identityStateCounts, candidate.identityState);
    increment(identityMethodCounts, candidate.identityMethod || 'none');
  });
  records.identityDispositionRecords.forEach(record =>
    increment(reasonCounts, record.terminalReasonCode));
  return {
    identityStateCounts: sortedCounts(identityStateCounts),
    identityMethodCounts: sortedCounts(identityMethodCounts),
    reasonCounts: sortedCounts(reasonCounts),
  };
}
function countState(counts, state) {
  return counts.identityStateCounts[state] || 0;
}
function populationFrom(records) {
  const counts = aggregateCounts(records);
  const candidateCount = records.candidates.length;
  const resolvedCandidateCount = records.identityMembershipEdges.length;
  const dispositionCount = records.identityDispositionRecords.length;
  const distinctCount = records.editorialIdentities.length;
  return {
    schemaVersion: EDITORIAL_IDENTITY_POPULATION_SCHEMA_VERSION_V2,
    populationRole: EDITORIAL_IDENTITY_POPULATION_ROLE,
    inputUnit: RANKING_CANDIDATE_UNIT,
    inputCount: candidateCount,
    candidateCount,
    outputUnit: EDITORIAL_IDENTITY_UNIT,
    outputCount: distinctCount,
    distinctEditorialIdentityCount: distinctCount,
    resolvedCandidateCount,
    ambiguousCandidateCount: countState(counts, STATES.AMBIGUOUS),
    conflictCandidateCount: countState(counts, STATES.CONFLICT),
    unavailableCandidateCount: countState(counts, STATES.UNAVAILABLE),
    unresolvedCandidateCount: dispositionCount,
    sharedIdentityCandidateCount: resolvedCandidateCount - distinctCount,
    identityMembershipEdgeCount: resolvedCandidateCount,
    dispositionCount,
    accountedCandidateCount: resolvedCandidateCount + dispositionCount,
    accountingDelta: candidateCount - resolvedCandidateCount - dispositionCount,
    accountingConserved: true,
    ...counts,
    ...records,
  };
}

export function buildEditorialIdentityRelations(identifiedCandidates = []) {
  const input = Array.isArray(identifiedCandidates) ? identifiedCandidates : [];
  const population = populationFrom(relationRecords(input));
  validateEditorialIdentityRelations(population);
  return population;
}

function uniqueMap(rows, field, code) {
  const values = new Map();
  rows.forEach(row => {
    const value = String(row?.[field] || '');
    if (!value || values.has(value)) fail(code, value || field);
    values.set(value, row);
  });
  return values;
}
function validateCandidateRelation(candidate, edge, disposition) {
  const isResolved = candidate.identityState === STATES.RESOLVED;
  if (Number(Boolean(edge)) + Number(Boolean(disposition)) !== 1) {
    fail('EDITORIAL_IDENTITY_CANDIDATE_COVERAGE_INVALID', candidate.candidateId);
  }
  if (isResolved !== Boolean(edge)) {
    fail('EDITORIAL_IDENTITY_RELATION_TYPE_MISMATCH', candidate.candidateId);
  }
  if (edge && (
    edge.editorialIdentityId !== candidate.editorialIdentityId ||
    edge.identityMethod !== candidate.identityMethod
  )) {
    fail('EDITORIAL_IDENTITY_EDGE_CANDIDATE_MISMATCH', candidate.candidateId);
  }
  if (disposition && (
    disposition.identityState !== candidate.identityState ||
    disposition.terminalReasonCode !== candidate.terminalReasonCode ||
    disposition.terminalReasonCode !== expectedReason(candidate.identityState) ||
    disposition.editorialIdentityId !== null ||
    candidate.editorialIdentityId !== null
  )) {
    fail('EDITORIAL_IDENTITY_DISPOSITION_CANDIDATE_MISMATCH', candidate.candidateId);
  }
}
function validateCoverage(population, candidateMap) {
  const edgeMap = uniqueMap(
    population.identityMembershipEdges,
    'candidateId',
    'EDITORIAL_IDENTITY_DUPLICATE_MEMBERSHIP_EDGE',
  );
  const dispositionMap = uniqueMap(
    population.identityDispositionRecords,
    'candidateId',
    'EDITORIAL_IDENTITY_DUPLICATE_DISPOSITION',
  );
  candidateMap.forEach(candidate => validateCandidateRelation(
    candidate,
    edgeMap.get(candidate.candidateId),
    dispositionMap.get(candidate.candidateId),
  ));
  [...edgeMap.keys(), ...dispositionMap.keys()].forEach(id => {
    if (!candidateMap.has(id)) {
      fail('EDITORIAL_IDENTITY_UNKNOWN_CANDIDATE_REFERENCE', id);
    }
  });
}
function validateIdentityMembers(population) {
  const identityMap = uniqueMap(
    population.editorialIdentities,
    'editorialIdentityId',
    'EDITORIAL_IDENTITY_DUPLICATE_IDENTITY_RECORD',
  );
  const memberCounts = {};
  population.identityMembershipEdges.forEach(edge => {
    const identity = identityMap.get(edge.editorialIdentityId);
    if (!identity) {
      fail('EDITORIAL_IDENTITY_UNKNOWN_IDENTITY_REFERENCE', edge.editorialIdentityId);
    }
    if (
      edge.identityVersion !== identity.identityVersion ||
      identity.editorialIdentityId !==
        `${identity.identityVersion}:${identity.editorialIdentity}`
    ) {
      fail('EDITORIAL_IDENTITY_EDGE_IDENTITY_MISMATCH', edge.editorialIdentityId);
    }
    increment(memberCounts, edge.editorialIdentityId);
  });
  identityMap.forEach(identity => {
    const actual = Number(memberCounts[identity.editorialIdentityId] || 0);
    if (actual <= 0) {
      fail('EDITORIAL_IDENTITY_ORPHAN_IDENTITY_RECORD', identity.editorialIdentityId);
    }
    if (Number(identity.memberCandidateCount) !== actual) {
      fail('EDITORIAL_IDENTITY_MEMBER_COUNT_MISMATCH', identity.editorialIdentityId);
    }
  });
}
function assertDeclaredCount(population, field, actual) {
  if (Number(population[field]) !== actual) {
    fail('EDITORIAL_IDENTITY_DECLARED_COUNT_MISMATCH', field);
  }
}
function validatedCounts(population) {
  const counts = aggregateCounts(population);
  const candidateCount = population.candidates.length;
  const resolvedCandidateCount = countState(counts, STATES.RESOLVED);
  const dispositionCount = population.identityDispositionRecords.length;
  const distinctEditorialIdentityCount = population.editorialIdentities.length;
  const values = {
    candidateCount,
    resolvedCandidateCount,
    ambiguousCandidateCount: countState(counts, STATES.AMBIGUOUS),
    conflictCandidateCount: countState(counts, STATES.CONFLICT),
    unavailableCandidateCount: countState(counts, STATES.UNAVAILABLE),
    identityMembershipEdgeCount: population.identityMembershipEdges.length,
    dispositionCount,
    distinctEditorialIdentityCount,
  };
  const stateTotal = values.resolvedCandidateCount +
    values.ambiguousCandidateCount + values.conflictCandidateCount +
    values.unavailableCandidateCount;
  if (candidateCount !== stateTotal) {
    fail('EDITORIAL_IDENTITY_STATE_CONSERVATION_FAILED');
  }
  if (resolvedCandidateCount !== values.identityMembershipEdgeCount) {
    fail('EDITORIAL_IDENTITY_EDGE_CONSERVATION_FAILED');
  }
  Object.entries(values).forEach(([field, actual]) =>
    assertDeclaredCount(population, field, actual));
  const aliases = {
    inputCount: candidateCount,
    outputCount: distinctEditorialIdentityCount,
    unresolvedCandidateCount: dispositionCount,
    sharedIdentityCandidateCount:
      resolvedCandidateCount - distinctEditorialIdentityCount,
    accountedCandidateCount: candidateCount,
    accountingDelta: 0,
  };
  Object.entries(aliases).forEach(([field, actual]) =>
    assertDeclaredCount(population, field, actual));
  if (population.accountingConserved !== true) {
    fail('EDITORIAL_IDENTITY_CONSERVATION_FLAG_INVALID');
  }
  return { ...values, accountingConserved: true };
}

export function validateEditorialIdentityRelations(population = {}) {
  if (population.schemaVersion !== EDITORIAL_IDENTITY_POPULATION_SCHEMA_VERSION_V2) {
    return fail('EDITORIAL_IDENTITY_RELATION_SCHEMA_UNSUPPORTED');
  }
  ARRAY_FIELDS.forEach(field => {
    if (!Array.isArray(population[field])) {
      fail('EDITORIAL_IDENTITY_RELATION_ARRAY_REQUIRED', field);
    }
  });
  const candidateMap = uniqueMap(
    population.candidates,
    'candidateId',
    'EDITORIAL_IDENTITY_DUPLICATE_CANDIDATE_ID',
  );
  validateCoverage(population, candidateMap);
  validateIdentityMembers(population);
  return validatedCounts(population);
}

export function getDisplayedIdentityEvidence(displayed = []) {
  const displayedEditorialIdentities = [];
  const displayedIdentityStateCounts = {};
  displayed.forEach(item => {
    const identity = item?._studyIdentity || {};
    const state = identity.identityState ||
      (identity.editorialIdentity ? STATES.RESOLVED : STATES.UNAVAILABLE);
    increment(displayedIdentityStateCounts, state);
    if (state === STATES.RESOLVED && identity.editorialIdentity) {
      displayedEditorialIdentities.push(identity.editorialIdentity);
    }
  });
  return {
    displayedEditorialIdentities,
    displayedResolvedIdentityCount: displayedEditorialIdentities.length,
    displayedUnresolvedIdentityCount:
      Math.max(0, displayed.length - displayedEditorialIdentities.length),
    displayedIdentityStateCounts,
  };
}
function invalidEvidence(schemaVersion, message) {
  return {
    schemaVersion,
    editorialIdentityInputCount: null,
    editorialIdentityCount: null,
    resolvedIdentityCandidateCount: null,
    sharedIdentityCandidateCount: null,
    unresolvedIdentityCandidateCount: null,
    identityResolutionCoverage: null,
    identityAccountingConserved: false,
    identityStateCounts: {},
    identityMethodCounts: {},
    identityReasonCounts: {},
    identityRelationValidationError: message,
  };
}
function v2Evidence(population, stage) {
  try {
    const counts = validateEditorialIdentityRelations(population);
    return {
      editorialIdentityInputCount: counts.candidateCount,
      editorialIdentityCount: counts.distinctEditorialIdentityCount,
      resolvedIdentityCandidateCount: counts.resolvedCandidateCount,
      sharedIdentityCandidateCount:
        counts.resolvedCandidateCount - counts.distinctEditorialIdentityCount,
      unresolvedIdentityCandidateCount: counts.dispositionCount,
      identityResolutionCoverage: counts.candidateCount
        ? counts.resolvedCandidateCount / counts.candidateCount
        : null,
      identityAccountingConserved: true,
      identityStateCounts: population.identityStateCounts || {},
      identityMethodCounts: population.identityMethodCounts || {},
      identityReasonCounts: population.reasonCounts || stage.reasonCounts || {},
      identityRelationValidationError: null,
    };
  } catch (error) {
    return invalidEvidence(population.schemaVersion, error.message);
  }
}
function v1Evidence(population, stage, schemaVersion) {
  const inputCount = numberOrNull(population.inputCount ?? stage.inputCount);
  const outputCount = numberOrNull(population.outputCount ?? stage.outputCount);
  const resolved = numberOrNull(population.resolvedCandidateCount);
  return {
    schemaVersion,
    editorialIdentityInputCount: inputCount,
    editorialIdentityCount: outputCount,
    resolvedIdentityCandidateCount: resolved,
    sharedIdentityCandidateCount:
      numberOrNull(population.sharedIdentityCandidateCount),
    unresolvedIdentityCandidateCount:
      numberOrNull(population.unresolvedCandidateCount),
    identityResolutionCoverage:
      inputCount && resolved !== null ? resolved / inputCount : null,
    identityAccountingConserved:
      population.accountingConserved ?? stage.accountingConserved ?? null,
    identityStateCounts: population.identityStateCounts || {},
    identityMethodCounts: population.identityMethodCounts || {},
    identityReasonCounts: population.reasonCounts || stage.reasonCounts || {},
    identityRelationValidationError: null,
  };
}

export function getEditorialIdentityEvidence(observation = {}, stageName) {
  const population = observation.editorialIdentityPopulation || {};
  const stage = (observation.funnel || [])
    .find(row => row.stage === stageName) || {};
  const schemaVersion = population.schemaVersion ||
    stage.populationSchemaVersion || null;
  if (schemaVersion === EDITORIAL_IDENTITY_POPULATION_SCHEMA_VERSION_V2) {
    return { schemaVersion, ...v2Evidence(population, stage) };
  }
  if (
    schemaVersion !== null &&
    schemaVersion !== EDITORIAL_IDENTITY_POPULATION_SCHEMA_VERSION_V1
  ) {
    return invalidEvidence(
      schemaVersion,
      `EDITORIAL_IDENTITY_ANALYTICS_SCHEMA_UNSUPPORTED: ${schemaVersion}`,
    );
  }
  return v1Evidence(population, stage, schemaVersion);
}

export function summarizeIdentityAccountingBySchema(rows = []) {
  const grouped = {};
  rows.forEach(row => {
    const version = row.editorialIdentityPopulationSchemaVersion || 'unversioned';
    const entry = grouped[version] || { observationCount: 0, checks: [] };
    entry.observationCount += 1;
    if (typeof row.identityAccountingConserved === 'boolean') {
      entry.checks.push(row.identityAccountingConserved);
    }
    grouped[version] = entry;
  });
  return Object.fromEntries(Object.entries(grouped).sort().map(
    ([version, entry]) => [version, {
      observationCount: entry.observationCount,
      evidenceCount: entry.checks.length,
      accountingConserved: entry.checks.length
        ? entry.checks.every(Boolean)
        : null,
    }],
  ));
}
