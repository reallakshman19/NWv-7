import {
  makeEnvelope,
  ENVELOPE_SOURCES,
  ENVELOPE_FRESHNESS,
} from '../dataEnvelope.js';
import { applyDatasetSlo } from '../slo/applyDatasetSlo.js';
import { fetchSectionNews } from '../../services/rssAggregator.js';
import { getSettings } from '../../utils/storage.js';
import { consumeSectionsSnapshotBudgetExit } from '../../adapters/sectionsSnapshotFetcher.js';
import { rankTopStories } from '../../services/topStories/topStoriesRanker.js';
import {
  buildTopStoriesRankingSections as makeTopStoriesRankingSections,
} from '../../services/topStories/topStoriesPopulation.js';
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

export function getTopStoriesCandidateLimit(displayLimit) {
  const limit = Math.max(1, Number(displayLimit || 1));
  return Math.max(30, limit * 3);
}

export function getTopStoriesAcquisitionSections(sections = []) {
  const visible = Array.isArray(sections) ? sections.filter(Boolean) : [];
  return visible.includes('topStories')
    ? [...visible]
    : ['topStories', ...visible];
}

export function getVisibleSectionSummaries(allSummaries = [], sections = []) {
  const visible = new Set(Array.isArray(sections) ? sections : []);
  return (Array.isArray(allSummaries) ? allSummaries : [])
    .filter(summary => visible.has(summary?.section));
}

/** A hidden Top Stories evidence lane must never expand the ranker candidate pool. */
export function getTopStoriesRankingCandidateRows(allSummaries = [], sections = []) {
  return getVisibleSectionSummaries(allSummaries, sections)
    .filter(summary => summary.section !== 'topStories')
    .flatMap(summary => (
      Array.isArray(summary.candidateItems) ? summary.candidateItems : summary.items || []
    ));
}

export function getTopFeedSnapshotRows(options = {}, summaries = []) {
  // Keep publisher-level source rows intact here. buildTopFeedSignalMap()
  // normalizes exactly once inside the ranker. Premature normalization would
  // collapse the original publisher rows into a single aggregate and erase
  // independent-source corroboration on the second normalization pass.
  const explicit = options.topFeedItems || options.topFeedSnapshot || [];
  if (Array.isArray(explicit) && explicit.length > 0) {
    return [...explicit];
  }

  const topStoriesSummary = (summaries || []).find(summary => summary?.section === 'topStories');
  const authorityRows = Array.isArray(topStoriesSummary?.candidateItems)
    ? topStoriesSummary.candidateItems
    : Array.isArray(topStoriesSummary?.items)
      ? topStoriesSummary.items
      : [];
  return [...authorityRows];
}

export function buildTopStoriesRankingSections(items = [], dedupeOptions = 0.75) {
  return makeTopStoriesRankingSections(items, dedupeOptions);
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

export function summarizeSection(section, result, displayLimit = null) {
  const items = Array.isArray(result) ? result : [];
  const candidateItems = items.map(item => ({
    ...item,
    section: item.section || section,
    sourceSection: result?.prefetchSourceSection || item.sourceSection || section,
  }));
  const boundedDisplayLimit = displayLimit != null && Number.isFinite(Number(displayLimit))
    ? Math.max(0, Math.floor(Number(displayLimit)))
    : candidateItems.length;
  const sectionItems = candidateItems.slice(0, boundedDisplayLimit);
  return {
    section,
    ok: true,
    items: sectionItems,
    candidateItems,
    count: sectionItems.length,
    candidateCount: candidateItems.length,
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


function getAuthoritySummary(summaries) {
  const snapshotSummary = summaries
    .map(summary => summary.snapshotRuntimeSummary)
    .find(Boolean) || null;
  if (!snapshotSummary) {
    return {
      effective: 'live_rss',
      requested: 'live_rss',
      fallback: false,
      fallbackReason: null,
      epochId: null,
      contentHash: null,
      fetchedAt: null,
      ageMs: null,
      stale: false,
    };
  }
  const dataSource = snapshotSummary.dataSource || {};
  return {
    effective: dataSource.effective || 'github_static',
    requested: dataSource.requested || dataSource.effective || 'github_static',
    fallback: Boolean(dataSource.fallback),
    fallbackReason: dataSource.fallbackReason || null,
    epochId: snapshotSummary.preview?.epochId || null,
    contentHash: snapshotSummary.contentHash || null,
    fetchedAt: snapshotSummary.fetchedAt || null,
    ageMs: snapshotSummary.ageMs ?? null,
    stale: Boolean(snapshotSummary.stale),
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

export function getTopStoriesEvidenceWarning(summary) {
  if (summary?.ok && summary.count > 0 && !summary.staleReason) return null;
  return {
    section: 'topStories',
    reason: !summary?.ok
      ? 'top_stories_evidence_fetch_failed'
      : summary.staleReason || 'top_stories_evidence_empty',
    severity: 'warn',
  };
}

export async function load(options = {}) {
  const diagnostics = [];
  const settings = safeGetSettings();
  const sections = getRequestedSections(settings, options, diagnostics);
  const acquisitionSections = getTopStoriesAcquisitionSections(sections);

  const settled = await Promise.allSettled(acquisitionSections.map(async section => {
    const displayLimit = getSectionLimit(settings, section);
    const candidateLimit = getTopStoriesCandidateLimit(displayLimit);
    const startedAt = Date.now();
    const result = await fetchSectionNews(section, candidateLimit, settings.newsSources, {
      force: Boolean(options.forceRefresh),
    });
    const durationMs = Date.now() - startedAt;
    const withBudgetDiagnostics = attachBudgetExitDiagnostics(section, result);
    return summarizeSection(
      section,
      ensureSectionDiagnostics(section, withBudgetDiagnostics, durationMs),
      displayLimit,
    );
  }));

  const allSummaries = settled.map((entry, index) => {
    if (entry.status === 'fulfilled') return entry.value;
    return summarizeFailure(acquisitionSections[index], entry.reason);
  });
  const summaries = getVisibleSectionSummaries(allSummaries, sections);
  const topStoriesEvidenceSummary = allSummaries.find(summary => summary.section === 'topStories');
  const topStoriesEvidenceWarning = getTopStoriesEvidenceWarning(topStoriesEvidenceSummary);

  if (topStoriesEvidenceWarning) {
    diagnostics.push({
      event: 'sectionsDataset.top_stories_evidence_degraded',
      severity: 'warn',
      message: 'Top Stories evidence lane is unavailable or degraded; ranking continues from cross-section candidates.',
      details: {
        ok: Boolean(topStoriesEvidenceSummary.ok),
        count: Number(topStoriesEvidenceSummary.count || 0),
        candidateCount: Number(topStoriesEvidenceSummary.candidateCount || 0),
        staleReason: topStoriesEvidenceSummary.staleReason || null,
        error: topStoriesEvidenceSummary.error || null,
      },
    });
  }

  const failed = summaries.filter(summary => !summary.ok);
  const topFeedItems = getTopFeedSnapshotRows(options, allSummaries);
  const sectionItems = Object.fromEntries(summaries.map(summary => [summary.section, summary.items]));
  const allItems = getTopStoriesRankingCandidateRows(allSummaries, sections);
  // Top Stories ranks only neutral-impact cross-section cluster representatives.
  // Mixing raw section rows and representatives lets a duplicated event re-enter
  // the rail under multiple publisher-specific ids.
  const rankedSections = buildTopStoriesRankingSections(
    allItems,
    settings.storyDeduplication || 0.75,
  );
  const dedupedItems = rankedSections.__all;
  const frontPage = rankTopStories(
    {
      sectionItems: rankedSections,
      topFeedSignalItems: topFeedItems,
      settings,
      nowMs: Date.now(),
    },
    { limit: options.frontPageLimit || 25 },
  );
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
      authority: getAuthoritySummary(summaries),
      loadedSections: sections,
      failedSections: failed.map(summary => ({ section: summary.section, error: summary.error })),
      duplicateHints: getDuplicateHints(dedupedItems),
    },
    diagnostics,
    validation: {
      passed: failed.length === 0,
      warnings: [
        ...getValidationWarnings(summaries),
        ...(topStoriesEvidenceWarning ? [topStoriesEvidenceWarning] : []),
      ],
      errors: failed.map(summary => summary.error),
    },
  });
  return applyDatasetSlo(envelope, { maxAgeMs: options.maxAgeMs, minScore: options.minScore });
}
