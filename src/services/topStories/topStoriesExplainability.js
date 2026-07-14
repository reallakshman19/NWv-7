function numberValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(numberValue(value) * factor) / factor;
}

function textValue(value, fallback = '') {
  const text = String(value || '').trim();
  return text || fallback;
}

function getRank(story = {}) {
  return story._topStoryRank || {};
}

function getAge(r = {}) {
  return Number.isFinite(Number(r.ageHours)) ? round(r.ageHours, 2) : null;
}

function getNonPrimaryReason(fields) {
  if (fields.slotBand === 'primary') return 'primary-slot-qualified';
  if (fields.timestampConfidence === 'low') return 'low-timestamp-confidence';
  if (fields.slotBand === 'expired') return 'older-than-fallback-window';
  if (fields.slotBand === 'rejected') return fields.admissionReason || 'ranker-rejected';
  if (fields.slotBand === 'secondary') return 'secondary-window-story';
  if (fields.slotBand === 'fallback') return 'fallback-window-story';
  return 'unknown-slot-state';
}

function getHighlights(fields) {
  const notes = [];
  if (fields.topFeedCorroborationHits > 0) notes.push('bounded-top-feed-signal');
  if (fields.topFeedHits > 0 && fields.topFeedCorroborationHits === 0) notes.push('top-feed-membership-only');
  if (fields.penalties > 0) notes.push('penalty-applied');
  if (fields.eventType === 'entertainment_promo') notes.push('entertainment-promo-guard');
  if (fields.timestampConfidence === 'low') notes.push('low-confidence-timestamp');
  if (fields.slotBand === 'fallback') notes.push('fallback-window');
  if (fields.slotBand === 'expired') notes.push('expired-window');
  return notes;
}

function buildExplanation(fields) {
  return [
    `score=${fields.score}`,
    `band=${fields.slotBand}`,
    `event=${fields.eventType}`,
    `qualified=${fields.eventQualified}`,
    `admission=${fields.admissionReason}`,
    `fresh=${fields.freshnessScore}`,
    `consensus=${fields.consensusScore}`,
    `penalty=${fields.penalties}`,
    `sourceCount=${fields.sourceCount}`,
    `topFeedHits=${fields.topFeedHits}`,
    `topFeedCorroboration=${fields.topFeedCorroborationHits}`,
    `independentEvidence=${fields.independentEvidenceCount}`,
    `reason=${fields.nonPrimaryReason}`,
  ].join('; ');
}

export function getTopStoryAuditFields(story = {}) {
  const r = getRank(story);
  const fields = {
    id: textValue(story.id || story.canonicalId || story.url || story.title, 'unknown'),
    title: textValue(story.title || story.headline, 'untitled'),
    source: textValue(story.source || story.sourceGroup, 'unknown'),
    section: textValue(story.section || story.sourceSection, 'unknown'),
    publishedAt: story.publishedAt || null,
    score: round(r.score),
    slotBand: textValue(r.slotBand, 'unknown'),
    admissionReason: textValue(r.admissionReason, 'unknown'),
    eventType: textValue(r.eventType, 'unknown'),
    eventQualified: r.eventQualified !== false,
    freshnessScore: round(r.freshnessScore),
    publicInterestScore: round(r.publicInterestScore),
    consensusScore: round(r.consensusScore),
    breakingLiveScore: round(r.breakingLiveScore),
    penalties: round(r.penalties),
    timestampConfidence: textValue(r.timestampConfidence, 'unknown'),
    ageHours: getAge(r),
    sourceCount: numberValue(r.sourceCount),
    topFeedHits: round(r.topFeedHits),
    topFeedCorroborationHits: round(r.topFeedCorroborationHits),
    independentEvidenceCount: round(r.independentEvidenceCount),
    clusterKey: textValue(r.clusterKey),
  };
  return {
    ...fields,
    nonPrimaryReason: getNonPrimaryReason(fields),
    highlights: getHighlights(fields),
  };
}

export function explainRankedTopStory(story = {}) {
  const fields = getTopStoryAuditFields(story);
  return {
    ...fields,
    explanation: buildExplanation(fields),
  };
}

export function explainTopStoriesList(stories = []) {
  return (Array.isArray(stories) ? stories : []).map((story, index) => ({
    rank: index + 1,
    ...explainRankedTopStory(story),
  }));
}

export function summarizeTopStoriesRegressionRun(stories = []) {
  const explanations = explainTopStoriesList(stories);
  const slotBands = {};
  const eventTypes = {};
  for (const item of explanations) {
    slotBands[item.slotBand] = (slotBands[item.slotBand] || 0) + 1;
    eventTypes[item.eventType] = (eventTypes[item.eventType] || 0) + 1;
  }
  return {
    total: explanations.length,
    idsInOrder: explanations.map(item => item.id),
    slotBands,
    eventTypes,
    topFeedBoosted: explanations.filter(item => item.topFeedCorroborationHits > 0).map(item => item.id),
    penalized: explanations.filter(item => item.penalties > 0).map(item => item.id),
  };
}
