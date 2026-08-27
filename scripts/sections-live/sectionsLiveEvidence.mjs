import { evaluateSectionsDecisionEvidence } from '../top-stories-shadow/sectionsShadowEvaluator.mjs';
import { digestCanonicalJson } from '../top-stories-shadow/canonicalJson.mjs';
import {
  SECTIONS_LIVE_EVIDENCE_SCHEMA,
  LIVE_STORY_RETAIN_HOURS,
  assembleLiveSections,
  buildLiveAcquisitionEvidence,
} from './sectionsLiveAuthority.mjs';

function identityRows(laneResults) {
  return [...laneResults].sort((a, b) => a.lane.laneId.localeCompare(b.lane.laneId)).map(result => ({
    laneId: result.lane.laneId,
    identities: result.items.map(item => String(
      item.id || item.canonicalId || item.url || item.title || '',
    ).toLowerCase()),
  }));
}

function normalizedRows(laneResults) {
  return [...laneResults].sort((a, b) => a.lane.laneId.localeCompare(b.lane.laneId)).map(result => ({
    laneId: result.lane.laneId,
    items: result.items,
  }));
}

function candidateProjection(decisionEvidence, fields) {
  return decisionEvidence.candidateEvidence.map(row => fields.reduce((value, field) => ({
    ...value,
    [field]: row[field] ?? null,
  }), { identity: row.identity }));
}

function buildParityStages(laneResults, input, decisionEvidence) {
  return {
    identityDigest: digestCanonicalJson(identityRows(laneResults)),
    normalizationDigest: digestCanonicalJson(normalizedRows(laneResults)),
    classificationDigest: digestCanonicalJson(candidateProjection(decisionEvidence, [
      'eventType', 'eventQualified', 'eventEvidence',
    ])),
    admissionDigest: digestCanonicalJson(candidateProjection(decisionEvidence, [
      'slotBand', 'admissionReason', 'admissionThreshold', 'thresholdMargin',
    ])),
    rankingDigest: digestCanonicalJson(candidateProjection(decisionEvidence, [
      'authoritativeRank', 'selectedPosition', 'displayedPosition',
      'normalizedScore', 'scoreBreakdown',
    ])),
    sourceHealthDigest: digestCanonicalJson(input.sourceHealth),
  };
}

function buildSafetySummary(decisionEvidence) {
  const displayed = decisionEvidence.candidateEvidence.filter(row => row.displayedPosition !== null);
  let staleAdmissionCount = 0;
  let policyViolationCount = 0;
  let falsePublisherCorroborationCount = 0;
  for (const row of displayed) {
    if (Number(row.ageHours) > LIVE_STORY_RETAIN_HOURS) staleAdmissionCount += 1;
    if (row.admissionReason !== 'admitted' || Number(row.thresholdMargin) < -1e-9) {
      policyViolationCount += 1;
    }
    const familyCount = new Set((row.sourceFamilies || []).map(value => String(value).toLowerCase())).size;
    if (
      Number(row.corroboratingSourceCount || 0) > Math.max(0, familyCount - 1) ||
      Number(row.independentEvidenceCount || 0) > familyCount
    ) {
      falsePublisherCorroborationCount += 1;
    }
  }
  return {
    displayedDecisionCount: displayed.length,
    staleAdmissionCount,
    policyViolationCount,
    falsePublisherCorroborationCount,
  };
}

export function buildSectionsLiveEvidence({
  laneResults,
  nowMs,
  sourceRegistryVersion,
  sourceRegistryDigest,
}) {
  const input = assembleLiveSections(laneResults, nowMs);
  const decisionEvidence = evaluateSectionsDecisionEvidence({
    ...input,
    sourceRegistryVersion,
    sourceRegistryDigest,
  });
  return {
    schemaVersion: SECTIONS_LIVE_EVIDENCE_SCHEMA,
    acquisitionMode: 'INDEPENDENT_LIVE',
    nowMs,
    sourceRegistryVersion,
    sourceRegistryDigest,
    inputEvidenceDigest: input.inputEvidenceDigest,
    acquisition: buildLiveAcquisitionEvidence(laneResults),
    sectionItems: input.sectionItems,
    topFeedItems: input.topFeedItems,
    settings: input.settings,
    sourceHealth: input.sourceHealth,
    parityStages: buildParityStages(laneResults, input, decisionEvidence),
    safety: buildSafetySummary(decisionEvidence),
    candidateCount: decisionEvidence.candidateCount,
    decisionOutputDigest: decisionEvidence.decisionOutputDigest,
    decisionEvidence,
  };
}

export function compactSectionsLiveEvidence(evidence) {
  const sectionItemsText = JSON.stringify(evidence.sectionItems || {});
  const previewSectionItemsIncluded = new TextEncoder().encode(sectionItemsText).byteLength <= 600_000;
  return {
    schemaVersion: evidence.schemaVersion,
    acquisitionMode: evidence.acquisitionMode,
    nowMs: evidence.nowMs,
    sourceRegistryVersion: evidence.sourceRegistryVersion,
    sourceRegistryDigest: evidence.sourceRegistryDigest,
    inputEvidenceDigest: evidence.inputEvidenceDigest,
    acquisition: evidence.acquisition,
    parityStages: evidence.parityStages,
    safety: evidence.safety,
    candidateCount: evidence.candidateCount,
    previewSectionItemsIncluded,
    ...(previewSectionItemsIncluded ? { sectionItems: evidence.sectionItems } : {}),
    selectedIds: evidence.decisionEvidence.selectedIds,
    displayedIds: evidence.decisionEvidence.displayedIds,
    decisionOutputDigest: evidence.decisionOutputDigest,
  };
}
