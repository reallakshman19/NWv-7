import {
  makeEnvelope,
  ENVELOPE_SOURCES,
  ENVELOPE_FRESHNESS,
} from '../dataEnvelope.js';
import { applyDatasetSlo } from '../slo/applyDatasetSlo.js';
import { fetchSectionNews } from '../../services/rssSectionLifecycleFetcher.js';
import { composeBalancedFeed } from '../../services/frontPageComposer.js';
import { getSettings } from '../../utils/storage.js';
import { deduplicateAndCluster } from '../../utils/similarity.js';

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
      details: {
        requestedCount: rawSections.length,
        maxSections,
        requestedSections: rawSections,
        loadedSections: boundedSections,
      },
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

function getValidationWarnings(summaries) {
  return summaries
    .filter(summary => summary.staleReason || summary.isSingleSource)
    .map(summary => ({
      section: summary.section,
      reason: summary.staleReason || 'single_source_section',
      severity: summary.staleReason ? 'warn' : 'info',
    }));
}

export const sectionsDataset = {
  id: 'sections',
  description: 'Section news dataset with snapshot-first Hybrid support',

  async load(options = {}) {
    const diagnostics = [];
    const settings = safeGetSettings();
    const sections = getRequestedSections(settings, options, diagnostics);

    const settled = await Promise.allSettled(sections.map(async section => {
      const limit = getSectionLimit(settings, section);
      const result = await fetchSectionNews(section, limit, settings.newsSources);
      return summarizeSection(section, result);
    }));

    const summaries = settled.map((entry, index) => {
      if (entry.status === 'fulfilled') return entry.value;
      return summarizeFailure(sections[index], entry.reason);
    });

    const fulfilled = summaries.filter(summary => summary.ok);
    const failed = summaries.filter(summary => !summary.ok);
    const sectionItems = Object.fromEntries(summaries.map(summary => [summary.section, summary.items]));
    const allItems = summaries.flatMap(summary => summary.items);
    const dedupedItems = deduplicateAndCluster(allItems, settings.storyDeduplication || 0.75);
    const frontPage = composeBalancedFeed(
      dedupedItems,
      options.frontPageLimit || 20,
      settings.maxTopicPercent || 40,
      settings.maxGeoPercent || 30
    );

    const payload = {
      sections: sectionItems,
      frontPage,
      summaries,
      loadedSections: sections,
      failedSections: failed.map(summary => ({ section: summary.section, error: summary.error })),
      duplicateHints: getDuplicateHints(dedupedItems),
    };

    const envelope = makeEnvelope({
      datasetId: 'sections',
      ok: fulfilled.length > 0,
      source: getEnvelopeSource(summaries),
      freshness: getEnvelopeFreshness(summaries),
      data: payload,
      diagnostics,
      validation: {
        passed: failed.length === 0,
        warnings: getValidationWarnings(summaries),
        errors: failed.map(summary => summary.error),
      },
    });

    return applyDatasetSlo(envelope, {
      maxAgeMs: options.maxAgeMs,
      minScore: options.minScore,
    });
  },
};
