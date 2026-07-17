import { getTopStoryDedupeKey } from './topStoriesCandidates.js';

export const TOP_STORY_TRACE_SCHEMA_VERSION = 'nw-top-stories-candidate-trace/v2';

export const TOP_STORY_DISPOSITIONS = Object.freeze({
  REJECTED_BY_ADMISSION: 'REJECTED_BY_ADMISSION',
  ELIGIBLE_NOT_SELECTED: 'ELIGIBLE_NOT_SELECTED',
  RANKED_NOT_DISPLAYED: 'RANKED_NOT_DISPLAYED',
  DISPLAYED: 'DISPLAYED',
});

export const TOP_STORY_TRACE_STAGES = Object.freeze({
  TIMESTAMP_VALIDATION: 'timestamp_validation',
  AGE_WINDOW: 'age_window',
  EVENT_CLASSIFICATION: 'event_classification',
  QUALIFICATION_EVIDENCE: 'qualification_evidence',
  THRESHOLD: 'threshold',
  FALLBACK_CORROBORATION: 'fallback_corroboration',
  ADMISSION: 'admission',
  SELECTION: 'selection',
  DISPLAY: 'display',
});

function stage(stageName, status, reasonCodes = [], details = {}) {
  return {
    stage: stageName,
    status,
    reasonCodes,
    ...details,
  };
}

function hasRejected(stages = []) {
  return stages.some(item => item.status === 'rejected');
}

function getRank(item = {}) {
  return item._topStoryRank || {};
}

function getTimestampStage(item) {
  const rank = getRank(item);
  const timestampConfidence = rank.timestampConfidence || 'unknown';
  const rejected = timestampConfidence === 'low';
  return stage(
    TOP_STORY_TRACE_STAGES.TIMESTAMP_VALIDATION,
    rejected ? 'rejected' : 'passed',
    rejected ? ['low_confidence_timestamp'] : [],
    { timestampConfidence },
  );
}

function getAgeWindowStage(item, priorStages) {
  const rank = getRank(item);
  const details = {
    ageBand: rank.ageBand || 'unknown',
    ageHours: rank.ageHours,
    ageMinutes: rank.ageMinutes,
  };
  if (hasRejected(priorStages)) {
    return stage(TOP_STORY_TRACE_STAGES.AGE_WINDOW, 'not_applicable', [], details);
  }
  const rejected = rank.ageBand === 'expired';
  return stage(
    TOP_STORY_TRACE_STAGES.AGE_WINDOW,
    rejected ? 'rejected' : 'passed',
    rejected ? ['outside_fallback_window'] : [],
    details,
  );
}

function getEventClassificationStage(item, priorStages) {
  const rank = getRank(item);
  const details = {
    eventType: rank.eventType || 'unknown',
    eventQualified: rank.eventQualified !== false,
    eventEvidence: Array.isArray(rank.eventEvidence) ? [...rank.eventEvidence] : [],
  };
  if (hasRejected(priorStages)) {
    return stage(
      TOP_STORY_TRACE_STAGES.EVENT_CLASSIFICATION,
      'not_applicable',
      [],
      details,
    );
  }
  return stage(
    TOP_STORY_TRACE_STAGES.EVENT_CLASSIFICATION,
    'classified',
    [],
    details,
  );
}

function evidenceDetails(rank) {
  return {
    sourceCount: Number(rank.sourceCount || 0),
    corroboratingSourceCount: Number(rank.corroboratingSourceCount || 0),
    independentEvidenceCount: Number(rank.independentEvidenceCount || 0),
    hasIndependentEvidence: Boolean(rank.hasIndependentEvidence),
    topFeedCorroborationHits: Number(rank.topFeedCorroborationHits || 0),
  };
}

function getQualificationEvidenceStage(item, priorStages) {
  const rank = getRank(item);
  const details = {
    eventQualified: rank.eventQualified !== false,
    ...evidenceDetails(rank),
  };
  if (hasRejected(priorStages)) {
    return stage(
      TOP_STORY_TRACE_STAGES.QUALIFICATION_EVIDENCE,
      'not_applicable',
      [],
      details,
    );
  }
  if (rank.eventQualified !== false) {
    return stage(
      TOP_STORY_TRACE_STAGES.QUALIFICATION_EVIDENCE,
      'not_required',
      [],
      details,
    );
  }
  const passed = Boolean(rank.hasIndependentEvidence);
  return stage(
    TOP_STORY_TRACE_STAGES.QUALIFICATION_EVIDENCE,
    passed ? 'passed' : 'rejected',
    passed ? [] : ['unqualified_without_independent_evidence'],
    details,
  );
}

function getThresholdStage(item, priorStages) {
  const rank = getRank(item);
  const threshold = Number(rank.admissionThreshold);
  const normalizedScore = Number(rank.normalizedScore);
  const details = {
    ageBand: rank.ageBand || 'unknown',
    normalizedScore: Number.isFinite(normalizedScore) ? normalizedScore : null,
    threshold: Number.isFinite(threshold) ? threshold : null,
  };
  if (hasRejected(priorStages) || !Number.isFinite(threshold)) {
    return stage(TOP_STORY_TRACE_STAGES.THRESHOLD, 'not_applicable', [], details);
  }
  const passed = normalizedScore >= threshold;
  return stage(
    TOP_STORY_TRACE_STAGES.THRESHOLD,
    passed ? 'passed' : 'rejected',
    passed ? [] : [`below_${rank.ageBand || 'unknown'}_threshold`],
    details,
  );
}

function getFallbackCorroborationStage(item, priorStages) {
  const rank = getRank(item);
  const required = rank.ageBand === 'fallback' && Boolean(rank.isAggregatorSource);
  const details = {
    ageBand: rank.ageBand || 'unknown',
    isAggregatorSource: Boolean(rank.isAggregatorSource),
    required,
    ...evidenceDetails(rank),
  };
  if (hasRejected(priorStages)) {
    return stage(
      TOP_STORY_TRACE_STAGES.FALLBACK_CORROBORATION,
      'not_applicable',
      [],
      details,
    );
  }
  if (!required) {
    return stage(
      TOP_STORY_TRACE_STAGES.FALLBACK_CORROBORATION,
      'not_required',
      [],
      details,
    );
  }
  const passed = Boolean(rank.hasIndependentEvidence);
  return stage(
    TOP_STORY_TRACE_STAGES.FALLBACK_CORROBORATION,
    passed ? 'passed' : 'rejected',
    passed ? [] : ['fallback_aggregator_without_corroboration'],
    details,
  );
}

function getAdmissionStage(item) {
  const rank = getRank(item);
  const rejected = ['rejected', 'expired'].includes(rank.slotBand);
  return stage(
    TOP_STORY_TRACE_STAGES.ADMISSION,
    rejected ? 'rejected' : 'passed',
    rejected ? [rank.admissionReason || 'rejected_by_admission'] : [],
    {
      ageBand: rank.ageBand || 'unknown',
      slotBand: rank.slotBand || 'unknown',
      admissionReason: rank.admissionReason || 'unknown',
    },
  );
}

function getSelectionStage({
  item,
  selectedRank,
  attempts,
  limitReached,
}) {
  if (selectedRank) {
    return stage(TOP_STORY_TRACE_STAGES.SELECTION, 'selected');
  }

  const itemAttempts = attempts.get(getTopStoryDedupeKey(item)) || [];
  const reasonCodes = [
    ...new Set(itemAttempts.flatMap(attempt => attempt.reasonCodes)),
  ];
  return stage(
    TOP_STORY_TRACE_STAGES.SELECTION,
    'not_selected',
    reasonCodes.length > 0
      ? reasonCodes
      : [limitReached ? 'outside_ranker_limit' : 'not_selected'],
  );
}

function getDisplayStage(selectedRank, displayDepth) {
  if (!selectedRank) {
    return stage(TOP_STORY_TRACE_STAGES.DISPLAY, 'not_applicable');
  }
  const displayed = selectedRank <= displayDepth;
  return stage(
    TOP_STORY_TRACE_STAGES.DISPLAY,
    displayed ? 'displayed' : 'not_displayed',
    displayed ? [] : ['outside_display_limit'],
  );
}

function stageByName(stages, stageName) {
  return stages.find(item => item.stage === stageName);
}

function getFinalTrace({
  selectedRank,
  displayDepth,
  stages,
}) {
  const admission = stageByName(stages, TOP_STORY_TRACE_STAGES.ADMISSION);
  const selection = stageByName(stages, TOP_STORY_TRACE_STAGES.SELECTION);
  const display = stageByName(stages, TOP_STORY_TRACE_STAGES.DISPLAY);

  if (admission.status === 'rejected') {
    const terminal = stages.find(item => (
      item.stage !== TOP_STORY_TRACE_STAGES.ADMISSION && item.status === 'rejected'
    )) || admission;
    return {
      finalDisposition: TOP_STORY_DISPOSITIONS.REJECTED_BY_ADMISSION,
      finalStage: TOP_STORY_TRACE_STAGES.ADMISSION,
      finalReasonCode: admission.reasonCodes[0],
      terminalStage: terminal.stage,
      terminalReasonCode: terminal.reasonCodes[0] || admission.reasonCodes[0],
    };
  }
  if (!selectedRank) {
    return {
      finalDisposition: TOP_STORY_DISPOSITIONS.ELIGIBLE_NOT_SELECTED,
      finalStage: TOP_STORY_TRACE_STAGES.SELECTION,
      finalReasonCode: selection.reasonCodes[0],
      terminalStage: TOP_STORY_TRACE_STAGES.SELECTION,
      terminalReasonCode: selection.reasonCodes[0],
    };
  }
  if (selectedRank > displayDepth) {
    return {
      finalDisposition: TOP_STORY_DISPOSITIONS.RANKED_NOT_DISPLAYED,
      finalStage: TOP_STORY_TRACE_STAGES.DISPLAY,
      finalReasonCode: display.reasonCodes[0],
      terminalStage: TOP_STORY_TRACE_STAGES.DISPLAY,
      terminalReasonCode: display.reasonCodes[0],
    };
  }
  return {
    finalDisposition: TOP_STORY_DISPOSITIONS.DISPLAYED,
    finalStage: TOP_STORY_TRACE_STAGES.DISPLAY,
    finalReasonCode: 'displayed',
    terminalStage: TOP_STORY_TRACE_STAGES.DISPLAY,
    terminalReasonCode: 'displayed',
  };
}

export function buildTopStorySelectionTrace({
  ranked,
  selected,
  attempts,
  displayDepth,
  limit,
}) {
  const selectedRanks = new Map(
    selected.map((item, index) => [
      getTopStoryDedupeKey(item),
      index + 1,
    ]),
  );

  return ranked.map(item => {
    const selectedRank = selectedRanks.get(getTopStoryDedupeKey(item)) || null;
    const timestampStage = getTimestampStage(item);
    const ageWindowStage = getAgeWindowStage(item, [timestampStage]);
    const eventClassificationStage = getEventClassificationStage(
      item,
      [timestampStage, ageWindowStage],
    );
    const qualificationEvidenceStage = getQualificationEvidenceStage(
      item,
      [timestampStage, ageWindowStage],
    );
    const thresholdStage = getThresholdStage(
      item,
      [timestampStage, ageWindowStage, qualificationEvidenceStage],
    );
    const fallbackCorroborationStage = getFallbackCorroborationStage(
      item,
      [timestampStage, ageWindowStage, qualificationEvidenceStage, thresholdStage],
    );
    const admissionStage = getAdmissionStage(item);
    const selectionStage = admissionStage.status === 'rejected'
      ? stage(TOP_STORY_TRACE_STAGES.SELECTION, 'not_applicable')
      : getSelectionStage({
          item,
          selectedRank,
          attempts,
          limitReached: selected.length >= limit,
        });
    const displayStage = getDisplayStage(selectedRank, displayDepth);
    const stages = [
      timestampStage,
      ageWindowStage,
      eventClassificationStage,
      qualificationEvidenceStage,
      thresholdStage,
      fallbackCorroborationStage,
      admissionStage,
      selectionStage,
      displayStage,
    ];

    return {
      schemaVersion: TOP_STORY_TRACE_SCHEMA_VERSION,
      candidateId: item.id || null,
      candidateKey: getTopStoryDedupeKey(item),
      ageBand: item._topStoryRank?.ageBand || 'unknown',
      slotBand: item._topStoryRank?.slotBand || 'unknown',
      selectedRank,
      displayedRank: selectedRank && selectedRank <= displayDepth
        ? selectedRank
        : null,
      stages,
      contributingReasonCodes: [
        ...new Set(stages.flatMap(itemStage => itemStage.reasonCodes)),
      ],
      ...getFinalTrace({ selectedRank, displayDepth, stages }),
    };
  });
}
