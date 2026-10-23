import { getDisplayedIdentityEvidence, getEditorialIdentityEvidence, summarizeIdentityAccountingBySchema } from './editorialIdentityRelations.mjs';
const SOFT_REVIEW_DEPTH = 8;
const EDITORIAL_IDENTITY_STAGE = 'editorial_identity_population';
const SEQUENTIAL_POPULATION_ROLE = 'SEQUENTIAL_FLOW';
function finiteNumber(value) { if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function quantile(values, fraction) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + ((sorted[upper] - sorted[lower]) * (position - lower));
}
function summarize(values = []) {
  const finite = values.map(finiteNumber).filter(value => value !== null);
  return {
    count: finite.length,
    median: quantile(finite, 0.5),
    p10: quantile(finite, 0.1),
    p25: quantile(finite, 0.25),
    p75: quantile(finite, 0.75),
    p90: quantile(finite, 0.9),
    minimum: finite.length ? Math.min(...finite) : null,
    maximum: finite.length ? Math.max(...finite) : null,
  };
}
function increment(counts, key, amount = 1) {
  const normalized = String(key || 'unknown');
  counts[normalized] = (counts[normalized] || 0) + amount;
}
function mergeCounts(target, source = {}) {
  Object.entries(source).forEach(([key, value]) => increment(target, key, Number(value) || 0));
  return target;
}
function combineCounts(...sources) { return sources.reduce((counts, source) => mergeCounts(counts, source), {}); }
function countBy(rows = [], field) {
  return rows.reduce((counts, row) => {
    increment(counts, row?.[field]);
    return counts;
  }, {});
}
function getRailBucket(displayedCount, displayDepth) {
  if (displayedCount === 0) return '0';
  if (displayedCount <= 3) return '1-3';
  if (displayedCount <= 7) return '4-7';
  if (displayedCount < displayDepth) return '8-9';
  if (displayedCount === displayDepth) return String(displayDepth);
  return 'other';
}
function classifyReason(reasonCode) {
  const reason = String(reasonCode || 'unknown').toLowerCase();
  if (reason === 'duplicate_identity') return 'duplicate';
  if (reason === 'shared_editorial_identity' || reason.startsWith('identity_')) {
    return 'identity';
  }
  if (reason.startsWith('max_per_') || reason.startsWith('display_max_per_')) return 'diversity';
  if (reason.includes('timestamp')) return 'timestamp';
  if (reason.includes('expired') || reason.includes('age_window') || reason.includes('stale')) {
    return 'age';
  }
  if (reason.includes('threshold') || reason.startsWith('below_')) return 'threshold';
  if (reason.includes('evidence') || reason.includes('corroboration') || reason.includes('qualified')) {
    return 'evidence';
  }
  if (reason === 'outside_ranker_limit') return 'rank_limit';
  if (reason === 'outside_display_limit') return 'display_limit';
  if (reason === 'invalid_input' || reason === 'missing_identity') return 'invalid_input';
  if (reason === 'candidate_created' || reason === 'displayed') return 'successful_progression';
  return 'other';
}
function countTraceReasons(selectionTrace = []) {
  const finalReasonCounts = {};
  const finalDispositionCounts = {};
  const stageReasonCounts = { admission: {}, selection: {}, display: {} };
  selectionTrace.forEach(row => {
    increment(finalReasonCounts, row.finalReasonCode);
    increment(finalDispositionCounts, row.finalDisposition);
    (row.stages || []).forEach(stage => {
      (stage.reasonCodes || []).forEach(reason => increment(
        stageReasonCounts[stage.stage] || (stageReasonCounts[stage.stage] = {}),
        reason,
      ));
    });
  });
  return { finalReasonCounts, finalDispositionCounts, stageReasonCounts };
}
function dominantReasons(counts = {}, limit = 5) {
  return Object.entries(counts)
    .filter(([reason]) => !['displayed', 'candidate_created'].includes(reason))
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([reasonCode, count]) => ({ reasonCode, count, category: classifyReason(reasonCode) }));
}
function summarizeFunnelStages(observations) {
  const byKey = new Map();
  observations.forEach(observation => {
    (observation.funnel || []).forEach(stage => {
      const populationRole = stage.populationRole || SEQUENTIAL_POPULATION_ROLE;
      const key = [
        stage.stage,
        populationRole,
        stage.populationSchemaVersion || 'unversioned',
        stage.inputUnit || 'null',
        stage.outputUnit || 'null',
      ].join('|');
      if (!byKey.has(key)) {
        byKey.set(key, {
          stage: stage.stage,
          populationRole,
          inputUnit: stage.inputUnit || null,
          outputUnit: stage.outputUnit || null,
          inputCounts: [],
          outputCounts: [],
          reasonCounts: {},
          populationSchemaVersions: new Set(),
          accountingChecks: [],
        });
      }
      const aggregate = byKey.get(key);
      const inputCount = finiteNumber(stage.inputCount);
      const outputCount = finiteNumber(stage.outputCount);
      if (inputCount !== null) aggregate.inputCounts.push(inputCount);
      if (outputCount !== null) aggregate.outputCounts.push(outputCount);
      if (stage.populationSchemaVersion) {
        aggregate.populationSchemaVersions.add(stage.populationSchemaVersion);
      }
      if (typeof stage.accountingConserved === 'boolean') {
        aggregate.accountingChecks.push(stage.accountingConserved);
      }
      mergeCounts(aggregate.reasonCounts, stage.reasonCounts);
    });
  });
  return [...byKey.values()].map(stage => ({
    stage: stage.stage,
    populationRole: stage.populationRole,
    populationSchemaVersion: stage.populationSchemaVersions.size === 1
      ? [...stage.populationSchemaVersions][0]
      : null,
    accountingConserved: stage.accountingChecks.length
      ? stage.accountingChecks.every(Boolean)
      : null,
    inputUnit: stage.inputUnit,
    outputUnit: stage.outputUnit,
    observationCount: Math.max(stage.inputCounts.length, stage.outputCounts.length),
    inputCount: summarize(stage.inputCounts),
    outputCount: summarize(stage.outputCounts),
    totalInputCount: stage.inputCounts.reduce((sum, value) => sum + value, 0),
    totalOutputCount: stage.outputCounts.reduce((sum, value) => sum + value, 0),
    reasonCounts: Object.fromEntries(Object.entries(stage.reasonCounts).sort()),
  })).sort((left, right) => left.stage.localeCompare(right.stage) ||
    String(left.populationSchemaVersion).localeCompare(String(right.populationSchemaVersion)));
}
function sourceHealthState(observation = {}) {
  if (observation.sourceHealth?.ok === false) return 'FAILED_OR_DEGRADED';
  if (observation.sourceHealth?.complete === false) return 'PARTIAL';
  return observation.sourceHealth ? 'AVAILABLE' : 'UNAVAILABLE';
}
function buildObservationRow(observation) {
  const displayedCount = Number(observation.displayedCount ?? observation.displayed?.length ?? 0);
  const rankedCount = Number(observation.rankedCount ?? observation.ranked?.length ?? 0);
  const displayDepth = Number(observation.displayDepth ?? 10);
  const trace = countTraceReasons(observation.selectionTrace || []);
  const buildReasons = countBy(observation.candidateBuildTrace, 'reasonCode');
  const identityEvidence = getEditorialIdentityEvidence(observation, EDITORIAL_IDENTITY_STAGE);
  const combinedReasons = combineCounts(
    buildReasons,
    identityEvidence.identityReasonCounts,
    trace.finalReasonCounts,
  );
  const funnelStageCounts = Object.fromEntries((observation.funnel || []).map(stage => [
    stage.stage,
    {
      populationRole: stage.populationRole || SEQUENTIAL_POPULATION_ROLE,
      inputUnit: stage.inputUnit || null,
      inputCount: finiteNumber(stage.inputCount),
      outputUnit: stage.outputUnit || null,
      outputCount: finiteNumber(stage.outputCount),
    },
  ]));
  return {
    observationId: observation.observationId,
    scheduledAt: observation.scheduledAt,
    runAt: observation.runAt,
    inputDigest: observation.inputDigest || null,
    completenessState: observation.completenessState || null,
    analyticalEligibility: observation.analyticalEligibility || null,
    sourceHealthState: sourceHealthState(observation),
    rankedCount,
    displayDepth,
    displayedCount,
    railBucket: getRailBucket(displayedCount, displayDepth),
    underfilled: displayedCount < displayDepth,
    belowSoftReviewDepth: displayedCount < Math.min(SOFT_REVIEW_DEPTH, displayDepth),
    ...getDisplayedIdentityEvidence(observation.displayed || []),
    editorialIdentityPopulationSchemaVersion: identityEvidence.schemaVersion,
    ...identityEvidence,
    funnelStageCounts,
    candidateBuildDispositionCounts: countBy(observation.candidateBuildTrace, 'buildDisposition'),
    finalDispositionCounts: trace.finalDispositionCounts,
    dominantReasonCodes: dominantReasons(combinedReasons),
  };
}
export function buildTopStoriesRailFunnelAnalytics(observations = []) {
  const ordered = [...observations].sort((left, right) => String(left.scheduledAt || '').localeCompare(String(right.scheduledAt || '')));
  const rows = ordered.map(buildObservationRow);
  const bucketCounts = { '0': 0, '1-3': 0, '4-7': 0, '8-9': 0, '10': 0, other: 0 };
  const candidateBuildDispositionCounts = {};
  const candidateBuildReasonCounts = {};
  const editorialIdentityReasonCounts = {};
  const identityStateCounts = {};
  const identityMethodCounts = {};
  const finalDispositionCounts = {};
  const finalReasonCounts = {};
  const stageReasonCounts = { admission: {}, selection: {}, display: {} };
  ordered.forEach(observation => {
    increment(bucketCounts, getRailBucket(
      Number(observation.displayedCount ?? observation.displayed?.length ?? 0),
      Number(observation.displayDepth ?? 10),
    ));
    mergeCounts(candidateBuildDispositionCounts, countBy(
      observation.candidateBuildTrace,
      'buildDisposition',
    ));
    mergeCounts(candidateBuildReasonCounts, countBy(observation.candidateBuildTrace, 'reasonCode'));
    const identityEvidence = getEditorialIdentityEvidence(observation, EDITORIAL_IDENTITY_STAGE);
    mergeCounts(editorialIdentityReasonCounts, identityEvidence.identityReasonCounts);
    mergeCounts(identityStateCounts, identityEvidence.identityStateCounts);
    mergeCounts(identityMethodCounts, identityEvidence.identityMethodCounts);
    const trace = countTraceReasons(observation.selectionTrace || []);
    mergeCounts(finalDispositionCounts, trace.finalDispositionCounts);
    mergeCounts(finalReasonCounts, trace.finalReasonCounts);
    Object.keys(stageReasonCounts).forEach(stage =>
      mergeCounts(stageReasonCounts[stage], trace.stageReasonCounts[stage]));
  });
  const combinedReasonCounts = combineCounts(
    candidateBuildReasonCounts,
    editorialIdentityReasonCounts,
    finalReasonCounts,
  );
  const categoryReasonCounts = {};
  Object.entries(combinedReasonCounts).forEach(([reason, count]) =>
    increment(categoryReasonCounts, classifyReason(reason), count));
  const observationCount = rows.length;
  const underfilledCount = rows.filter(row => row.underfilled).length;
  const belowSoftDepthCount = rows.filter(row => row.belowSoftReviewDepth).length;
  const identityAccountingChecks = rows
    .map(row => row.identityAccountingConserved)
    .filter(value => typeof value === 'boolean');
  const identityAccountingEvidenceCount = identityAccountingChecks.length;
  const accountingBySchemaVersion = summarizeIdentityAccountingBySchema(rows);
  const schemaVersions = Object.keys(accountingBySchemaVersion).filter(version => version !== 'unversioned');
  const identityAccountingConserved = identityAccountingEvidenceCount
    ? identityAccountingEvidenceCount === observationCount &&
      schemaVersions.length <= 1 && identityAccountingChecks.every(Boolean)
    : null;
  return {
    observationCount,
    softReviewDepth: SOFT_REVIEW_DEPTH,
    rankedCount: summarize(rows.map(row => row.rankedCount)),
    displayedCount: summarize(rows.map(row => row.displayedCount)),
    editorialIdentityCount: summarize(rows.map(row => row.editorialIdentityCount)),
    identityResolutionCoverage: summarize(rows.map(row => row.identityResolutionCoverage)),
    identityAccountingEvidenceCount,
    identityAccountingConserved,
    identityAccountingBySchemaVersion: accountingBySchemaVersion,
    railBuckets: bucketCounts,
    underfilledAgainstDisplayDepth: {
      count: underfilledCount,
      fraction: observationCount ? underfilledCount / observationCount : null,
    },
    belowSoftReviewDepth: {
      count: belowSoftDepthCount,
      fraction: observationCount ? belowSoftDepthCount / observationCount : null,
    },
    funnelStages: summarizeFunnelStages(ordered),
    candidateBuildDispositionCounts: Object.fromEntries(
      Object.entries(candidateBuildDispositionCounts).sort(),
    ),
    candidateBuildReasonCounts: Object.fromEntries(Object.entries(candidateBuildReasonCounts).sort()),
    editorialIdentityReasonCounts: Object.fromEntries(
      Object.entries(editorialIdentityReasonCounts).sort(),
    ),
    identityStateCounts: Object.fromEntries(Object.entries(identityStateCounts).sort()),
    identityMethodCounts: Object.fromEntries(Object.entries(identityMethodCounts).sort()),
    finalDispositionCounts: Object.fromEntries(Object.entries(finalDispositionCounts).sort()),
    finalReasonCounts: Object.fromEntries(Object.entries(finalReasonCounts).sort()),
    stageReasonCounts: Object.fromEntries(Object.entries(stageReasonCounts).map(([stage, counts]) => [
      stage,
      Object.fromEntries(Object.entries(counts).sort()),
    ])),
    categoryReasonCounts: Object.fromEntries(Object.entries(categoryReasonCounts).sort()),
    dominantReasonCodes: dominantReasons(combinedReasonCounts, 10),
    observations: rows,
  };
}
