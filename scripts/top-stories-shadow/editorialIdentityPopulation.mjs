import {
  TOP_STORIES_IDENTITY_STATES,
} from '../../src/services/topStories/topStoriesStudyIdentity.js';

export const EDITORIAL_IDENTITY_POPULATION_SCHEMA_VERSION =
  'nw-top-stories-editorial-identity-population/v1';
export const EDITORIAL_IDENTITY_UNIT = 'EDITORIAL_IDENTITY';
export const RANKING_CANDIDATE_UNIT = 'RANKING_CANDIDATE';
export const EDITORIAL_IDENTITY_POPULATION_ROLE = 'ANALYTICAL_SIDE_POPULATION';
export const EDITORIAL_IDENTITY_FUNNEL_STAGE = 'editorial_identity_population';

const KNOWN_IDENTITY_STATES = new Set(
  Object.values(TOP_STORIES_IDENTITY_STATES),
);

const REASON_BY_STATE = Object.freeze({
  [TOP_STORIES_IDENTITY_STATES.AMBIGUOUS]: 'identity_ambiguous',
  [TOP_STORIES_IDENTITY_STATES.CONFLICT]: 'identity_conflict',
  [TOP_STORIES_IDENTITY_STATES.UNAVAILABLE]: 'identity_unavailable',
});

function increment(counts, key, amount = 1) {
  const normalized = String(key || 'unknown');
  counts[normalized] = (counts[normalized] || 0) + amount;
}

function sortedCounts(counts = {}) {
  return Object.fromEntries(Object.entries(counts).sort());
}

function normalizeIdentityState(identity = {}) {
  if (KNOWN_IDENTITY_STATES.has(identity.identityState)) {
    return identity.identityState;
  }
  return identity.editorialIdentity
    ? TOP_STORIES_IDENTITY_STATES.RESOLVED
    : TOP_STORIES_IDENTITY_STATES.UNAVAILABLE;
}

function totalCounts(counts = {}) {
  return Object.values(counts).reduce(
    (sum, count) => sum + Number(count || 0),
    0,
  );
}

export function buildEditorialIdentityPopulation(identifiedCandidates = []) {
  const candidates = Array.isArray(identifiedCandidates)
    ? identifiedCandidates
    : [];
  const identityStateCounts = {};
  const identityMethodCounts = {};
  const reasonCounts = {};
  const resolvedMultiplicity = new Map();
  let resolvedCandidateCount = 0;

  candidates.forEach(candidate => {
    const identity = candidate?._studyIdentity || {};
    const identityState = normalizeIdentityState(identity);
    const identityMethod = identity.identityMethod || 'none';
    const editorialIdentity = String(identity.editorialIdentity || '').trim();

    increment(identityStateCounts, identityState);
    increment(identityMethodCounts, identityMethod);

    if (
      identityState !== TOP_STORIES_IDENTITY_STATES.RESOLVED ||
      !editorialIdentity
    ) {
      const reasonCode = identityState === TOP_STORIES_IDENTITY_STATES.RESOLVED
        ? 'identity_resolved_without_value'
        : REASON_BY_STATE[identityState] || 'identity_unavailable';
      increment(reasonCounts, reasonCode);
      return;
    }

    resolvedCandidateCount += 1;
    resolvedMultiplicity.set(
      editorialIdentity,
      (resolvedMultiplicity.get(editorialIdentity) || 0) + 1,
    );
  });

  const editorialIdentities = [...resolvedMultiplicity.keys()].sort();
  const sharedIdentityCandidateCount = [...resolvedMultiplicity.values()]
    .reduce((count, multiplicity) => count + Math.max(0, multiplicity - 1), 0);
  if (sharedIdentityCandidateCount > 0) {
    increment(
      reasonCounts,
      'shared_editorial_identity',
      sharedIdentityCandidateCount,
    );
  }

  const inputCount = candidates.length;
  const outputCount = editorialIdentities.length;
  const unresolvedCandidateCount = inputCount - resolvedCandidateCount;
  const accountedCandidateCount = outputCount + totalCounts(reasonCounts);

  return {
    schemaVersion: EDITORIAL_IDENTITY_POPULATION_SCHEMA_VERSION,
    populationRole: EDITORIAL_IDENTITY_POPULATION_ROLE,
    inputUnit: RANKING_CANDIDATE_UNIT,
    inputCount,
    outputUnit: EDITORIAL_IDENTITY_UNIT,
    outputCount,
    resolvedCandidateCount,
    sharedIdentityCandidateCount,
    unresolvedCandidateCount,
    accountedCandidateCount,
    accountingDelta: inputCount - accountedCandidateCount,
    accountingConserved: accountedCandidateCount === inputCount,
    identityStateCounts: sortedCounts(identityStateCounts),
    identityMethodCounts: sortedCounts(identityMethodCounts),
    reasonCounts: sortedCounts(reasonCounts),
    editorialIdentities,
  };
}

export function buildEditorialIdentityFunnelStage(population = {}) {
  return {
    stage: EDITORIAL_IDENTITY_FUNNEL_STAGE,
    populationRole: EDITORIAL_IDENTITY_POPULATION_ROLE,
    populationSchemaVersion:
      population.schemaVersion || EDITORIAL_IDENTITY_POPULATION_SCHEMA_VERSION,
    inputUnit: population.inputUnit || RANKING_CANDIDATE_UNIT,
    inputCount: Number(population.inputCount || 0),
    outputUnit: population.outputUnit || EDITORIAL_IDENTITY_UNIT,
    outputCount: Number(population.outputCount || 0),
    reasonCounts: sortedCounts(population.reasonCounts || {}),
    accountingConserved: population.accountingConserved === true,
  };
}
