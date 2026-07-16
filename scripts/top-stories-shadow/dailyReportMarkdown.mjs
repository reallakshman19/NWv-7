function percentage(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : 'n/a';
}

export function renderTopStoriesDailyMarkdown(report) {
  const f15 = report.stability.fifteenMinute.overlapping.calm.incumbentRetention;
  const f60 = report.stability.sixtyMinute.overlapping.calm.incumbentRetention;
  return [
    `# Top Stories shadow daily report — ${report.date}`,
    '',
    `- Study: \`${report.studyId || 'unspecified'}\``,
    `- Status: **${report.status}**`,
    `- Scheduled-slot coverage: **${percentage(report.coverage.scheduleSlotCoverage)}** (${report.coverage.observedSlotCount}/96)`,
    `- Successful observations: **${report.coverage.successfulRuns}**`,
    `- Valid 15-minute pairs: **${report.coverage.valid15mPairs}**`,
    `- Valid 60-minute pairs: **${report.coverage.valid60mPairs}**`,
    `- Invalid artifacts: **${report.coverage.invalidArtifacts}**`,
    `- Superseded duplicates: **${report.coverage.supersededDuplicateCount}**`,
    '',
    '## Calm-period stability',
    '',
    '| Horizon | Comparisons | Median incumbent retention | p10 | Below review threshold |',
    '|---|---:|---:|---:|---:|',
    `| 15 minutes | ${f15.count} | ${percentage(f15.median)} | ${percentage(f15.p10)} | ${percentage(f15.fractionBelowThreshold)} |`,
    `| 60 minutes | ${f60.count} | ${percentage(f60.median)} | ${percentage(f60.p10)} | ${percentage(f60.fractionBelowThreshold)} |`,
    '',
    '## Statistical interpretation',
    '',
    report.pairing.serialCorrelationNotice,
    'Canonical non-overlapping sensitivity results are retained separately in the JSON report.',
    '',
    'This is observational evidence only. It does not change production ranking or persistence behavior.',
    '',
  ].join('\n');
}
