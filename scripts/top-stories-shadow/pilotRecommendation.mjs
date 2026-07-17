export const TOP_STORIES_PILOT_THRESHOLDS = Object.freeze({
  expectedDays: 7,
  minimumUsableDays: 6,
  minimumCalmEvidenceDays: 4,
  minimumCalm15mCanonicalComparisons: 80,
  minimumCalm60mCanonicalComparisons: 30,
  minimumActiveEvidenceDays: 2,
  minimumActiveCanonicalComparisons: 3,
  calm15mRetention: 0.90,
  calm60mRetention: 0.80,
  softDisplayDepth: 8,
  maximumBelowSoftDepthFraction: 0.20,
  minimumUnchanged15mComparisons: 10,
  minimumUnchanged60mComparisons: 5,
});

function below(value, threshold) {
  return Number.isFinite(value) && value < threshold;
}

function above(value, threshold) {
  return Number.isFinite(value) && value > threshold;
}

export function buildPilotSignals(metrics) {
  const belowSoft = metrics.railAndFunnel.belowSoftReviewDepth.fraction;
  const displayedMedian = metrics.railAndFunnel.displayedCount.median;
  const recallSignal = (
    below(displayedMedian, TOP_STORIES_PILOT_THRESHOLDS.softDisplayDepth) ||
    above(belowSoft, TOP_STORIES_PILOT_THRESHOLDS.maximumBelowSoftDepthFraction)
  );
  const calm15 = metrics.stability.calm15mDailyMedian.median;
  const calm60 = metrics.stability.calm60mDailyMedian.median;
  const stabilitySignal = (
    below(calm15, TOP_STORIES_PILOT_THRESHOLDS.calm15mRetention) ||
    below(calm60, TOP_STORIES_PILOT_THRESHOLDS.calm60mRetention)
  );
  const unchanged15 = metrics.inputChange.fifteenMinute.unchangedInput;
  const unchanged60 = metrics.inputChange.sixtyMinute.unchangedInput;
  const unchanged15Signal = (
    unchanged15.comparisonCount >= TOP_STORIES_PILOT_THRESHOLDS.minimumUnchanged15mComparisons &&
    below(
      unchanged15.dailyMedianIncumbentRetention.median,
      TOP_STORIES_PILOT_THRESHOLDS.calm15mRetention,
    )
  );
  const unchanged60Signal = (
    unchanged60.comparisonCount >= TOP_STORIES_PILOT_THRESHOLDS.minimumUnchanged60mComparisons &&
    below(
      unchanged60.dailyMedianIncumbentRetention.median,
      TOP_STORIES_PILOT_THRESHOLDS.calm60mRetention,
    )
  );
  const activeComparisonCount = metrics.stability.active15mCanonicalComparisonCount +
    metrics.stability.active60mCanonicalComparisonCount;
  const activeReady = (
    metrics.stability.activeEvidenceDays.length >=
      TOP_STORIES_PILOT_THRESHOLDS.minimumActiveEvidenceDays &&
    activeComparisonCount >= TOP_STORIES_PILOT_THRESHOLDS.minimumActiveCanonicalComparisons
  );
  return {
    recallSignal,
    stabilitySignal,
    unchangedInstability: unchanged15Signal || unchanged60Signal,
    activeReady,
  };
}

export function buildPilotRecommendation(readiness, signals) {
  if (readiness.decision === 'FAIL') {
    return {
      recommendation: 'OPERATIONAL_REPAIR_REQUIRED',
      reasonCodes: ['technical_evidence_failure'],
    };
  }
  if (readiness.decision !== 'READY_FOR_EXPERT_REVIEW') {
    return {
      recommendation: 'CONTINUE_OBSERVATION',
      reasonCodes: ['minimum_evidence_not_met'],
    };
  }
  const persistenceReady = signals.stabilitySignal &&
    signals.unchangedInstability && signals.activeReady;
  if (signals.recallSignal && persistenceReady) {
    return {
      recommendation: 'COMBINED_RECALL_AND_PERSISTENCE_CANDIDATE',
      reasonCodes: [
        'rail_sufficiency_below_review_target',
        'unchanged_input_instability',
        'active_responsiveness_observed',
      ],
    };
  }
  if (signals.recallSignal) {
    return {
      recommendation: 'RECALL_REPAIR_CANDIDATE',
      reasonCodes: ['rail_sufficiency_below_review_target'],
    };
  }
  if (persistenceReady) {
    return {
      recommendation: 'PERSISTENCE_CANDIDATE',
      reasonCodes: ['unchanged_input_instability', 'active_responsiveness_observed'],
    };
  }
  if (signals.stabilitySignal) {
    return {
      recommendation: 'CONTINUE_OBSERVATION',
      reasonCodes: ['stability_signal_not_persistence_decision_ready'],
    };
  }
  return {
    recommendation: 'RETAIN_CURRENT_POLICY',
    reasonCodes: ['rail_and_stability_review_targets_met'],
  };
}

export function buildPilotEvidenceGaps(signals, metrics) {
  const gaps = [];
  if (!signals.activeReady) gaps.push('active_responsiveness_not_sufficiently_observed');
  if (metrics.inputChange.fifteenMinute.unchangedInput.comparisonCount <
    TOP_STORIES_PILOT_THRESHOLDS.minimumUnchanged15mComparisons) {
    gaps.push('unchanged_input_15m_evidence_limited');
  }
  if (metrics.railAndFunnel.unresolvedIdentityCount > 0) {
    gaps.push('unresolved_displayed_identities_present');
  }
  return gaps.sort();
}
