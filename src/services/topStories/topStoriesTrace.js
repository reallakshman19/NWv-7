import { getTopStoryDedupeKey } from './topStoriesCandidates.js';

export const TOP_STORY_DISPOSITIONS = Object.freeze({
  REJECTED_BY_ADMISSION: 'REJECTED_BY_ADMISSION',
  ELIGIBLE_NOT_SELECTED: 'ELIGIBLE_NOT_SELECTED',
  RANKED_NOT_DISPLAYED: 'RANKED_NOT_DISPLAYED',
  DISPLAYED: 'DISPLAYED',
});

function getAdmissionStage(item) {
  const rank = item._topStoryRank || {};
  const rejected = ['rejected', 'expired'].includes(rank.slotBand);
  return {
    stage: 'admission',
    status: rejected ? 'rejected' : 'passed',
    reasonCodes: rejected
      ? [rank.admissionReason || 'rejected_by_admission']
      : [],
  };
}

function getSelectionStage({
  item,
  selectedRank,
  attempts,
  limitReached,
}) {
  if (selectedRank) {
    return {
      stage: 'selection',
      status: 'selected',
      reasonCodes: [],
    };
  }

  const itemAttempts = attempts.get(getTopStoryDedupeKey(item)) || [];
  const reasonCodes = [
    ...new Set(itemAttempts.flatMap(attempt => attempt.reasonCodes)),
  ];
  return {
    stage: 'selection',
    status: 'not_selected',
    reasonCodes: reasonCodes.length > 0
      ? reasonCodes
      : [limitReached ? 'outside_ranker_limit' : 'not_selected'],
  };
}

function getDisplayStage(selectedRank, displayDepth) {
  if (!selectedRank) {
    return {
      stage: 'display',
      status: 'not_applicable',
      reasonCodes: [],
    };
  }
  const displayed = selectedRank <= displayDepth;
  return {
    stage: 'display',
    status: displayed ? 'displayed' : 'not_displayed',
    reasonCodes: displayed ? [] : ['outside_display_limit'],
  };
}

function getFinalTrace({
  selectedRank,
  displayDepth,
  stages,
}) {
  const [admission, selection, display] = stages;

  if (admission.status === 'rejected') {
    return {
      finalDisposition: TOP_STORY_DISPOSITIONS.REJECTED_BY_ADMISSION,
      finalStage: 'admission',
      finalReasonCode: admission.reasonCodes[0],
    };
  }
  if (!selectedRank) {
    return {
      finalDisposition: TOP_STORY_DISPOSITIONS.ELIGIBLE_NOT_SELECTED,
      finalStage: 'selection',
      finalReasonCode: selection.reasonCodes[0],
    };
  }
  if (selectedRank > displayDepth) {
    return {
      finalDisposition: TOP_STORY_DISPOSITIONS.RANKED_NOT_DISPLAYED,
      finalStage: 'display',
      finalReasonCode: display.reasonCodes[0],
    };
  }
  return {
    finalDisposition: TOP_STORY_DISPOSITIONS.DISPLAYED,
    finalStage: 'display',
    finalReasonCode: 'displayed',
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
    const admissionStage = getAdmissionStage(item);
    const selectionStage = admissionStage.status === 'rejected'
      ? {
          stage: 'selection',
          status: 'not_applicable',
          reasonCodes: [],
        }
      : getSelectionStage({
          item,
          selectedRank,
          attempts,
          limitReached: selected.length >= limit,
        });
    const displayStage = getDisplayStage(selectedRank, displayDepth);
    const stages = [admissionStage, selectionStage, displayStage];

    return {
      candidateId: item.id || null,
      candidateKey: getTopStoryDedupeKey(item),
      slotBand: item._topStoryRank?.slotBand || 'unknown',
      selectedRank,
      displayedRank: selectedRank && selectedRank <= displayDepth
        ? selectedRank
        : null,
      stages,
      contributingReasonCodes: [
        ...new Set(stages.flatMap(stage => stage.reasonCodes)),
      ],
      ...getFinalTrace({ selectedRank, displayDepth, stages }),
    };
  });
}
