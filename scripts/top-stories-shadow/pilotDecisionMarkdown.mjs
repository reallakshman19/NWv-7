function percentage(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : 'n/a';
}

function number(value, digits = 2) {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : 'n/a';
}

function checklist(decision) {
  return Object.entries(decision.reviewChecklist || {}).map(([key, value]) =>
    `- [${value ? 'x' : ' '}] ${key}`);
}

function reasonLines(title, rows = []) {
  return [
    `### ${title}`,
    '',
    ...(rows.length ? rows.map(row => `- \`${row}\``) : ['- None.']),
    '',
  ];
}

export function renderTopStoriesPilotDecisionMarkdown(decision) {
  const metrics = decision.metrics || {};
  const operational = metrics.operational || {};
  const stability = metrics.stability || {};
  const rail = metrics.railAndFunnel || {};
  const unchanged15 = metrics.inputChange?.fifteenMinute?.unchangedInput || {};
  const residence = metrics.residence || {};
  return [
    `# Top Stories seven-day pilot decision — ${decision.pilotStartDate} to ${decision.pilotEndDate}`,
    '',
    `- Study: \`${decision.studyId}\``,
    `- Decision: **${decision.decision}**`,
    `- Review recommendation: **${decision.recommendation}**`,
    `- Generated at: \`${decision.generatedAt}\``,
    `- Production change authorized: **${decision.productionChangeAuthorized}**`,
    '',
    '## Operational evidence',
    '',
    `- Expected days: **${operational.expectedDayCount ?? 0}**`,
    `- Represented days: **${operational.representedDayCount ?? 0}**`,
    `- Usable days: **${operational.usableDayCount ?? 0}**`,
    `- Median schedule-slot coverage: **${percentage(operational.scheduleSlotCoverage?.median)}**`,
    `- Median artifact-emission rate: **${percentage(operational.artifactEmissionRate?.median)}**`,
    '',
    '## Calm and active stability',
    '',
    '| Evidence | Value |',
    '|---|---:|',
    `| Calm 15-minute canonical comparisons | ${stability.calm15mCanonicalComparisonCount ?? 0} |`,
    `| Calm 15-minute daily-median retention | ${percentage(stability.calm15mDailyMedian?.median)} |`,
    `| Calm 60-minute canonical comparisons | ${stability.calm60mCanonicalComparisonCount ?? 0} |`,
    `| Calm 60-minute daily-median retention | ${percentage(stability.calm60mDailyMedian?.median)} |`,
    `| Active canonical comparisons | ${(stability.active15mCanonicalComparisonCount || 0) + (stability.active60mCanonicalComparisonCount || 0)} |`,
    `| Active evidence days | ${stability.activeEvidenceDays?.length || 0} |`,
    '',
    '## Visible rail sufficiency',
    '',
    `- Observation count: **${rail.observationCount ?? 0}**`,
    `- Median displayed stories: **${rail.displayedCount?.median ?? 'n/a'}**`,
    `- Minimum displayed stories: **${rail.displayedCount?.minimum ?? 'n/a'}**`,
    `- Below soft depth: **${rail.belowSoftReviewDepth?.count ?? 0}** (${percentage(rail.belowSoftReviewDepth?.fraction)})`,
    `- Under configured display depth: **${rail.underfilledAgainstDisplayDepth?.count ?? 0}** (${percentage(rail.underfilledAgainstDisplayDepth?.fraction)})`,
    '',
    '| Displayed stories | Observations |',
    '|---|---:|',
    `| 0 | ${rail.railBuckets?.['0'] || 0} |`,
    `| 1–3 | ${rail.railBuckets?.['1-3'] || 0} |`,
    `| 4–7 | ${rail.railBuckets?.['4-7'] || 0} |`,
    `| 8–9 | ${rail.railBuckets?.['8-9'] || 0} |`,
    `| 10 | ${rail.railBuckets?.['10'] || 0} |`,
    '',
    '## Input-change attribution',
    '',
    `- Unchanged-input canonical 15-minute comparisons: **${unchanged15.comparisonCount || 0}**`,
    `- Unchanged-input daily-median incumbent retention: **${percentage(unchanged15.dailyMedianIncumbentRetention?.median)}**`,
    `- Unchanged-input daily-median rank displacement: **${number(unchanged15.dailyMedianRankDisplacement?.median)}**`,
    '',
    '## Residence evidence',
    '',
    `- Residence episodes: **${residence.episodeCount || 0}**`,
    `- Re-entry episodes: **${residence.reentryEpisodeCount || 0}**`,
    `- Median duration: **${number(residence.durationMinutes?.median, 1)} minutes**`,
    `- Median uncensored duration: **${number(residence.uncensoredDurationMinutes?.median, 1)} minutes**`,
    '',
    '## Day-by-day evidence',
    '',
    '| Date | Status | Validation | Slot coverage | Displayed median | Calm 15m | Calm 60m |',
    '|---|---|---|---:|---:|---:|---:|',
    ...(decision.days || []).map(day =>
      `| ${day.date} | ${day.status} | ${day.validationDecision || 'n/a'} | ${percentage(day.scheduleSlotCoverage)} | ${day.displayedMedian ?? 'n/a'} | ${percentage(day.calm15mMedianRetention)} | ${percentage(day.calm60mMedianRetention)} |`),
    '',
    ...reasonLines('Recommendation reasons', decision.reasonCodes),
    ...reasonLines('Failure reasons', decision.failureReasonCodes),
    ...reasonLines('Insufficiency reasons', decision.insufficiencyReasonCodes),
    ...reasonLines('Evidence gaps', decision.evidenceGaps),
    '## Expert review checklist',
    '',
    ...checklist(decision),
    '',
    'This evidence pack is advisory. It does not modify production ranking, persistence, sources, or UI behavior.',
    '',
  ].join('\n');
}
