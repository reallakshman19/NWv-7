import { digestCanonicalJson } from '../top-stories-shadow/canonicalJson.mjs';
import { SECTIONS_LIVE_EVIDENCE_SCHEMA } from './sectionsLiveAuthority.mjs';

export const LIVE_DRIFT_CLASSIFICATIONS = Object.freeze([
  'MATCH',
  'ACQUISITION_DRIFT',
  'IDENTITY_DRIFT',
  'NORMALIZATION_DRIFT',
  'CLASSIFICATION_DRIFT',
  'ADMISSION_DRIFT',
  'RANKING_DRIFT',
  'SOURCE_HEALTH_DRIFT',
  'INFRASTRUCTURE_DRIFT',
  'UNKNOWN_DRIFT',
]);

function result(classification, firstDivergentStage, detail = {}) {
  return { classification, firstDivergentStage, detail };
}

function laneMap(evidence) {
  return new Map((evidence.acquisition || []).map(lane => [lane.laneId, lane]));
}

function sameKeys(left, right) {
  return left.size === right.size && [...left.keys()].every(key => right.has(key));
}

function differingKey(left, right, projector) {
  for (const key of [...left.keys()].sort()) {
    if (digestCanonicalJson(projector(left.get(key))) !== digestCanonicalJson(projector(right.get(key)))) {
      return key;
    }
  }
  return null;
}

function overlap(left = [], right = []) {
  const rightSet = new Set(right);
  return left.filter(value => rightSet.has(value)).length;
}

function ratio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : null;
}

export function summarizeSectionsLiveParity(reference, shadow) {
  const referenceLanes = laneMap(reference || {});
  const shadowLanes = laneMap(shadow || {});
  let dispositionMatches = 0;
  for (const [laneId, lane] of referenceLanes) {
    const peer = shadowLanes.get(laneId);
    if (peer && peer.disposition === lane.disposition && peer.itemCount === lane.itemCount) {
      dispositionMatches += 1;
    }
  }
  const referenceSelected = reference?.selectedIds || [];
  const shadowSelected = shadow?.selectedIds || [];
  const referenceDisplayed = reference?.displayedIds || [];
  const shadowDisplayed = shadow?.displayedIds || [];
  const selectedOverlap = overlap(referenceSelected, shadowSelected);
  const displayedOverlap = overlap(referenceDisplayed, shadowDisplayed);
  return {
    referenceLaneCount: referenceLanes.size,
    shadowLaneCount: shadowLanes.size,
    laneDispositionMatches: dispositionMatches,
    referenceOkLanes: [...referenceLanes.values()].filter(lane => lane.disposition === 'OK').length,
    shadowOkLanes: [...shadowLanes.values()].filter(lane => lane.disposition === 'OK').length,
    referenceCandidateCount: Number(reference?.candidateCount || 0),
    shadowCandidateCount: Number(shadow?.candidateCount || 0),
    selectedOverlap,
    selectedReferenceCount: referenceSelected.length,
    selectedShadowCount: shadowSelected.length,
    displayedOverlap,
    displayedReferenceCount: referenceDisplayed.length,
    displayedShadowCount: shadowDisplayed.length,
    canonicalReferenceCoverage: ratio(displayedOverlap, referenceDisplayed.length),
    shadowPrecision: ratio(displayedOverlap, shadowDisplayed.length),
    top10OverlapRate: ratio(displayedOverlap, Math.max(referenceDisplayed.length, shadowDisplayed.length)),
    staleAdmissionCount: Number(shadow?.safety?.staleAdmissionCount ?? -1),
    policyViolationCount: Number(shadow?.safety?.policyViolationCount ?? -1),
    falsePublisherCorroborationCount: Number(shadow?.safety?.falsePublisherCorroborationCount ?? -1),
    inputDigestMatch: reference?.inputEvidenceDigest === shadow?.inputEvidenceDigest,
    decisionDigestMatch: reference?.decisionOutputDigest === shadow?.decisionOutputDigest,
  };
}

export function classifySectionsLiveParity(reference, shadow) {
  if (!reference || !shadow || reference.schemaVersion !== SECTIONS_LIVE_EVIDENCE_SCHEMA ||
      shadow.schemaVersion !== SECTIONS_LIVE_EVIDENCE_SCHEMA) {
    return result('INFRASTRUCTURE_DRIFT', 'infrastructure', { reason: 'missing_or_unsupported_evidence' });
  }
  if (reference.sourceRegistryVersion !== shadow.sourceRegistryVersion ||
      reference.sourceRegistryDigest !== shadow.sourceRegistryDigest) {
    return result('IDENTITY_DRIFT', 'source_registry', { reason: 'source_registry_authority_mismatch' });
  }

  const referenceLanes = laneMap(reference);
  const shadowLanes = laneMap(shadow);
  if (!sameKeys(referenceLanes, shadowLanes)) {
    return result('INFRASTRUCTURE_DRIFT', 'acquisition', {
      reason: 'lane_set_incomplete',
      referenceLaneCount: referenceLanes.size,
      shadowLaneCount: shadowLanes.size,
    });
  }
  const acquisitionLane = differingKey(referenceLanes, shadowLanes, lane => ({
    disposition: lane.disposition,
    itemCount: lane.itemCount,
    httpStatus: lane.httpStatus,
    errorCode: lane.errorCode,
  }));
  if (acquisitionLane) {
    return result('ACQUISITION_DRIFT', 'acquisition', { laneId: acquisitionLane });
  }

  if (reference.parityStages?.identityDigest !== shadow.parityStages?.identityDigest) {
    return result('IDENTITY_DRIFT', 'identity', { reason: 'normalized_story_identity_set_changed' });
  }
  if (reference.parityStages?.normalizationDigest !== shadow.parityStages?.normalizationDigest) {
    return result('NORMALIZATION_DRIFT', 'normalization', { reason: 'normalized_story_fields_changed' });
  }

  if (reference.parityStages?.classificationDigest !== shadow.parityStages?.classificationDigest) {
    return result('CLASSIFICATION_DRIFT', 'classification', { reason: 'classification_evidence_changed' });
  }
  if (reference.parityStages?.admissionDigest !== shadow.parityStages?.admissionDigest) {
    return result('ADMISSION_DRIFT', 'admission', { reason: 'admission_evidence_changed' });
  }
  if (reference.parityStages?.rankingDigest !== shadow.parityStages?.rankingDigest ||
      reference.decisionOutputDigest !== shadow.decisionOutputDigest) {
    return result('RANKING_DRIFT', 'ranking', { reason: 'ranking_evidence_changed' });
  }
  if (reference.parityStages?.sourceHealthDigest !== shadow.parityStages?.sourceHealthDigest) {
    return result('SOURCE_HEALTH_DRIFT', 'source_health', { reason: 'source_health_changed' });
  }
  if (reference.inputEvidenceDigest !== shadow.inputEvidenceDigest) {
    return result('UNKNOWN_DRIFT', 'unknown', { reason: 'input_digest_changed_after_equal_boundaries' });
  }
  return result('MATCH', null, {
    candidateCount: reference.candidateCount,
    decisionOutputDigest: reference.decisionOutputDigest,
  });
}
