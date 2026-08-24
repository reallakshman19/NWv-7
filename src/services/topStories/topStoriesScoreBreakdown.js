const SIGNAL_ORDER = Object.freeze([
  ['freshness', 'freshnessScore'],
  ['publicInterest', 'publicInterestScore'],
  ['consensus', 'consensusScore'],
  ['breakingLive', 'breakingLiveScore'],
  ['sourceQuality', 'sourceQualityScore'],
  ['locationRelevance', 'locationRelevanceScore'],
]);

function clampNormalized(value) {
  return Math.max(0, Math.min(1, Number(value || 0)));
}

function buildSignalValues(input = {}) {
  return Object.fromEntries(SIGNAL_ORDER.map(([name, inputKey]) => (
    [name, Number(input[inputKey] || 0)]
  )));
}

function buildWeights(policy = {}) {
  return Object.fromEntries(SIGNAL_ORDER.map(([name]) => (
    [name, Number(policy.weights?.[name] || 0)]
  )));
}

function multiplySignals(signalValues, weights) {
  return Object.fromEntries(SIGNAL_ORDER.map(([name]) => (
    [name, signalValues[name] * weights[name]]
  )));
}

export function buildTopStoryScoreBreakdown(input = {}) {
  const signalValues = buildSignalValues(input);
  const weights = buildWeights(input.policy);
  const contributions = multiplySignals(signalValues, weights);
  const contributionTotal = Object.values(contributions)
    .reduce((sum, value) => sum + value, 0);
  const penalties = Number(input.penalties || 0);
  const rawScore = contributionTotal - penalties;
  const maxWeightedScore = Object.values(input.policy?.weights || {})
    .reduce((sum, value) => sum + Number(value || 0), 0) || 1;
  const normalizedScore = clampNormalized(rawScore / maxWeightedScore);
  return {
    signalValues,
    weights,
    contributions,
    contributionTotal,
    penalties,
    rawScore,
    maxWeightedScore,
    normalizedScore,
  };
}

export function getThresholdMargin(normalizedScore, admissionThreshold) {
  if (admissionThreshold == null) return null;
  return Number(normalizedScore || 0) - Number(admissionThreshold || 0);
}
