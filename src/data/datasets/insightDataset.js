import {
  makeEnvelope,
  ENVELOPE_SOURCES,
  ENVELOPE_FRESHNESS,
} from '../dataEnvelope.js';
import { applyDatasetSlo } from '../slo/applyDatasetSlo.js';
import {
  createInsightFetcher,
  runInsightPipeline,
  DEFAULT_CONFIG,
} from '../../adapters/insightFetcher.js';
import { repairInsightResult } from '../../insight/src/diagnostics/insightResultRepair.ts';
import { recoverInsightRuntimeQuality } from '../../insight/src/diagnostics/insightRuntimeQualityGate.ts';

// Expensive dataset. Do not call from mainDataset unless includeInsight=true.

function getSource(source) {
  if (source === 'snapshot' || source === 'stale-snapshot') return ENVELOPE_SOURCES.SNAPSHOT;
  if (source === 'unavailable') return ENVELOPE_SOURCES.FAILED;
  return ENVELOPE_SOURCES.LIVE;
}

function formatInsightAge(timestamp) {
  if (!timestamp) return 'unknown age';

  const ageMs = Date.now() - Number(timestamp);
  if (!Number.isFinite(ageMs) || ageMs < 0) return 'unknown age';

  const hours = Math.max(0, Math.round(ageMs / (60 * 60 * 1000)));
  return `${hours}h ago`;
}

function getStaleLabel(source, timestamp) {
  if ((source === 'snapshot' || source === 'stale-snapshot') && timestamp) {
    return `Pre-generated · ${formatInsightAge(timestamp)}`;
  }

  return null;
}

function getInsightStoryRows(insight) {
  if (insight?.storiesById instanceof Map) {
    return [...insight.storiesById.values()];
  }

  if (insight?.storiesById && typeof insight.storiesById === 'object') {
    return Object.values(insight.storiesById);
  }

  if (Array.isArray(insight?.stories)) return insight.stories;

  return [];
}

function summarizeInsight(insight) {
  const stories = getInsightStoryRows(insight);
  const parents = Array.isArray(insight?.parents) ? insight.parents : [];
  const sourceGroups = new Set();

  stories.forEach(story => {
    const source = story?.sourceGroup || story?.source || story?.primarySource;
    if (source) sourceGroups.add(source);
  });

  const storyCount = stories.length > 0
    ? stories.length
    : Number(insight?.storyCount || 0);

  return {
    storyCount,
    sourceGroupCount: Number(insight?.sourceGroupCount || sourceGroups.size || 0),
    usableParentCount: Number(
      insight?.usableParentCount ||
      insight?.usableParents ||
      parents.length ||
      0
    ),
  };
}

export async function load() {
  const diagnostics = [];

  try {
    const fetcherInfo = await createInsightFetcher();

    diagnostics.push({
      event: 'insightDataset.fetcher_created',
      severity: fetcherInfo.source === 'unavailable' ? 'warn' : 'info',
      message: `Insight fetcher source: ${fetcherInfo.source}`,
      details: {
        source: fetcherInfo.source,
        snapshotTs: fetcherInfo.snapshotTs,
        contentHash: fetcherInfo.contentHash,
      },
    });

    const cfg = fetcherInfo.pipelineConfigOverrides
      ? { ...DEFAULT_CONFIG, ...fetcherInfo.pipelineConfigOverrides }
      : DEFAULT_CONFIG;

    const rawInsight = await runInsightPipeline(fetcherInfo.fetcher, cfg);
    const runtimeQuality = recoverInsightRuntimeQuality(
      repairInsightResult(rawInsight),
      fetcherInfo.source,
      cfg
    );
    const insight = runtimeQuality.result;
    const quality = summarizeInsight(insight);
    const staleLabel = getStaleLabel(fetcherInfo.source, fetcherInfo.snapshotTs);

    diagnostics.push({
      event: 'insightDataset.runtime_quality_gate',
      severity: runtimeQuality.gate?.attempted && !runtimeQuality.gate?.recovered ? 'warn' : 'info',
      message: runtimeQuality.gate?.reason || 'Insight runtime quality evaluated',
      details: {
        attempted: Boolean(runtimeQuality.gate?.attempted),
        recovered: Boolean(runtimeQuality.gate?.recovered),
        beforeGrade: runtimeQuality.gate?.before?.grade || null,
        afterGrade: runtimeQuality.gate?.after?.grade || null,
      },
    });

    const ok = Boolean(insight) && quality.storyCount > 0;

    const envelope = makeEnvelope({
      ok,
      datasetId: 'insight',
      data: {
        insight,
        quality,
        source: fetcherInfo.source,
        staleLabel,
        repairState: {
          preserved: true,
          note: 'Release 5A wraps the existing insight fetcher/pipeline. Page-level repair flow is preserved for 5G migration.',
        },
        raw: {
          fetcherInfo,
          cfg,
        },
      },
      source: getSource(fetcherInfo.source),
      freshness: fetcherInfo.source === 'stale-snapshot'
        ? ENVELOPE_FRESHNESS.STALE
        : ok
          ? ENVELOPE_FRESHNESS.FRESH
          : ENVELOPE_FRESHNESS.EMPTY,
      error: ok ? null : 'insight unavailable',
      validation: {
        passed: ok,
        errors: ok ? [] : ['insight_unavailable'],
        warnings: [
          fetcherInfo.source === 'stale-snapshot' ? 'insight_stale_snapshot' : null,
          fetcherInfo.source === 'unavailable' ? 'insight_snapshot_unavailable' : null,
          runtimeQuality.gate?.attempted && !runtimeQuality.gate?.recovered
            ? 'insight_runtime_quality_degraded'
            : null,
        ].filter(Boolean),
      },
      diagnostics,
    });

    return applyDatasetSlo(envelope);
  } catch (error) {
    const message = error?.message || String(error);

    return applyDatasetSlo(makeEnvelope({
      ok: false,
      datasetId: 'insight',
      data: {
        insight: null,
        quality: {
          storyCount: 0,
          sourceGroupCount: 0,
          usableParentCount: 0,
        },
        source: 'failed',
        staleLabel: null,
        repairState: {
          preserved: true,
          error: message,
        },
        raw: null,
      },
      source: ENVELOPE_SOURCES.FAILED,
      freshness: ENVELOPE_FRESHNESS.UNKNOWN,
      error: message,
      validation: {
        passed: false,
        errors: ['insight_dataset_failed', message],
        warnings: [],
      },
      diagnostics: [
        ...diagnostics,
        {
          event: 'insightDataset.failed',
          severity: 'error',
          message,
        },
      ],
    }));
  }
}

export const __insightDatasetInternalsForTest = {
  formatInsightAge,
  getStaleLabel,
  getInsightStoryRows,
  summarizeInsight,
};
