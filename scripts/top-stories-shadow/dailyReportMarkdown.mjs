function percentage(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : 'n/a';
}

function count(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function identityPopulationLines(rail = {}) {
  const stage = (rail.funnelStages || []).find(
    row => row.stage === 'editorial_identity_population',
  );
  if (!stage) return [];
  return [
    `- Median resolved \`EDITORIAL_IDENTITY\` population: **${rail.editorialIdentityCount?.median ?? 'n/a'}**`,
    `- Median candidate identity-resolution coverage: **${percentage(rail.identityResolutionCoverage?.median)}**`,
    `- Identity population role: \`${stage.populationRole || 'unknown'}\``,
    `- Identity accounting conserved: **${rail.identityAccountingConserved ? 'yes' : 'no'}**`,
  ];
}

function railLines(report) {
  const rail = report.railAndFunnel;
  if (!rail) return ['## Visible rail and funnel', '', 'Rail/funnel analytics were not supplied.', ''];
  const buckets = rail.railBuckets || {};
  const dominant = (rail.dominantReasonCodes || []).slice(0, 5);
  return [
    '## Visible rail and funnel',
    '',
    `- Median displayed stories: **${rail.displayedCount?.median ?? 'n/a'}**`,
    `- Minimum displayed stories: **${rail.displayedCount?.minimum ?? 'n/a'}**`,
    `- Runs below soft review depth ${rail.softReviewDepth}: **${count(rail.belowSoftReviewDepth?.count)}** (${percentage(rail.belowSoftReviewDepth?.fraction)})`,
    `- Runs below configured display depth: **${count(rail.underfilledAgainstDisplayDepth?.count)}** (${percentage(rail.underfilledAgainstDisplayDepth?.fraction)})`,
    ...identityPopulationLines(rail),
    '',
    '| Displayed stories | Observations |',
    '|---|---:|',
    `| 0 | ${count(buckets['0'])} |`,
    `| 1–3 | ${count(buckets['1-3'])} |`,
    `| 4–7 | ${count(buckets['4-7'])} |`,
    `| 8–9 | ${count(buckets['8-9'])} |`,
    `| 10 | ${count(buckets['10'])} |`,
    '',
    '### Dominant non-success reason codes',
    '',
    ...(dominant.length
      ? dominant.map(item => `- \`${item.reasonCode}\`: ${item.count} (${item.category})`)
      : ['- None recorded.']),
    '',
    'Population-unit funnel details and per-observation evidence are retained in `daily_report.json`.',
    '',
  ];
}

function stabilityRow(label, horizon, metric) {
  return `| ${label} | ${horizon} | ${metric?.count ?? 0} | ${percentage(metric?.median)} | ${percentage(metric?.p10)} | ${percentage(metric?.fractionBelowThreshold)} |`;
}

export function renderTopStoriesDailyMarkdown(report) {
  const f15 = report.stability?.fifteenMinute?.overlapping?.calm?.incumbentRetention || {};
  const f60 = report.stability?.sixtyMinute?.overlapping?.calm?.incumbentRetention || {};
  const c15 = report.stability?.fifteenMinute?.canonicalNonOverlapping
    ?.calm?.incumbentRetention || {};
  const c60 = report.stability?.sixtyMinute?.canonicalNonOverlapping
    ?.calm?.incumbentRetention || {};
  return [
    `# Top Stories shadow daily report — ${report.date}`,
    '',
    `- Study: \`${report.studyId || 'unspecified'}\``,
    `- Status: **${report.status}**`,
    `- Scheduled-slot coverage: **${percentage(report.coverage.scheduleSlotCoverage)}** (${report.coverage.observedSlotCount}/96)`,
    `- Successful observations: **${report.coverage.successfulRuns}**`,
    `- Valid 15-minute pairs: **${report.coverage.valid15mPairs}**`,
    `- Canonical 15-minute decision pairs: **${count(report.coverage.canonical15mPairs)}**`,
    `- Valid 60-minute pairs: **${report.coverage.valid60mPairs}**`,
    `- Canonical 60-minute decision pairs: **${count(report.coverage.canonical60mPairs)}**`,
    `- Invalid artifacts: **${report.coverage.invalidArtifacts}**`,
    `- Superseded duplicates: **${report.coverage.supersededDuplicateCount}**`,
    '',
    ...railLines(report),
    '## Calm-period stability',
    '',
    '| Evidence role | Horizon | Comparisons | Median incumbent retention | p10 | Below review threshold |',
    '|---|---|---:|---:|---:|---:|',
    stabilityRow('Descriptive / serially correlated', '15 minutes', f15),
    stabilityRow('Descriptive / serially correlated', '60 minutes', f60),
    stabilityRow('Decision evidence / canonical non-overlapping', '15 minutes', c15),
    stabilityRow('Decision evidence / canonical non-overlapping', '60 minutes', c60),
    '',
    '## Statistical interpretation',
    '',
    report.pairing?.serialCorrelationNotice ||
      'Overlapping pairs are serially correlated and are not independent experiments.',
    'Overlapping comparisons are descriptive, serially correlated evidence and are not used as independent readiness volume.',
    'Canonical non-overlapping comparisons are the decision evidence within each horizon.',
    'The 15-minute and 60-minute horizons are separate evidence domains and are never pooled.',
    '',
    'This is observational evidence only. It does not change production ranking or persistence behavior.',
    '',
  ].join('\n');
}
