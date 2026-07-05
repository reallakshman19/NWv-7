import {
  makeEnvelope,
  ENVELOPE_SOURCES,
  ENVELOPE_FRESHNESS,
} from '../dataEnvelope.js';
import { applyDatasetSlo } from '../slo/applyDatasetSlo.js';
import { fetchSectionNews } from '../../services/rssAggregator.js';
import { composeBalancedFeed } from '../../services/frontPageComposer.js';
import { getSettings } from '../../utils/storage.js';
import { deduplicateAndCluster } from '../../utils/similarity.js';
import { consumeSectionsSnapshotBudgetExit } from '../../adapters/sectionsSnapshotFetcher.js';
import {
  SERVED_FROM,
  attachFetchDiagnostics,
  createFetchTrace,
  markFetchPhase,
} from '../../services/fetchLifecycleDiagnostics.js';

export const id = 'sections';
export const description = 'Section news dataset with snapshot-first Hybrid support';

const DEFAULT_SECTIONS = [
  'world',
  'india',
  'chennai',
  'trichy',
  'local',
  'social',
  'entertainment',
  'business',
  'technology',
];

const DEFAULT_MAX_SECTIONS = 6;

function safeGetSettings() {
  try {
    return getSettings?.() || {};
  } catch (error) {
    console.warn('[sectionsDataset] getSettings failed', error);
    return {};
  }
}

function getEnabledSections(settings) {
  return DEFAULT_SECTIONS.filter(section => settings?.sections?.[section]?.enabled !== false);
}

function getRequestedSections(settings, options = {}, diagnostics = []) {
  const rawSections = Array.isArray(options.sections) && options.sections.length > 0
    ? options.sections
    : getEnabledSections(settings);
  const maxSections = Math.max(1, Number(options.maxSections || DEFAULT_MAX_SECTIONS));
  const boundedSections = rawSections.slice(0, maxSections);
  if (rawSections.length > boundedSections.length) {
    diagnostics.push({
      event: 'sectionsDataset.section_limit_applied',
      severity: 'info',
      message: `Bounded section loading from ${rawSections.length} to ${boundedSections.length}`,
      details: { requestedCount: rawSections.length, maxSections, requestedSections: rawSections, loadedSections: boundedSections },
    });
  }
  return boundedSections;
}

function getSectionLimit(settings, section) {
  return Number(settings?.sections?.[section]?.count || 10) + 5;
}

function countSources(items = []) {
  const counts = {};
  items.forEach(item => {
    const source = item?.source || 'Unknown';
    counts[source] = (counts[source] || 0) + 1;
  });
  return counts;
}

function getDuplicateHints(items = []) {
  const seen = new Map();
  const duplicates = [];
  items.forEach(item => {
    const key = item?.canonicalId || item?.id || item?.url || item?.title;
    if (!key) return;
    if (seen.has(key)) duplicates.push({ key, title: item?.title || '' });
    seen.set(key, true);
  });
  return duplicates.slice(0, 20);
}

function inferServedFrom(result) {
  if (result?.fetchDiagnostics?.servedFrom) return result.fetchDiagnostics.servedFrom;
  if (result?.prefetched && result?.staleReason) return SERVED_FROM.STALE_FALLBACK;
  if (result?.prefetched) return SERVED_FROM.STATIC_SNAPSHOT;
  if (Array.isArray(result) && result.length === 0) return SERVED_FROM.EMPTY;
  return SERVED_FROM.LIVE_RSS;
}

function ensureSectionDiagnostics(section, result, durationMs) {
  if (result?.fetchDiagnostics) {
    result.fetchDiagnostics.sectionFetchDurationMs = durationMs;
    result.sectionFetchDurationMs = durationMs;
    return result;
  }
  const trace = createFetchTrace({ datasetId: 'sections', section, fetchMode: 'hybrid' });
  markFetchPhase(trace, 'section-fetch', {
    durationMs,
    servedFrom: inferServedFrom(result),
  });
  return attachFetchDiagnostics(result, trace, {
    servedFrom: inferServedFrom(result),
    fallbackReason: result?.staleReason || null,
    sectionFetchDurationMs: durationMs,
  });
}

function attachBudgetExitDiagnostics(section, result) {
  const budgetExit = consumeSectionsSnapshotBudgetExit(section);
  if (!budgetExit) return result;
  const trace = createFetchTrace({ datasetId: 'sections', section, fetchMode: 'hybrid' });
  markFetchPhase(trace, 'hybrid-snapshot-budget-exceeded', {
    elapsedMs: budgetExit.snapshotElapsedMs,
    budgetMs: budgetExit.snapshotBudgetMs,
    fallbackReason: budgetExit.fallbackReason,
  });
  return attachFetchDiagnostics(result, trace, {
    servedFrom: Array.isArray(result) && result.length > 0 ? SERVED_FROM.LIVE_FALLBACK : SERVED_FROM.EMPTY,
    fallbackReason: budgetExit.fallbackReason,
    snapshotBudgetExceeded: true,
    snapshotElapsedMs: budgetExit.snapshotElapsedMs,
    snapshotBudgetMs: budgetExit.snapshotBudgetMs,
  });
}

function summarizeSection(section, result) {
  const items = Array.isArray(result) ? result : [];
  const sectionItems = items.map(item => ({
    ...item,
    section: item.section || section,
    sourceSection: result?.prefetchSourceSection || item.sourceSection || section,
  }));
  return {
    section,
    ok: true,
    items: sectionItems,
    count: sectionItems.length,
    sourceCounts: countSources(sectionItems),
    health: result?.health || null,
    isSingleSource: Boolean(result?.isSingleSource),
    prefetched: Boolean(result?.prefetched),
    sourceSection: result?.prefetchSourceSection || section,
    staleReason: result?.staleReason || null,
    fetchDiagnostics: result?.fetchDiagnostics || null,
    sectionQuality: result?.sectionQuality || null,
    snapshotRuntimeSummary: result?.snapshotRuntimeSummary || null,
    duplicateHints: getDuplicateHints(sectionItems),
  };
}

function summarizeFailure(section, error) {
  return {
    section,
    ok: false,
    items: [],
    count: 0,
    error: error?.message || String(error),
    sourceCounts: {},
    health: null,
    isSingleSource: false,
    duplicateHints: [],
    fetchDiagnostics: null,
  };
}

function getEnvelopeSource(summaries) {
  if (summaries.some(summary => summary.prefetched)) return ENVELOPE_SOURCES.SNAPSHOT;
  return ENVELOPE_SOURCES.LIVE;
}

function getEnvelopeFreshness(summaries) {
  if (summaries.every(summary => summary.count === 0)) return ENVELOPE_FRESHNESS.EMPTY;
  if (summaries.some(summary => summary.staleReason)) return ENVELOPE_FRESHNESS.STALE;
  return ENVELOPE_FRESHNESS.FRESH;
}

function incrementCount(counts, key) {
  const label = key || 'unknown';
  counts[label] = (counts[label] || 0) + 1;
}

function getPerformanceSummary(summaries) {
  const servedFromCounts = {};
  const fallbackReasonCounts = {};
  let totalSectionFetchDurationMs = 0;
  let slowestSection = null;
  let snapshotBudgetExitCount = 0;
  summaries.forEach(summary => {
    const diagnostics = summary.fetchDiagnostics || {};
    const durationMs = Number(diagnostics.sectionFetchDurationMs ?? diagnostics.durationMs ?? 0);
    totalSectionFetchDurationMs += Math.max(0, durationMs);
    if (!slowestSection || durationMs > slowestSection.durationMs) {
      slowestSection = { section: summary.section, durationMs };
    }
    incrementCount(servedFromCounts, diagnostics.servedFrom || (summary.prefetched ? 'snapshot' : 'unknown'));
    if (diagnostics.fallbackReason) incrementCount(fallbackReasonCounts, diagnostics.fallbackReason);
    if (diagnostics.snapshotBudgetExceeded) snapshotBudgetExitCount += 1;
  });
  return {
    totalSectionFetchDurationMs,
    slowestSection,
    servedFromCounts,
    fallbackReasonCounts,
    snapshotBudgetExitCount,
  };
}

function getValidationWarnings(summaries) {
  return summaries
    .filter(summary => summary.staleReason || summary.isSingleSource || summary.fetchDiagnostics?.snapshotBudgetExceeded)
    .map(summary => ({
      section: summary.section,
      reason: summary.fetchDiagnostics?.fallbackReason || summary.staleReason || 'single_source_section',
      severity: summary.staleReason || summary.fetchDiagnostics?.snapshotBudgetExceeded ? 'warn' : 'info',
    }));
}

export async function load(options = {}) {
  const diagnostics = [];
  const settings = safeGetSettings();
  const sections = getRequestedSections(settings, options, diagnostics);
  const settled = await Promise.allSettled(sections.map(async section => {
    const limit = getSectionLimit(settings, section);
    const startedAt = Date.now();
    const result = await fetchSectionNews(section, limit, settings.newsSources);
    const durationMs = Date.now() - startedAt;
    const withBudgetDiagnostics = attachBudgetExitDiagnostics(section, result);
    return summarizeSection(section, ensureSectionDiagnostics(section, withBudgetDiagnostics, durationMs));
  }));
  const summaries = settled.map((entry, index) => {
    if (entry.status === 'fulfilled') return entry.value;
    return summarizeFailure(sections[index], entry.reason);
  });
  const failed = summaries.filter(summary => !summary.ok);
  const sectionItems = Object.fromEntries(summaries.map(summary => [summary.section, summary.items]));
  const allItems = summaries.flatMap(summary => summary.items);
  const dedupedItems = deduplicateAndCluster(allItems, settings.storyDeduplication || 0.75);
  const frontPage = composeBalancedFeed(dedupedItems, options.frontPageLimit || 20, settings.maxTopicPercent || 40, settings.maxGeoPercent || 30);
  const envelope = makeEnvelope({
    datasetId: 'sections',
    ok: summaries.some(summary => summary.ok),
    source: getEnvelopeSource(summaries),
    freshness: getEnvelopeFreshness(summaries),
    data: {
      sections: sectionItems,
      frontPage,
      summaries,
      performanceSummary: getPerformanceSummary(summaries),
      loadedSections: sections,
      failedSections: failed.map(summary => ({ section: summary.section, error: summary.error })),
      duplicateHints: getDuplicateHints(dedupedItems),
    },
    diagnostics,
    validation: {
      passed: failed.length === 0,
      warnings: getValidationWarnings(summaries),
      errors: failed.map(summary => summary.error),
    },
  });
  return applyDatasetSlo(envelope, { maxAgeMs: options.maxAgeMs, minScore: options.minScore });
}
