import {
  makeEnvelope,
  ENVELOPE_SOURCES,
  ENVELOPE_FRESHNESS,
} from '../dataEnvelope.js';
import { applyDatasetSlo } from '../slo/applyDatasetSlo.js';
import { fetchSectionNews, filterEligibleSectionItems } from '../../services/rssAggregator.js';
import { getSettings } from '../../utils/storage.js';
import { deduplicateAndCluster } from '../../utils/similarity.js';
import { expandNewsEvidenceRows } from '../../services/newsClusterEvidence.js';
import {
  consumeSectionsSnapshotBudgetExit,
  getSectionsSnapshotRuntimeSummary,
  loadSectionsSnapshot,
  selectPrefetchedSectionItems,
} from '../../adapters/sectionsSnapshotFetcher.js';
import { rankTopStories } from '../../services/topStories/topStoriesRanker.js';
import { getAgeBand } from '../../services/topStories/topStoriesEvidenceAdmission.js';
import { getTopStoriesPolicy } from '../../services/topStories/topStoriesPolicy.js';
import { getAgeHours, getTimestampConfidence } from '../../services/topStories/topStoriesSignals.js';
import { removeRegionalSectionOverlap } from '../../services/regionalSectionPolicy.js';
import { checkSingleSource, getSectionHealth } from '../../utils/sectionHealth.js';
import { expandTopFeedEvidenceRows } from '../../services/topStories/topStoriesTopFeedSignals.js';
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
const SECTION_RANKING_LIMIT = 30;

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
  const count = settings?.sections?.[section]?.count;
  return Math.min(SECTION_RANKING_LIMIT, Number.isInteger(count) && count > 0 ? count + 5 : 10);
}

function getTopFeedSnapshotRows(options = {}) {
  return expandTopFeedEvidenceRows(options.topFeedItems || options.topFeedSnapshot || []);
}

function isSnapshotLane(summary) {
  return summary.prefetched || summary.items.some(item => item._prefetchedSection);
}

function snapshotEpoch(runtime) {
  const authority = runtime?.dataSource?.effective;
  const epoch = runtime?.preview?.epochId || runtime?.fetchedAt;
  return authority && runtime?.contentHash && epoch ? JSON.stringify([authority, runtime.contentHash, epoch]) : null;
}

function selectRankingLanes(summaries, diagnostics) {
  const snapshotLanes = summaries.filter(summary => summary.items.length && isSnapshotLane(summary));
  const qualified = snapshotLanes.filter(summary =>
    !summary.staleReason && !summary.snapshotRuntimeSummary?.stale && snapshotEpoch(summary.snapshotRuntimeSummary));
  qualified.sort((a, b) => (b.snapshotRuntimeSummary.fetchedAt || 0) - (a.snapshotRuntimeSummary.fetchedAt || 0));
  const epoch = snapshotEpoch(qualified[0]?.snapshotRuntimeSummary);
  const knownLanes = new Set(qualified.filter(summary => snapshotEpoch(summary.snapshotRuntimeSummary) === epoch));
  const excluded = snapshotLanes.filter(summary => !knownLanes.has(summary));
  if (excluded.length) {
    diagnostics.push({
      event: 'sectionsDataset.top_stories_snapshot_lane_excluded',
      severity: 'warn',
      message: 'Top Stories excluded stale or incompatible snapshot sections.',
      details: { excludedSections: excluded.map(summary => summary.section) },
    });
  }
  return { epoch, lanes: summaries.filter(summary => !isSnapshotLane(summary) || knownLanes.has(summary)) };
}

async function getSnapshotRankingPool(epoch, diagnostics, settings) {
  // Widget limits must not decide which headlines the Top Stories ranker sees.
  // Reuse the snapshot already fetched by the sections, retaining its epoch and
  // freshness rules, rather than acquiring another set of browser RSS feeds.
  if (!epoch) return { items: [], topFeedItems: [] };
  try {
    const snapshot = await loadSectionsSnapshot();
    const runtime = getSectionsSnapshotRuntimeSummary(snapshot);
    if (runtime.stale || snapshotEpoch(runtime) !== epoch) {
      return { items: [], topFeedItems: [] };
    }
    const selected = Object.entries(snapshot.sections || {}).map(([section, items]) => ({
      section,
      ...selectPrefetchedSectionItems(snapshot, section, Array.isArray(items) ? items.length : 0),
    })).filter(section => !section.staleFallback).map(section => ({
      ...section,
      items: filterEligibleSectionItems(section.items, section.section, settings, settings.newsSources),
    }));
    return {
      items: selected.flatMap(section => section.items),
      topFeedItems: selected.find(section => section.section === 'topStories')?.items || [],
    };
  } catch (error) {
    diagnostics.push({
      event: 'sectionsDataset.top_stories_pool_unavailable',
      severity: 'warn',
      message: error?.message || String(error),
    });
    return { items: [], topFeedItems: [] };
  }
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
    delivery: result?.delivery || null,
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
  const epochs = summaries.filter(summary => summary.items.length && isSnapshotLane(summary))
    .map(summary => snapshotEpoch(summary.snapshotRuntimeSummary));
  if (epochs.includes(null) || new Set(epochs).size > 1) return ENVELOPE_FRESHNESS.STALE;
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
  const snapshotLanes = summaries.filter(summary => summary.items.length && isSnapshotLane(summary));
  const epochs = snapshotLanes.map(summary => snapshotEpoch(summary.snapshotRuntimeSummary));
  if (epochs.includes(null) || new Set(epochs).size > 1) {
    return {
      effective: epochs.includes(null) ? 'unknown' : 'mixed_snapshot',
      requested: null,
      fallback: true,
      fallbackReason: 'incompatible_snapshot_lanes',
      epochId: null, contentHash: null, fetchedAt: null, ageMs: null,
      stale: true,
    };
  }
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

export async function load(options = {}) {
  const diagnostics = [];
  const settings = safeGetSettings();
  const sections = getRequestedSections(settings, options, diagnostics);
  const settled = await Promise.allSettled(sections.map(async section => {
    const startedAt = Date.now();
    const result = await fetchSectionNews(section, SECTION_RANKING_LIMIT, settings.newsSources, {
      force: Boolean(options.forceRefresh),
    });
    const durationMs = Date.now() - startedAt;
    const withBudgetDiagnostics = attachBudgetExitDiagnostics(section, result);
    return summarizeSection(section, ensureSectionDiagnostics(section, withBudgetDiagnostics, durationMs));
  }));
  const fetchedSummaries = settled.map((entry, index) => {
    if (entry.status === 'fulfilled') return entry.value;
    return summarizeFailure(sections[index], entry.reason);
  });
  const bySection = new Map(fetchedSummaries.map(summary => [summary.section, summary.items]));
  const tamilNaduItems = [...(bySection.get('chennai') || []), ...(bySection.get('tn') || [])];
  const summaries = fetchedSummaries.map(summary => {
    const counterpart = summary.section === 'india' ? tamilNaduItems : bySection.get('india');
    const items = removeRegionalSectionOverlap(summary.items, summary.section, counterpart)
      .slice(0, getSectionLimit(settings, summary.section));
    if (items.length === summary.count) return summary;
    return {
      ...summary,
      items,
      count: items.length,
      sourceCounts: countSources(items),
      health: getSectionHealth(summary.section, items.length),
      isSingleSource: checkSingleSource(items),
      duplicateHints: getDuplicateHints(items),
    };
  });
  const failed = summaries.filter(summary => !summary.ok);
  const sectionItems = Object.fromEntries(summaries.map(summary => [summary.section, summary.items]));
  const { epoch, lanes } = selectRankingLanes(fetchedSummaries, diagnostics);
  const allItems = lanes.flatMap(summary =>
    filterEligibleSectionItems(summary.items, summary.section, settings, settings.newsSources));
  const rankingPool = await getSnapshotRankingPool(epoch, diagnostics, settings);
  const topFeedRows = filterEligibleSectionItems(getTopFeedSnapshotRows({
    topFeedItems: [...rankingPool.topFeedItems, ...(options.topFeedItems || options.topFeedSnapshot || [])],
  }), 'topStories', settings, settings.newsSources);
  const nowMs = Date.now();
  const policy = getTopStoriesPolicy();
  const timeEligibleItems = [...expandNewsEvidenceRows([...allItems, ...rankingPool.items]), ...topFeedRows].filter(item => {
    const ageBand = getAgeBand({ ageHours: getAgeHours(item, nowMs), timestampConfidence: getTimestampConfidence(item, nowMs) }, policy);
    return ageBand !== 'expired' && ageBand !== 'rejected';
  });
  // An expired, previously scored widget must not become the representative
  // of a fresh update and make the whole event fail Top Stories admission.
  const dedupeOptions = settings.storyDeduplication ?? {};
  const dedupedItems = deduplicateAndCluster(timeEligibleItems, {
    ...(typeof dedupeOptions === 'number' ? { similarityThreshold: dedupeOptions } : dedupeOptions),
    freshnessFirst: true,
  });
  const eligibleRows = new Set(timeEligibleItems);
  const topFeedEvidence = topFeedRows.filter(item => eligibleRows.has(item));
  // The dedicated feed contributes evidence to the representative, never an extra candidate.
  const frontPage = rankTopStories({
    sectionItems: { __all: dedupedItems },
    topFeedEvidence,
    settings,
    nowMs,
  }, { limit: options.frontPageLimit || 25 });
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
      warnings: getValidationWarnings(summaries),
      errors: failed.map(summary => summary.error),
    },
  });
  return applyDatasetSlo(envelope, { maxAgeMs: options.maxAgeMs, minScore: options.minScore });
}
