import { evaluateTopStories } from '../../src/services/topStories/topStoriesRanker.js';
import { attachTopStoryStudyIdentities } from '../../src/services/topStories/topStoriesStudyIdentity.js';
import {
  digestCanonicalJson,
  getRankingInputDigest,
  VOLATILE_INPUT_KEYS,
} from './canonicalJson.mjs';
import {
  deriveObservationStates,
  sanitizeObservationEvidence,
  sanitizeStoryEvidence,
  validateRepositoryReplayInput,
} from './inputContract.mjs';
import { validateTopStoriesStudyConfig } from './studyConfig.mjs';

export const RUN_SNAPSHOT_SCHEMA_VERSION = 'nw-top-stories-run-snapshot/v1';

const REQUIRED_METADATA = [
  'repositorySha',
  'workflowRunId',
  'workflowRunAttempt',
  'scheduledAt',
  'runAt',
];

function assertMetadata(metadata = {}) {
  REQUIRED_METADATA.forEach(field => {
    if (metadata[field] === undefined || metadata[field] === null || metadata[field] === '') {
      throw new Error(`Observation metadata requires ${field}`);
    }
  });
  const scheduledMs = Date.parse(metadata.scheduledAt);
  const runMs = Date.parse(metadata.runAt);
  if (!Number.isFinite(scheduledMs) || !Number.isFinite(runMs)) {
    throw new Error('scheduledAt and runAt must be valid timestamps');
  }
  if (runMs < scheduledMs) {
    throw new Error('runAt cannot be earlier than scheduledAt');
  }
  const attempt = Number(metadata.workflowRunAttempt);
  if (!Number.isInteger(attempt) || attempt <= 0) {
    throw new Error('workflowRunAttempt must be a positive integer');
  }
}

function countReasons(rows = [], field) {
  return rows.reduce((counts, row) => {
    const key = row?.[field] || 'unknown';
    return { ...counts, [key]: (counts[key] || 0) + 1 };
  }, {});
}

function buildFunnel(evaluation) {
  const admissionRejected = evaluation.selectionTrace.filter(row => (
    row.finalDisposition === 'REJECTED_BY_ADMISSION'
  ));
  const notSelected = evaluation.selectionTrace.filter(row => (
    row.finalDisposition === 'ELIGIBLE_NOT_SELECTED'
  ));
  return [
    {
      stage: 'raw_input',
      inputUnit: null,
      inputCount: null,
      outputUnit: 'SOURCE_ROW',
      outputCount: evaluation.rawInputCount,
      reasonCounts: {},
    },
    {
      stage: 'candidate_build',
      inputUnit: 'SOURCE_ROW',
      inputCount: evaluation.rawInputCount,
      outputUnit: 'RANKING_CANDIDATE',
      outputCount: evaluation.candidates.length,
      reasonCounts: countReasons(evaluation.candidateBuildTrace, 'reasonCode'),
    },
    {
      stage: 'admission',
      inputUnit: 'RANKING_CANDIDATE',
      inputCount: evaluation.scoredCandidates.length,
      outputUnit: 'RANKING_CANDIDATE',
      outputCount: evaluation.admittedCandidates.length,
      reasonCounts: countReasons(admissionRejected, 'finalReasonCode'),
    },
    {
      stage: 'ranker_selection',
      inputUnit: 'RANKING_CANDIDATE',
      inputCount: evaluation.admittedCandidates.length,
      outputUnit: 'RANKED_ITEM',
      outputCount: evaluation.rankedCount,
      reasonCounts: countReasons(notSelected, 'finalReasonCode'),
    },
    {
      stage: 'display_projection',
      inputUnit: 'RANKED_ITEM',
      inputCount: evaluation.rankedCount,
      outputUnit: 'DISPLAYED_ITEM',
      outputCount: evaluation.displayedCount,
      reasonCounts: { outside_display_limit: Math.max(0, evaluation.rankedCount - evaluation.displayedCount) },
    },
  ];
}

function getEvidenceKey(story = {}) {
  return String(
    story.id || story.canonicalId || story.url || story.link || story.title || '',
  ).trim().toLowerCase();
}

function buildEvidencePopulations(evaluation, identityVersion) {
  const identified = attachTopStoryStudyIdentities(
    evaluation.scoredCandidates,
    { identityVersion },
  );
  const identities = new Map(identified.map(story => [
    getEvidenceKey(story),
    story._studyIdentity,
  ]));
  const sanitizeRows = stories => stories.map(story => sanitizeStoryEvidence({
    ...story,
    _studyIdentity: identities.get(getEvidenceKey(story)) || null,
  }));
  return {
    candidateEvidence: identified.map(sanitizeStoryEvidence),
    ranked: sanitizeRows(evaluation.selected),
    displayed: sanitizeRows(evaluation.displayed),
  };
}

function buildDigests(config, inputBundle, evaluation) {
  return {
    studyConfigDigest: digestCanonicalJson(config),
    inputDigest: getRankingInputDigest(inputBundle),
    settingsDigest: digestCanonicalJson(inputBundle.settings),
    topFeedDigest: digestCanonicalJson(inputBundle.topFeedItems, {
      omitKeys: VOLATILE_INPUT_KEYS,
      sortArrays: true,
    }),
    policyDigest: digestCanonicalJson(evaluation.policySnapshot),
  };
}

export function buildTopStoriesRunSnapshot({ studyConfig, inputBundle, metadata }) {
  assertMetadata(metadata);
  const nowMs = Date.parse(metadata.runAt);
  const config = validateTopStoriesStudyConfig(studyConfig, { nowMs });
  const input = validateRepositoryReplayInput(inputBundle);
  const evaluation = evaluateTopStories(
    { ...input, nowMs },
    {
      limit: config.rankerLimit,
      displayDepth: config.displayDepth,
      nowMs,
    },
  );
  const states = deriveObservationStates(input);
  const digests = buildDigests(config, input, evaluation);
  const evidence = buildEvidencePopulations(evaluation, config.identityVersion);
  const scheduleDelaySeconds = (nowMs - Date.parse(metadata.scheduledAt)) / 1000;
  const observationId = `${config.studyId}:${metadata.scheduledAt}:${metadata.workflowRunId}:${metadata.workflowRunAttempt}`;

  return {
    schemaVersion: RUN_SNAPSHOT_SCHEMA_VERSION,
    observationId,
    repositorySha: String(metadata.repositorySha),
    workflowRunId: String(metadata.workflowRunId),
    workflowRunAttempt: Number(metadata.workflowRunAttempt),
    studyId: config.studyId,
    runnerVersion: config.runnerVersion,
    rankerVersion: config.rankerVersion,
    identityVersion: config.identityVersion,
    periodClassifierVersion: config.periodClassifierVersion,
    inputContractVersion: config.inputContractVersion,
    observationMode: config.observationMode,
    inputSource: input.inputSource,
    inputSnapshotGeneratedAt: input.inputSnapshotGeneratedAt,
    scheduledAt: metadata.scheduledAt,
    runAt: metadata.runAt,
    nowMs,
    scheduleDelaySeconds,
    completenessState: states.completenessState,
    analyticalEligibility: states.analyticalEligibility,
    ...digests,
    rankedCount: evaluation.rankedCount,
    displayDepth: evaluation.displayDepth,
    displayedCount: evaluation.displayedCount,
    rankedIds: evaluation.rankedIds,
    displayedTopNIds: evaluation.displayedTopNIds,
    ranked: evidence.ranked,
    displayed: evidence.displayed,
    candidateEvidence: evidence.candidateEvidence,
    candidateBuildTrace: sanitizeObservationEvidence(evaluation.candidateBuildTrace),
    selectionTrace: sanitizeObservationEvidence(evaluation.selectionTrace),
    funnel: buildFunnel(evaluation),
    sourceHealth: sanitizeObservationEvidence(input.sourceHealth),
    inputDiagnostics: sanitizeObservationEvidence(input.inputDiagnostics || null),
    policySnapshot: sanitizeObservationEvidence(evaluation.policySnapshot),
  };
}
