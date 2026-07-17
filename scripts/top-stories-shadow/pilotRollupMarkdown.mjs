function percentage(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : 'n/a';
}

function value(number, digits = 2) {
  return Number.isFinite(number) ? number.toFixed(digits) : 'n/a';
}

function dayTable(rows = []) {
  if (!rows.length) return ['No operationally usable days were included.'];
  return [
    '| Date | Operational decision | Slot coverage | Displayed median | Below 8 | Calm 15m pairs | Calm 60m pairs | Active pairs |',
    '|---|---|---:|---:|---:|---:|---:|---:|',
    ...rows.map(row => [
      `| ${row.date}`,
      row.operationalDecision,
      percentage(row.scheduleSlotCoverage),
      row.displayedMedian ?? 'n/a',
      percentage(row.belowEightFraction),
      row.canonicalCalm15Pairs,
      row.canonicalCalm60Pairs,
      `${row.activePairs} |`,
    ].join(' | ')),
  ];
}

function excludedLines(rows = []) {
  if (!rows.length) return ['- None.'];
  return rows.map(row => `- ${row.date || 'unknown date'} — ${row.operationalDecision || 'invalid'}: ${(row.reasonCodes || []).join(', ')}`);
}

export function renderTopStoriesPilotRollupMarkdown(rollup) {
  const metrics = rollup.metrics || {};
  const reasons = metrics.dominantReasons || [];
  return [
    '# Top Stories seven-day pilot decision pack',
    '',
    `- Study: \`${rollup.studyId || 'unknown'}\``,
    `- Decision: **${rollup.decision}**`,
    `- Evidence sufficient: **${rollup.evidenceSufficient ? 'yes' : 'no'}**`,
    `- Active-event evidence sufficient: **${rollup.activeEvidenceSufficient ? 'yes' : 'no'}**`,
    `- Production change authorized: **${rollup.productionChangeAuthorized ? 'yes' : 'no'}**`,
    '',
    '## Day coverage',
    '',
    `- Distinct supplied days: **${rollup.dayCounts?.supplied ?? 0}**`,
    `- Operationally usable days: **${rollup.dayCounts?.usable ?? 0}**`,
    `- Warning days: **${rollup.dayCounts?.warnings ?? 0}**`,
    `- Insufficient days: **${rollup.dayCounts?.insufficient ?? 0}**`,
    `- Failed/invalid days: **${rollup.dayCounts?.failed ?? 0}**`,
    '',
    '## Rail sufficiency',
    '',
    `- Included observations: **${metrics.observations ?? 0}**`,
    `- Median of daily displayed-count medians: **${metrics.displayedMedianAcrossDays?.median ?? 'n/a'}**`,
    `- Observations below eight stories: **${percentage(metrics.belowEightFraction)}**`,
    `- Observations with zero to three stories: **${percentage(metrics.severeCollapseFraction)}**`,
    '',
    '## Calm-period stability',
    '',
    '| Horizon | Days with evidence | Canonical pairs | Median of daily medians | Review target |',
    '|---|---:|---:|---:|---:|',
    `| 15 minutes | ${metrics.calm15?.days ?? 0} | ${metrics.calm15?.pairs ?? 0} | ${percentage(metrics.calm15?.medianAcrossDays)} | 90.0% |`,
    `| 60 minutes | ${metrics.calm60?.days ?? 0} | ${metrics.calm60?.pairs ?? 0} | ${percentage(metrics.calm60?.medianAcrossDays)} | 80.0% |`,
    '',
    '## Active responsiveness',
    '',
    `- Days/episodes with active evidence: **${metrics.active?.episodes ?? 0}**`,
    `- Active canonical pairs: **${metrics.active?.canonicalOrOverlappingPairs ?? 0}**`,
    '',
    '## Included days',
    '',
    ...dayTable(metrics.days),
    '',
    '## Excluded days',
    '',
    ...excludedLines(rollup.excludedDays),
    '',
    '## Dominant funnel and rejection causes',
    '',
    ...(reasons.length
      ? reasons.map(item => `- \`${item.reasonCode}\`: ${item.count}`)
      : ['- No non-success reason evidence was available.']),
    '',
    '## Evidence gates',
    '',
    ...(rollup.insufficiencyReasonCodes?.length
      ? rollup.insufficiencyReasonCodes.map(reason => `- Insufficient: \`${reason}\``)
      : ['- Statistical sufficiency gates passed.']),
    ...(rollup.technicalFailureReasonCodes?.length
      ? rollup.technicalFailureReasonCodes.map(reason => `- Technical: \`${reason}\``)
      : ['- No technical failure reason was recorded.']),
    '',
    '## Interpretation',
    '',
    `The decision code is **${rollup.decision}**. Thresholds are review criteria, not production truth.`,
    'Overlapping interval comparisons are not treated as independent experiments; the recommendation uses day-level summaries and canonical non-overlapping pair counts.',
    'This artifact does not authorize a ranking, recall, persistence, source, UI, or deployment change.',
    '',
    `Rollup schema: \`${rollup.schemaVersion}\`.`,
    `Displayed median reference: ${value(metrics.displayedMedianAcrossDays?.median)}.`,
    '',
  ].join('\n');
}
