const MATURE_AGE_BANDS = new Set(['secondary', 'fallback']);
const CRITICAL_EVENT_TYPES = new Set([
  'war_conflict',
  'public_safety',
  'disaster',
  'civic_alert',
]);

export const AUTHORITATIVE_SOURCE_QUALITY_MIN = 0.95;
export const LOCAL_RELEVANCE_SCORE = 0.82;

function hasIndependentEvidence(signals = {}) {
  return Boolean(
    signals.hasIndependentEvidence ||
    Number(signals.sourceCount || 0) >= 2 ||
    Number(signals.topFeedCorroborationHits || 0) >= 1,
  );
}

export function getAgeBand(signals = {}, policy = {}) {
  if (signals.timestampConfidence === 'low') return 'rejected';
  if (signals.ageHours <= policy.primaryWindowHours) return 'primary';
  if (signals.ageHours <= policy.secondaryWindowHours) return 'secondary';
  if (signals.ageHours <= policy.fallbackWindowHours) return 'fallback';
  return 'expired';
}

function isMatureNonLocalCritical({ ageBand, eventType, signals }) {
  return MATURE_AGE_BANDS.has(ageBand) &&
    CRITICAL_EVENT_TYPES.has(eventType) &&
    Number(signals.locationRelevanceScore || 0) < LOCAL_RELEVANCE_SCORE;
}

export function getMatureEvidenceDecision({
  ageBand,
  eventType,
  signals = {},
} = {}) {
  if (!isMatureNonLocalCritical({ ageBand, eventType, signals })) {
    return { allowed: true, applies: false, evidenceClass: 'not_required' };
  }
  if (hasIndependentEvidence(signals)) {
    return { allowed: true, applies: true, evidenceClass: 'independent' };
  }
  if (Number(signals.sourceQualityScore || 0) >= AUTHORITATIVE_SOURCE_QUALITY_MIN) {
    return { allowed: true, applies: true, evidenceClass: 'authoritative' };
  }
  return {
    allowed: false,
    applies: true,
    evidenceClass: 'missing',
    reason: 'mature_nonlocal_critical_without_evidence',
  };
}

function reject(ageBand, admissionThreshold, admissionReason, slotBand = 'rejected') {
  return { ageBand, admissionThreshold, slotBand, admissionReason };
}

function getTerminalAgeDecision(ageBand) {
  if (ageBand === 'rejected') {
    return reject(ageBand, null, 'low_confidence_timestamp');
  }
  if (ageBand === 'expired') {
    return reject(ageBand, null, 'outside_fallback_window', 'expired');
  }
  return null;
}

export function getSlotDecision(signals, event, policy, normalizedScore) {
  const ageBand = getAgeBand(signals, policy);
  const terminal = getTerminalAgeDecision(ageBand);
  if (terminal) return terminal;
  const admissionThreshold = Number(policy.thresholds?.[ageBand] || 0);
  const independentEvidence = hasIndependentEvidence(signals);
  if (event.qualified === false && !independentEvidence) {
    return reject(ageBand, admissionThreshold, 'unqualified_without_independent_evidence');
  }
  const matureEvidence = getMatureEvidenceDecision({
    ageBand,
    eventType: event.eventType,
    signals,
  });
  if (!matureEvidence.allowed) {
    return reject(ageBand, admissionThreshold, matureEvidence.reason);
  }
  if (normalizedScore < admissionThreshold) {
    return reject(ageBand, admissionThreshold, `below_${ageBand}_threshold`);
  }
  if (ageBand === 'fallback' && signals.isAggregatorSource && !independentEvidence) {
    return reject(ageBand, admissionThreshold, 'fallback_aggregator_without_corroboration');
  }
  return { ageBand, admissionThreshold, slotBand: ageBand, admissionReason: 'admitted' };
}
