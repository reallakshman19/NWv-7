function percentage(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : 'n/a';
}

function valueText(value) {
  if (value === null || value === undefined) return 'n/a';
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'none';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function renderTopStoriesOperationalValidationMarkdown(validation) {
  const metrics = validation.metrics || {};
  const checks = validation.checks || [];
  return [
    `# Top Stories 24-hour operational validation — ${validation.date || 'unknown date'}`,
    '',
    `- Study: \`${validation.studyId || 'unknown'}\``,
    `- Decision: **${validation.decision}**`,
    `- Daily report status: **${validation.reportStatus || 'unknown'}**`,
    `- Schedule-slot coverage: **${percentage(metrics.scheduleSlotCoverage)}**`,
    `- Artifact-emission rate: **${percentage(metrics.artifactEmissionRate)}**`,
    `- Complete-run rate: **${percentage(metrics.completeRunRate)}**`,
    `- Analytical-eligibility rate: **${percentage(metrics.analyticalEligibilityRate)}**`,
    '',
    '## Pair coverage',
    '',
    '| Population | Count |',
    '|---|---:|',
    `| Valid 15-minute pairs | ${valueText(metrics.valid15mPairs)} |`,
    `| Canonical 15-minute pairs | ${valueText(metrics.canonical15mPairs)} |`,
    `| Valid 60-minute pairs | ${valueText(metrics.valid60mPairs)} |`,
    `| Canonical 60-minute pairs | ${valueText(metrics.canonical60mPairs)} |`,
    '',
    '## Operational checks',
    '',
    '| Check | Status | Actual | Threshold | Reason |',
    '|---|---|---|---|---|',
    ...checks.map(check => (
      `| ${check.id} | ${check.status} | ${valueText(check.actual)} | ${valueText(check.threshold)} | ${check.reasonCode || ''} |`
    )),
    '',
    '## Reason codes',
    '',
    `- Failures: ${valueText(validation.failureReasonCodes)}`,
    `- Warnings: ${valueText(validation.warningReasonCodes)}`,
    `- Insufficiencies: ${valueText(validation.insufficiencyReasonCodes)}`,
    '',
    '## Editorial observations',
    '',
    `- Calm 15-minute median incumbent retention: ${percentage(validation.editorialObservations?.calm15mMedianIncumbentRetention)}`,
    `- Calm 60-minute median incumbent retention: ${percentage(validation.editorialObservations?.calm60mMedianIncumbentRetention)}`,
    '',
    'Editorial metrics are observations only and cannot alter this operational decision.',
    'This validation does not authorize a production ranking or persistence change.',
    '',
  ].join('\n');
}
