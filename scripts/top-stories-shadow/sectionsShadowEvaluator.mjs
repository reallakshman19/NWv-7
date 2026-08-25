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
    ageHours: Number(rank.ageHours),
    ageBand: rank.ageBand || null,
    slotBand: rank.slotBand || null,
    admissionReason: rank.admissionReason || null,
    admissionThreshold: rank.admissionThreshold ?? null,
    thresholdMargin: rank.thresholdMargin ?? null,
    penalties: Number(rank.penalties || 0),
    rawScore: Number(rank.scoreBreakdown?.rawScore || 0),
    normalizedScore: Number(rank.normalizedScore || 0),
    scoreBreakdown: rank.scoreBreakdown || null,
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

export function evaluateFrozenSectionsEpoch(epoch, options = {}) {
  const frozenEpoch = validateSectionsShadowInputEpoch(epoch, {
    expectedRegistryAuthority: options.expectedRegistryAuthority,
  });
  const displayDepth = Math.max(0, Math.floor(Number(options.displayDepth ?? 10)));
  const evaluation = evaluateTopStories({
    sectionItems: frozenEpoch.sectionItems,
    topFeedItems: frozenEpoch.topFeedItems,
    settings: frozenEpoch.settings,
    nowMs: frozenEpoch.nowMs,
  }, {
    nowMs: frozenEpoch.nowMs,
    displayDepth,
  });
  const candidateEvidence = buildCandidateEvidence(evaluation);
  const evidence = {
    schemaVersion: SECTIONS_SHADOW_DECISION_EVIDENCE_SCHEMA,
    inputEvidenceDigest: frozenEpoch.inputEvidenceDigest,
    sourceRegistryVersion: frozenEpoch.sourceRegistryVersion,
    sourceRegistryDigest: frozenEpoch.sourceRegistryDigest,
    nowMs: frozenEpoch.nowMs,
    executableVersions: SECTIONS_SHADOW_EXECUTABLE_VERSIONS,
    normalizationDigest: getTopStoriesNormalizationDigest(evaluation),
    rankerPolicyDigest: digestCanonicalJson(evaluation.policySnapshot),
    rawInputCount: evaluation.rawInputCount,
    candidateCount: evaluation.candidates.length,
    candidateBuildTrace: evaluation.candidateBuildTrace,
    candidateEvidence,
    selectedIds: evaluation.selected.map(storyIdentity),
    displayedIds: evaluation.displayed.map(storyIdentity),
    selectionTrace: evaluation.selectionTrace,
  };
  return Object.freeze({
    ...evidence,
    decisionOutputDigest: digestCanonicalJson(buildDecisionDigestValue(evidence)),
  });
}
