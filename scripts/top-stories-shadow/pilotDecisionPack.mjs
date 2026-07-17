import {
  buildTopStoriesPilotRollup,
  PILOT_THRESHOLDS,
} from './pilotRollup.mjs';

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function decisionRank(decision) {
  return { PASS: 4, PASS_WITH_WARNINGS: 3, INSUFFICIENT: 2, FAIL: 1 }[decision] || 0;
}

function canonicalEntryByDate(entries = []) {
  const selected = new Map();
  for (const entry of entries) {
    const date = entry?.dailyReport?.date || entry?.operationalValidation?.date;
    if (!date) continue;
    if (!selected.has(date)) {
      selected.set(date, entry);
      continue;
    }
    const current = selected.get(date);
    const rankDelta = decisionRank(entry.operationalValidation?.decision) -
      decisionRank(current.operationalValidation?.decision);
    if (rankDelta > 0 || (rankDelta === 0 &&
      String(entry.sourceId || '').localeCompare(String(current.sourceId || '')) > 0)) {
      selected.set(date, entry);
    }
  }
  return selected;
}

function pairCount(summary) {
  return finite(summary?.incumbentRetention?.count);
}

function collectCanonicalEvidence(entries, includedDates) {
  const selected = canonicalEntryByDate(entries);
  let activePairs = 0;
  let activeEpisodes = 0;
  let unchanged15 = 0;
  let changed15 = 0;
  let unchanged60 = 0;
  let changed60 = 0;
  let residenceEpisodes = 0;
  for (const date of includedDates) {
    const daily = selected.get(date)?.dailyReport;
    if (!daily) continue;
    const active15 = daily.stability?.fifteenMinute?.canonicalNonOverlapping?.active;
    const active60 = daily.stability?.sixtyMinute?.canonicalNonOverlapping?.active;
    const dayActivePairs = pairCount(active15) + pairCount(active60);
    activePairs += dayActivePairs;
    if (dayActivePairs > 0) activeEpisodes += 1;
    unchanged15 += finite(daily.coverage?.unchangedInput15mPairs);
    changed15 += Math.max(0,
      finite(daily.coverage?.valid15mPairs) - finite(daily.coverage?.unchangedInput15mPairs));
    unchanged60 += finite(daily.coverage?.unchangedInput60mPairs);
    changed60 += Math.max(0,
      finite(daily.coverage?.valid60mPairs) - finite(daily.coverage?.unchangedInput60mPairs));
    residenceEpisodes += finite(daily.residence?.episodeCount);
  }
  return {
    active: { episodes: activeEpisodes, canonicalPairs: activePairs },
    inputChange: {
      fifteenMinute: { unchangedPairs: unchanged15, changedPairs: changed15 },
      sixtyMinute: { unchangedPairs: unchanged60, changedPairs: changed60 },
    },
    residence: { episodeCount: residenceEpisodes },
  };
}

function recommendation(metrics, activeSufficient) {
  const recallProblem = (metrics.belowEightFraction ?? 0) >
      PILOT_THRESHOLDS.chronicUnderfillFraction ||
    (metrics.severeCollapseFraction ?? 0) > PILOT_THRESHOLDS.severeCollapseFraction ||
    (metrics.displayedMedianAcrossDays?.median ?? Infinity) <
      PILOT_THRESHOLDS.usefulDisplayedMedian;
  const persistenceProblem = (metrics.calm15?.medianAcrossDays ?? 1) <
      PILOT_THRESHOLDS.calm15Retention ||
    (metrics.calm60?.medianAcrossDays ?? 1) < PILOT_THRESHOLDS.calm60Retention;
  if (!activeSufficient && !recallProblem && !persistenceProblem) return 'CONTINUE_OBSERVATION';
  if (recallProblem && persistenceProblem) return 'REPAIR_RECALL_THEN_PERSISTENCE';
  if (recallProblem) return 'REPAIR_RECALL';
  if (persistenceProblem) return activeSufficient ? 'ADD_PERSISTENCE' : 'CONTINUE_OBSERVATION';
  return activeSufficient ? 'RETAIN_POLICY' : 'CONTINUE_OBSERVATION';
}

export function buildTopStoriesPilotDecisionPack(entries = [], options = {}) {
  const rollup = buildTopStoriesPilotRollup(entries, options);
  const canonical = collectCanonicalEvidence(entries, rollup.includedDates);
  const activeSufficient = canonical.active.episodes >= PILOT_THRESHOLDS.activeEpisodes ||
    canonical.active.canonicalPairs >= PILOT_THRESHOLDS.activeCanonicalPairs;
  const metrics = {
    ...rollup.metrics,
    active: canonical.active,
    inputChange: canonical.inputChange,
    residence: canonical.residence,
  };
  const decision = rollup.decision === 'TECHNICAL_REMEDIATION' ||
      rollup.decision === 'INSUFFICIENT'
    ? rollup.decision
    : recommendation(metrics, activeSufficient);
  return {
    ...rollup,
    decision,
    activeEvidenceSufficient: activeSufficient,
    metrics,
  };
}
