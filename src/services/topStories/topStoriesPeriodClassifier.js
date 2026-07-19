export const TOP_STORIES_PERIOD_CLASSIFIER_VERSION =
  'nw-top-stories-period-classifier-v1';
export const TOP_STORIES_PERIOD_CLASSIFIER_SCOPE_VERSION =
  'nw-top-stories-period-classifier-v2';

const SUPPORTED_PERIOD_CLASSIFIER_VERSIONS = new Set([
  TOP_STORIES_PERIOD_CLASSIFIER_VERSION,
  TOP_STORIES_PERIOD_CLASSIFIER_SCOPE_VERSION,
]);

export const DEFAULT_TOP_STORIES_PERIOD_POLICY = Object.freeze({
  version: TOP_STORIES_PERIOD_CLASSIFIER_VERSION,
  criticalEventTypes: Object.freeze([
    'public_safety',
    'disaster',
    'war_conflict',
    'civic_alert',
    'governance_crisis',
  ]),
  minimumIndependentEvidence: 1,
  requireAdmittedCandidate: true,
  includeOutsideRankerLimit: true,
  requireSourceHealth: true,
  materialScoreDelta: 0.12,
  materialSourceCountDelta: 1,
});

function hashText(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function stablePolicyDigest(policy) {
  const ordered = {
    version: policy.version,
    criticalEventTypes: [...policy.criticalEventTypes].sort(),
    minimumIndependentEvidence: policy.minimumIndependentEvidence,
    requireAdmittedCandidate: policy.requireAdmittedCandidate,
    includeOutsideRankerLimit: policy.includeOutsideRankerLimit,
    requireSourceHealth: policy.requireSourceHealth,
    materialScoreDelta: policy.materialScoreDelta,
    materialSourceCountDelta: policy.materialSourceCountDelta,
  };
  return hashText(JSON.stringify(ordered));
}

function getIdentity(candidate = {}) {
  return candidate._studyIdentity?.editorialIdentity ||
    candidate.editorialIdentity ||
    candidate.id ||
    candidate.canonicalId ||
    null;
}

function getRank(candidate = {}) {
  return candidate._topStoryRank || candidate.rank || {};
}

function getScoredCandidates(snapshot = {}, candidateTrace) {
  if (Array.isArray(snapshot.scoredCandidates)) return snapshot.scoredCandidates;
  if (Array.isArray(candidateTrace?.scoredCandidates)) {
    return candidateTrace.scoredCandidates;
  }
  if (Array.isArray(candidateTrace)) return candidateTrace;
  return [];
}

function getRankedCandidatePopulation(snapshot = {}, candidateTrace) {
  const candidateSources = [
    snapshot.rankedCandidates,
    snapshot.ranked,
    candidateTrace?.rankedCandidates,
    candidateTrace?.ranked,
  ];
  const candidates = candidateSources.find(Array.isArray);
  return {
    available: Boolean(candidates),
    candidates: candidates || [],
  };
}

function getPolicyScopeUncertainty(policy) {
  if (!SUPPORTED_PERIOD_CLASSIFIER_VERSIONS.has(policy.version)) {
    return 'period_classifier_version_unsupported';
  }
  if (
    policy.version === TOP_STORIES_PERIOD_CLASSIFIER_VERSION &&
    policy.includeOutsideRankerLimit === false
  ) {
    return 'period_classifier_scope_requires_v2';
  }
  return null;
}

function getCandidatePopulation(snapshot = {}, candidateTrace, policy) {
  if (policy.includeOutsideRankerLimit !== false) {
    return {
      available: true,
      candidates: getScoredCandidates(snapshot, candidateTrace),
    };
  }
  return getRankedCandidatePopulation(snapshot, candidateTrace);
}

function getCandidatePopulationUncertainty(population, label, policy) {
  if (policy.includeOutsideRankerLimit !== false || population.available) {
    return null;
  }
  return `${label}_ranked_candidate_population_missing`;
}

function getSnapshotUncertainty(snapshot, label) {
  if (!snapshot) return `${label}_snapshot_missing`;
  if (snapshot.completenessState && snapshot.completenessState !== 'COMPLETE') {
    return `${label}_snapshot_incomplete`;
  }
  if (snapshot.analyticalEligibility && snapshot.analyticalEligibility !== 'ELIGIBLE') {
    return `${label}_snapshot_ineligible`;
  }
  return null;
}

function getSourceHealthUncertainty(sourceHealth, policy) {
  if (!policy.requireSourceHealth) return null;
  if (!sourceHealth || typeof sourceHealth !== 'object') {
    return 'source_health_missing';
  }
  if (sourceHealth.ok === false || sourceHealth.complete === false) {
    return 'source_health_incomplete';
  }
  if (Number(sourceHealth.failedSourceCount || 0) > 0) {
    return 'source_health_degraded';
  }
  return null;
}

function getIdentityUncertainty(identityTransitions = {}) {
  if (identityTransitions.versionBoundary) return 'identity_version_boundary';
  const states = identityTransitions.currentStateCounts || {};
  if (Number(states.IDENTITY_CONFLICT || 0) > 0) return 'identity_conflict';
  return null;
}

function isAdmitted(rank, policy) {
  if (!policy.requireAdmittedCandidate) return true;
  return !['rejected', 'expired'].includes(rank.slotBand);
}

function hasRequiredEvidence(rank, policy) {
  if (rank.coldStartCritical) return true;
  return Number(rank.independentEvidenceCount || 0) >=
    Number(policy.minimumIndependentEvidence || 0);
}

function isCriticalCandidate(candidate, policy) {
  const rank = getRank(candidate);
  return policy.criticalEventTypes.includes(rank.eventType) &&
    rank.eventQualified !== false &&
    isAdmitted(rank, policy) &&
    hasRequiredEvidence(rank, policy);
}

function indexCandidates(candidates = []) {
  return new Map(candidates
    .map(candidate => [getIdentity(candidate), candidate])
    .filter(([identity]) => Boolean(identity)));
}

function isMaterialUpdate(prior, current, policy) {
  const before = getRank(prior);
  const after = getRank(current);
  const scoreDelta = Number(after.normalizedScore || 0) -
    Number(before.normalizedScore || 0);
  const sourceDelta = Number(after.sourceCount || 0) -
    Number(before.sourceCount || 0);
  const priorityIncreased = Number(after.priorityBucket || 0) >
    Number(before.priorityBucket || 0);
  return scoreDelta >= policy.materialScoreDelta ||
    sourceDelta >= policy.materialSourceCountDelta ||
    priorityIncreased;
}

function findActiveEvidence(priorCandidates, currentCandidates, policy) {
  const priorMap = indexCandidates(priorCandidates);
  const evidence = [];
  currentCandidates.forEach(candidate => {
    if (!isCriticalCandidate(candidate, policy)) return;
    const identity = getIdentity(candidate);
    const prior = priorMap.get(identity);
    if (!prior) {
      evidence.push({
        identity,
        reasonCode: getRank(candidate).coldStartCritical
          ? 'new_cold_start_critical_candidate'
          : 'new_independently_qualified_critical_candidate',
      });
      return;
    }
    if (isMaterialUpdate(prior, candidate, policy)) {
      evidence.push({
        identity,
        reasonCode: 'material_critical_event_update',
      });
    }
  });
  return evidence;
}

function buildPolicy(classifierPolicy) {
  return {
    ...DEFAULT_TOP_STORIES_PERIOD_POLICY,
    ...classifierPolicy,
    criticalEventTypes: classifierPolicy.criticalEventTypes ||
      DEFAULT_TOP_STORIES_PERIOD_POLICY.criticalEventTypes,
  };
}

function getUncertainties({
  priorSnapshot,
  currentSnapshot,
  priorPopulation,
  currentPopulation,
  sourceHealth,
  identityTransitions,
  policy,
}) {
  return [
    getPolicyScopeUncertainty(policy),
    getSnapshotUncertainty(priorSnapshot, 'prior'),
    getSnapshotUncertainty(currentSnapshot, 'current'),
    getCandidatePopulationUncertainty(priorPopulation, 'prior', policy),
    getCandidatePopulationUncertainty(currentPopulation, 'current', policy),
    getSourceHealthUncertainty(sourceHealth, policy),
    getIdentityUncertainty(identityTransitions),
  ].filter(Boolean);
}

function buildClassificationResult(policy, activeEvidence, uncertainties) {
  let periodClass = 'calm';
  let reasonCodes = ['no_new_qualified_critical_event'];
  let evidenceIds = activeEvidence.map(item => item.identity).filter(Boolean);
  if (uncertainties.length > 0) {
    periodClass = 'uncertain';
    reasonCodes = uncertainties;
    evidenceIds = [];
  } else if (activeEvidence.length > 0) {
    periodClass = 'active';
    reasonCodes = [...new Set(activeEvidence.map(item => item.reasonCode))];
  }
  return {
    periodClass,
    reasonCodes,
    evidenceIds,
    policyVersion: policy.version,
    policyDigest: stablePolicyDigest(policy),
  };
}

export function classifyTopStoriesPeriod({
  priorSnapshot,
  currentSnapshot,
  candidateTrace,
  sourceHealth,
  identityTransitions,
  classifierPolicy = {},
} = {}) {
  const policy = buildPolicy(classifierPolicy);
  const priorPopulation = getCandidatePopulation(priorSnapshot, null, policy);
  const currentPopulation = getCandidatePopulation(
    currentSnapshot,
    candidateTrace,
    policy,
  );
  const uncertainties = getUncertainties({
    priorSnapshot,
    currentSnapshot,
    priorPopulation,
    currentPopulation,
    sourceHealth,
    identityTransitions,
    policy,
  });
  const activeEvidence = uncertainties.length > 0
    ? []
    : findActiveEvidence(
      priorPopulation.candidates,
      currentPopulation.candidates,
      policy,
    );
  return buildClassificationResult(policy, activeEvidence, uncertainties);
}
