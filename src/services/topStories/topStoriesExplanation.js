export function explainTopStoryRank(story = {}) {
  const rank = story._topStoryRank || {};
  return [
    `event=${rank.eventType || 'unknown'}`,
    `qualified=${rank.eventQualified !== false}`,
    `band=${rank.slotBand || 'unknown'}`,
    `reason=${rank.admissionReason || 'unknown'}`,
    `priority=${rank.priorityBucketLabel || 'standard'}`,
    `score=${Number(rank.normalizedScore || 0).toFixed(2)}`,
    `fresh=${Number(rank.freshnessScore || 0).toFixed(2)}`,
    `consensus=${Number(rank.consensusScore || 0).toFixed(2)}`,
    `sources=${Number(rank.sourceCount || 0)}`,
    `corroboration=${Number(rank.independentEvidenceCount || 0).toFixed(2)}`,
    `sourceQuality=${Number(rank.sourceQualityScore || 0).toFixed(2)}`,
    `location=${rank.locationRelevanceTarget || 'unknown'}:${Number(rank.locationRelevanceScore || 0).toFixed(2)}`,
    `threshold=${rank.admissionThreshold == null ? 'n/a' : Number(rank.admissionThreshold).toFixed(2)}`,
    `margin=${rank.thresholdMargin == null ? 'n/a' : Number(rank.thresholdMargin).toFixed(2)}`,
    `penalty=${Number(rank.penalties || 0).toFixed(1)}`,
  ].join('; ');
}
