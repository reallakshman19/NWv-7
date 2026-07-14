const STATUS_SCORE = Object.freeze({ ok: 0, warning: 1, critical: 2 });

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function textValue(value) {
  return String(value ?? '').trim();
}

function normalizeKey(value) {
  return textValue(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function numberValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
}

function worstStatus(...statuses) {
  return statuses.reduce((worst, status) => {
    const normalized = normalizeStatus(status);
    return STATUS_SCORE[normalized] > STATUS_SCORE[worst] ? normalized : worst;
  }, 'ok');
}

function normalizeStatus(value) {
  const status = normalizeKey(value);
  if (['critical', 'fail', 'failed', 'dead', 'error'].includes(status)) return 'critical';
  if (['warning', 'warn', 'degraded', 'thin', 'stale', 'unknown'].includes(status)) return 'warning';
  return 'ok';
}

function normalizeTimestamp(value) {
  return textValue(value) || null;
}

function hasSectionSummaryShape(envelope = {}) {
  if (!isRecord(envelope)) return false;
  const data = isRecord(envelope.data) ? envelope.data : envelope;
  if (Array.isArray(data.summaries) || Array.isArray(envelope.summaries)) return true;
  return isRecord(data.sections) && Object.values(data.sections).some(Array.isArray);
}

export function resolveSectionsHealthEnvelope(input = {}) {
  if (!isRecord(input)) return input;
  if (hasSectionSummaryShape(input)) return input;

  const data = isRecord(input.data) ? input.data : input;
  const raw = isRecord(data.raw) ? data.raw : {};
  const candidates = [
    data.sectionsEnvelope,
    data.sectionsDataset,
    raw.sections,
    raw.sectionsEnvelope,
    raw.sectionsDataset,
    input.sectionsEnvelope,
    input.sectionsDataset,
  ];

  for (const candidate of candidates) {
    if (!isRecord(candidate) || candidate === input) continue;
    const resolved = resolveSectionsHealthEnvelope(candidate);
    if (hasSectionSummaryShape(resolved)) return resolved;
  }

  return input;
}

function getEmbeddedSourceHealthInput(sectionsEnvelope = {}) {
  const resolved = resolveSectionsHealthEnvelope(sectionsEnvelope);
  const data = isRecord(resolved?.data) ? resolved.data : (isRecord(resolved) ? resolved : {});
  const raw = isRecord(data.raw) ? data.raw : {};
  return (
    data.sourceHealth ||
    data.source_health ||
    data.sectionSourceHealth ||
    data.section_source_health ||
    data.sourceHealthEnvelope ||
    raw.sourceHealth ||
    raw.source_health ||
    raw.sectionSourceHealth ||
    raw.section_source_health ||
    {}
  );
}

function hasExplicitSourceHealthInput(input) {
  if (Array.isArray(input)) return input.length > 0;
  return isRecord(input) && Object.keys(input).length > 0;
}

function normalizeSourceRow(source = {}, index = 0) {
  const id = normalizeKey(source.id || source.key || source.sourceGroup || source.name || source.source || `source_${index}`);
  const section = normalizeKey(source.section || source.sectionId || source.category || source.topic || '');
  const sections = unique([
    section,
    ...asArray(source.sections).map(normalizeKey),
  ]);
  const sourceGroup = normalizeKey(source.sourceGroup || source.group || source.id || source.key || source.name || source.source || id);
  const items = numberValue(source.items ?? source.itemCount ?? source.count ?? source.storyCount, 0);
  const zeroItemRuns = numberValue(source.zeroItemRuns ?? source.zero_item_runs, items === 0 ? 1 : 0);
  const rawStatus = source.status || source.health || source.state || (source.ok === false ? 'fail' : source.ok === true ? 'ok' : 'unknown');
  const status = normalizeStatus(rawStatus);
  const lastError = textValue(source.lastError || source.error || source.message || source.reason);
  const feedUrl = textValue(source.feedUrl || source.url || source.href);
  return {
    id,
    section,
    sections,
    sourceGroup,
    source: textValue(source.source || source.name || source.label || id),
    status,
    ok: source.ok === false ? false : status !== 'critical',
    items,
    zeroItemRuns,
    lastZeroItemAt: normalizeTimestamp(source.lastZeroItemAt || source.last_zero_item_at),
    lastNonZeroSuccess: normalizeTimestamp(source.lastNonZeroSuccess || source.last_non_zero_success || source.lastSuccessAt || source.last_success_at || source.lastOkAt),
    lastFailure: normalizeTimestamp(source.lastFailure || source.last_failure_at),
    lastCheckedAt: normalizeTimestamp(source.lastCheckedAt || source.last_checked_at || source.checkedAt || source.fetchedAt),
    feedUrl,
    lastError,
  };
}

function sourceRowsFromObjectShape(raw) {
  if (!isRecord(raw)) return [];
  return Object.entries(raw).map(([id, value]) => ({
    id,
    ...(isRecord(value) ? value : { status: value }),
  }));
}

export function normalizeSourceHealthRows(input = {}) {
  if (Array.isArray(input)) return input.map(normalizeSourceRow);
  const resolved = resolveSectionsHealthEnvelope(input);
  const data = resolved?.data || resolved;
  const raw = data?.raw || data;
  const candidates = [
    data?.sources,
    data?.sourceHealth,
    data?.source_health,
    data?.sectionSourceHealth,
    data?.section_source_health,
    data?.latest?.sources,
    data?.latest?.sourceHealth,
    raw?.sources,
    raw?.sourceHealth,
    raw?.source_health,
    raw?.sectionSourceHealth,
    raw?.section_source_health,
    raw?.latest?.sources,
    raw?.latest?.sourceHealth,
  ];
  const arrayCandidate = candidates.find(Array.isArray);
  if (arrayCandidate) return arrayCandidate.map(normalizeSourceRow);
  const objectCandidate = candidates.find(isRecord) || (isRecord(raw) && !hasSectionSummaryShape(resolved) ? raw : null);
  return sourceRowsFromObjectShape(objectCandidate).map(normalizeSourceRow);
}

function normalizeSummary(summary = {}) {
  const sectionId = normalizeKey(summary.section || summary.sectionId || summary.id || summary.key || 'unknown');
  const sourceCounts = isRecord(summary.sourceCounts) ? summary.sourceCounts : {};
  const sourceGroups = unique([
    ...Object.keys(sourceCounts).map(normalizeKey),
    ...asArray(summary.items).map(item => normalizeKey(item?.sourceGroup || item?.source)).filter(Boolean),
  ]);
  const sectionQuality = summary.sectionQuality || summary.quality || {};
  return {
    sectionId,
    ok: summary.ok !== false,
    storyCount: numberValue(summary.count ?? summary.storyCount ?? asArray(summary.items).length, 0),
    sourceCounts,
    sourceGroups,
    healthStatus: summary.health?.status || sectionQuality.status || null,
    isSingleSource: Boolean(summary.isSingleSource) || sourceGroups.length === 1,
    staleReason: textValue(summary.staleReason || summary.fetchDiagnostics?.fallbackReason || sectionQuality.reason),
    lastCheckedAt: normalizeTimestamp(summary.fetchDiagnostics?.lastCheckedAt || summary.fetchDiagnostics?.checkedAt || summary.snapshotRuntimeSummary?.generatedAt),
    lastError: textValue(summary.error || summary.fetchDiagnostics?.error || sectionQuality.error),
  };
}

function getSummaries(sectionsEnvelope = {}) {
  const resolved = resolveSectionsHealthEnvelope(sectionsEnvelope);
  const data = resolved?.data || resolved || {};
  if (Array.isArray(data.summaries)) return data.summaries.map(normalizeSummary);
  if (Array.isArray(resolved?.summaries)) return resolved.summaries.map(normalizeSummary);
  if (isRecord(data.sections)) {
    return Object.entries(data.sections).map(([section, items]) => normalizeSummary({ section, items, count: asArray(items).length }));
  }
  return [];
}

function sourceBelongsToSection(source, sectionId) {
  if (!source || !sectionId) return false;
  const sourceSections = asArray(source.sections);
  if (source.section === sectionId || sourceSections.includes(sectionId)) return true;
  if ((source.section === 'tn' || sourceSections.includes('tn')) && sectionId === 'chennai') return true;
  if ((source.section === 'muscat' || sourceSections.includes('muscat')) && sectionId === 'local') return true;
  return false;
}

function sourceReason(source) {
  if (source.status === 'critical') return `${source.id}: failed${source.lastError ? ` (${source.lastError})` : ''}`;
  if (source.zeroItemRuns >= 10) return `${source.id}: zero-item streak ${source.zeroItemRuns}`;
  if (source.zeroItemRuns >= 3) return `${source.id}: thin source zero-item streak ${source.zeroItemRuns}`;
  if (source.status === 'warning') return `${source.id}: warning status`;
  return '';
}

function summarizeSourcesForSection(sectionId, sourceRows) {
  const sources = sourceRows.filter(source => sourceBelongsToSection(source, sectionId));
  const warningFeeds = [];
  const deadFeeds = [];
  const staleFeeds = [];
  const zeroItemFeeds = [];
  const reasons = [];
  sources.forEach(source => {
    if (source.status === 'critical') deadFeeds.push(source);
    if (source.status === 'warning') warningFeeds.push(source);
    if (source.zeroItemRuns >= 3) zeroItemFeeds.push(source);
    if (source.zeroItemRuns >= 10 || source.status === 'critical') staleFeeds.push(source);
    const reason = sourceReason(source);
    if (reason) reasons.push(reason);
  });
  return {
    sources,
    warningFeeds,
    deadFeeds,
    staleFeeds,
    zeroItemFeeds,
    reasons,
  };
}

function buildTopSources(summary, sourceStats) {
  const fromCounts = Object.entries(summary.sourceCounts || {}).map(([source, count]) => ({
    source,
    count: numberValue(count),
  }));
  const fromHealth = sourceStats.sources.map(source => ({ source: source.source || source.id, count: source.items }));
  return [...fromCounts, ...fromHealth]
    .filter(row => row.source)
    .sort((a, b) => numberValue(b.count) - numberValue(a.count) || String(a.source).localeCompare(String(b.source)))
    .slice(0, 8);
}

export function buildSectionHealthSummary(summary = {}, sourceRows = [], options = {}) {
  const normalizedSummary = normalizeSummary(summary);
  const sourceStats = summarizeSourcesForSection(normalizedSummary.sectionId, sourceRows);
  const reasons = [];
  let status = normalizeStatus(normalizedSummary.healthStatus || 'ok');

  if (!normalizedSummary.ok) {
    status = 'critical';
    reasons.push('section_fetch_failed');
  }
  if (normalizedSummary.storyCount === 0 && sourceStats.deadFeeds.length > 0) {
    status = 'critical';
    reasons.push('empty_section_with_failed_sources');
  }
  if (sourceStats.sources.length > 0 && sourceStats.deadFeeds.length === sourceStats.sources.length) {
    status = 'critical';
    reasons.push('all_known_sources_failed');
  }
  if (normalizedSummary.isSingleSource || normalizedSummary.sourceGroups.length === 1) {
    status = worstStatus(status, 'warning');
    reasons.push('single_source_section');
  }
  if (normalizedSummary.sourceGroups.length > 0 && normalizedSummary.sourceGroups.length < numberValue(options.minSourceGroups, 2)) {
    status = worstStatus(status, 'warning');
    reasons.push('thin_source_group_count');
  }
  if (normalizedSummary.staleReason) {
    status = worstStatus(status, 'warning');
    reasons.push(`stale_reason:${normalizedSummary.staleReason}`);
  }
  if (sourceStats.zeroItemFeeds.length > 0) {
    const allKnownSourcesFailed = sourceStats.sources.length > 0 && sourceStats.deadFeeds.length === sourceStats.sources.length;
    const zeroItemSeverity = normalizedSummary.storyCount === 0 || allKnownSourcesFailed ? 'critical' : 'warning';
    const hasPersistentZeroItemFeed = sourceStats.zeroItemFeeds.some(feed => feed.zeroItemRuns >= 10);
    status = worstStatus(status, zeroItemSeverity);
    reasons.push(hasPersistentZeroItemFeed ? 'persistent_zero_item_feed_streak' : 'zero_item_feed_streak');
  }
  if (sourceStats.warningFeeds.length > 0) {
    status = worstStatus(status, 'warning');
    reasons.push('source_warning_status');
  }
  if (sourceStats.deadFeeds.length > 0) {
    status = worstStatus(status, normalizedSummary.storyCount === 0 ? 'critical' : 'warning');
    reasons.push('source_failure_present');
  }

  const lastCheckedAt = normalizedSummary.lastCheckedAt || sourceStats.sources.map(source => source.lastCheckedAt).filter(Boolean).sort().at(-1) || null;
  const lastNonZeroSuccess = sourceStats.sources.map(source => source.lastNonZeroSuccess).filter(Boolean).sort().at(-1) || null;
  const lastError = normalizedSummary.lastError || sourceStats.deadFeeds.map(source => source.lastError).find(Boolean) || '';

  return {
    sectionId: normalizedSummary.sectionId,
    status,
    storyCount: normalizedSummary.storyCount,
    sourceGroupCount: normalizedSummary.sourceGroups.length,
    topSources: buildTopSources(normalizedSummary, sourceStats),
    warningFeeds: sourceStats.warningFeeds.map(feed => ({ id: feed.id, feedUrl: feed.feedUrl, lastError: feed.lastError, zeroItemRuns: feed.zeroItemRuns })),
    deadFeeds: sourceStats.deadFeeds.map(feed => ({ id: feed.id, feedUrl: feed.feedUrl, lastError: feed.lastError, zeroItemRuns: feed.zeroItemRuns })),
    staleFeeds: sourceStats.staleFeeds.map(feed => ({ id: feed.id, feedUrl: feed.feedUrl, lastNonZeroSuccess: feed.lastNonZeroSuccess, zeroItemRuns: feed.zeroItemRuns })),
    zeroItemFeeds: sourceStats.zeroItemFeeds.map(feed => ({ id: feed.id, zeroItemRuns: feed.zeroItemRuns, feedUrl: feed.feedUrl })),
    singleSource: normalizedSummary.isSingleSource || normalizedSummary.sourceGroups.length === 1,
    lastCheckedAt,
    lastNonZeroSuccess,
    lastError,
    reasons: unique([...reasons, ...sourceStats.reasons]),
  };
}

export function buildSectionHealthSummaries(sectionsEnvelope = {}, sourceHealthInput = {}, options = {}) {
  const resolvedEnvelope = resolveSectionsHealthEnvelope(sectionsEnvelope);
  const effectiveSourceHealthInput = hasExplicitSourceHealthInput(sourceHealthInput)
    ? sourceHealthInput
    : getEmbeddedSourceHealthInput(resolvedEnvelope);
  const sourceRows = normalizeSourceHealthRows(effectiveSourceHealthInput);
  return getSummaries(resolvedEnvelope)
    .map(summary => buildSectionHealthSummary(summary, sourceRows, options))
    .sort((a, b) => a.sectionId.localeCompare(b.sectionId));
}

export function getSectionHealthSummary(sectionId, sectionsEnvelope = {}, sourceHealthInput = {}, options = {}) {
  const normalized = normalizeKey(sectionId);
  return buildSectionHealthSummaries(sectionsEnvelope, sourceHealthInput, options)
    .find(summary => summary.sectionId === normalized) || null;
}
