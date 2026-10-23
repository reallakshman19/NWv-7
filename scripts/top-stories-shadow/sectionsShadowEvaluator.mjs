import { evaluateTopStories } from '../../src/services/topStories/topStoriesRanker.js';
import { getStorySourceFamilies } from '../../src/services/topStories/topStoriesSourceIdentity.js';
import { digestCanonicalJson } from './canonicalJson.mjs';
import { getTopStoriesNormalizationDigest } from './normalizationDigest.mjs';
import { validateSectionsShadowInputEpoch } from './sectionsShadowInputEpoch.mjs';
import { SECTIONS_SHADOW_EXECUTABLE_VERSIONS } from './sectionsShadowAuthorityVersions.mjs';

export const SECTIONS_SHADOW_DECISION_EVIDENCE_SCHEMA =
  'nw-sections-shadow-decision-evidence/v1';

function storyIdentity(story = {}) {
  return String(
    story.id || story.canonicalId || story.url || story.link || story.title || '',
  ).trim().toLowerCase();
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function jsonSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeDisplayDepth(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 10;
  return Math.max(0, Math.floor(number));
}

function selectedPositionMap(items = []) {
  return new Map(items.map((item, index) => [storyIdentity(item), index + 1]));
}

function buildScoreEvidence(story, selectedPositions, displayedPositions) {
  const rank = story?._topStoryRank || {};
  const identity = storyIdentity(story);
  return {
    identity,
    sourceFamilies: [...getStorySourceFamilies(story)].sort(),
    eventType: rank.eventType || 'unknown',
    eventQualified: rank.eventQualified !== false,
    eventEvidence: Array.isArray(rank.eventEvidence) ? [...rank.eventEvidence] : [],
    freshnessScore: Number(rank.freshnessScore || 0),
    publicInterestScore: Number(rank.publicInterestScore || 0),
    consensusScore: Number(rank.consensusScore || 0),
    breakingLiveScore: Number(rank.breakingLiveScore || 0),
    sourceQualityScore: Number(rank.sourceQualityScore || 0),
    locationRelevanceScore: Number(rank.locationRelevanceScore || 0),
    sourceCount: Number(rank.sourceCount || 0),
    corroboratingSourceCount: Number(rank.corroboratingSourceCount || 0),
    independentEvidenceCount: Number(rank.independentEvidenceCount || 0),
    ageHours: finiteOrNull(rank.ageHours),
    ageBand: rank.ageBand || null,
    slotBand: rank.slotBand || null,
    admissionReason: rank.admissionReason || null,
    admissionThreshold: finiteOrNull(rank.admissionThreshold),
    thresholdMargin: finiteOrNull(rank.thresholdMargin),
    penalties: Number(rank.penalties || 0),
    rawScore: Number(rank.scoreBreakdown?.rawScore || 0),
    normalizedScore: Number(rank.normalizedScore || 0),
    scoreBreakdown: jsonSafe(rank.scoreBreakdown || null),
    authoritativeRank: Number(rank.authoritativeRank || 0),
    selectedPosition: selectedPositions.get(identity) || null,
    displayedPosition: displayedPositions.get(identity) || null,
  };
}

function buildCandidateEvidence(evaluation) {
  const selectedPositions = selectedPositionMap(evaluation.selected);
  const displayedPositions = selectedPositionMap(evaluation.displayed);
  return evaluation.scoredCandidates.map(story =>
    buildScoreEvidence(story, selectedPositions, displayedPositions));
}

function buildDecisionDigestValue(evidence) {
  return {
    inputEvidenceDigest: evidence.inputEvidenceDigest,
    sourceRegistryVersion: evidence.sourceRegistryVersion,
    sourceRegistryDigest: evidence.sourceRegistryDigest,
    nowMs: evidence.nowMs,
    executableVersions: evidence.executableVersions,
    normalizationDigest: evidence.normalizationDigest,
    rankerPolicyDigest: evidence.rankerPolicyDigest,
    rawInputCount: evidence.rawInputCount,
    candidateCount: evidence.candidateCount,
    candidateBuildTrace: evidence.candidateBuildTrace,
    candidateEvidence: evidence.candidateEvidence,
    selectedIds: evidence.selectedIds,
    displayedIds: evidence.displayedIds,
    selectionTrace: evidence.selectionTrace,
  };
}

export function evaluateSectionsDecisionEvidence(input, options = {}) {
  const nowMs = Number(input?.nowMs);
  if (!Number.isFinite(nowMs) || nowMs < 0) {
    throw new TypeError('Sections decision evidence requires a finite non-negative nowMs');
  }
  const inputEvidenceDigest = String(input?.inputEvidenceDigest || '').toLowerCase();
  const sourceRegistryVersion = String(input?.sourceRegistryVersion || '').trim();
  const sourceRegistryDigest = String(input?.sourceRegistryDigest || '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(inputEvidenceDigest) ||
      !sourceRegistryVersion ||
      !/^[0-9a-f]{64}$/.test(sourceRegistryDigest)) {
    throw new TypeError('Sections decision evidence requires registry and input evidence authority');
  }
  const displayDepth = normalizeDisplayDepth(options.displayDepth ?? 10);
  const evaluation = evaluateTopStories({
    sectionItems: input.sectionItems || {},
    topFeedSignalItems: input.topFeedItems || [],
    settings: input.settings || {},
    nowMs,
  }, {
    nowMs,
    displayDepth,
  });
  const candidateEvidence = buildCandidateEvidence(evaluation);
  const evidence = {
    schemaVersion: SECTIONS_SHADOW_DECISION_EVIDENCE_SCHEMA,
    inputEvidenceDigest,
    sourceRegistryVersion,
    sourceRegistryDigest,
    nowMs,
    executableVersions: SECTIONS_SHADOW_EXECUTABLE_VERSIONS,
    normalizationDigest: getTopStoriesNormalizationDigest(evaluation),
    rankerPolicyDigest: digestCanonicalJson(evaluation.policySnapshot),
    rawInputCount: evaluation.rawInputCount,
    candidateCount: evaluation.candidates.length,
    candidateBuildTrace: jsonSafe(evaluation.candidateBuildTrace),
    candidateEvidence,
    selectedIds: evaluation.selected.map(storyIdentity),
    displayedIds: evaluation.displayed.map(storyIdentity),
    selectionTrace: jsonSafe(evaluation.selectionTrace),
  };
  return Object.freeze({
    ...evidence,
    decisionOutputDigest: digestCanonicalJson(buildDecisionDigestValue(evidence)),
  });
}

export function evaluateFrozenSectionsEpoch(epoch, options = {}) {
  const frozenEpoch = validateSectionsShadowInputEpoch(epoch, {
    expectedRegistryAuthority: options.expectedRegistryAuthority,
  });
  return evaluateSectionsDecisionEvidence(frozenEpoch, options);
}
