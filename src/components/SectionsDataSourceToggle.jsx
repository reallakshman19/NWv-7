import React, { useCallback, useEffect, useState } from 'react';
import { clearSectionsSnapshotCache } from '../adapters/sectionsSnapshotFetcher.js';
import { clearEnvelopeCache } from '../data/orchestrator/useDataset.js';
import { clearNewsCache } from '../services/rssAggregator.js';
import {
  getSectionsDataSource,
  getSectionsDataSourceRuntimeStatus,
  isCloudflareSectionsPreviewConfigured,
  SECTIONS_DATA_SOURCES,
  SECTIONS_DATA_SOURCE_STATUS_EVENT,
  setSectionsDataSource,
} from '../utils/sectionsDataSource.js';

function readableFallbackReason(value) {
  const reason = String(value || '').trim();
  if (!reason) return 'unknown reason';
  if (reason === 'preview_snapshot_unusable') return 'preview snapshot stale/incomplete';
  if (reason === 'snapshot-budget-exceeded') return 'preview request timed out';
  if (reason === 'preview_not_configured') return 'preview not configured';
  if (/HTTP\s+503/i.test(reason)) return 'preview service unavailable';
  return reason.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function statusCopy(source, runtimeStatus, previewConfigured) {
  if (source === SECTIONS_DATA_SOURCES.GITHUB) return 'Current production source';
  if (!previewConfigured) return 'Preview endpoint is not configured';
  if (runtimeStatus?.fallback) {
    return `Cloudflare fallback · ${readableFallbackReason(runtimeStatus.fallbackReason)} · showing GitHub`;
  }
  if (runtimeStatus?.effective === SECTIONS_DATA_SOURCES.CLOUDFLARE_PREVIEW) {
    return 'Cloudflare Preview active · committed data only';
  }
  return 'Preview selected · GitHub fallback stays on';
}

export default function SectionsDataSourceToggle() {
  const [source, setSource] = useState(getSectionsDataSource);
  const [runtimeStatus, setRuntimeStatus] = useState(getSectionsDataSourceRuntimeStatus);
  const previewConfigured = isCloudflareSectionsPreviewConfigured();

  useEffect(() => {
    const handleStatus = event => setRuntimeStatus(event.detail || null);
    window.addEventListener(SECTIONS_DATA_SOURCE_STATUS_EVENT, handleStatus);
    return () => window.removeEventListener(SECTIONS_DATA_SOURCE_STATUS_EVENT, handleStatus);
  }, []);

  const choose = useCallback((nextSource) => {
    if (nextSource === source) return;
    if (nextSource === SECTIONS_DATA_SOURCES.CLOUDFLARE_PREVIEW && !previewConfigured) return;
    const saved = setSectionsDataSource(nextSource);
    setSource(saved);
    clearSectionsSnapshotCache();
    clearEnvelopeCache();
    clearNewsCache();
    window.location.reload();
  }, [previewConfigured, source]);

  const cloudflareSelected = source === SECTIONS_DATA_SOURCES.CLOUDFLARE_PREVIEW;

  return (
    <section className="sections-source-control" aria-label="Sections data source">
      <div className="sections-source-control__label">
        <span>Sections source</span>
        <small aria-live="polite">{statusCopy(source, runtimeStatus, previewConfigured)}</small>
      </div>
      <div className="sections-source-control__toggle" role="group" aria-label="Choose Sections data source">
        <button
          type="button"
          className={`sections-source-control__button${!cloudflareSelected ? ' sections-source-control__button--active' : ''}`}
          onClick={() => choose(SECTIONS_DATA_SOURCES.GITHUB)}
          aria-pressed={!cloudflareSelected}
        >
          GitHub
        </button>
        <button
          type="button"
          className={`sections-source-control__button${cloudflareSelected ? ' sections-source-control__button--active sections-source-control__button--preview' : ''}`}
          onClick={() => choose(SECTIONS_DATA_SOURCES.CLOUDFLARE_PREVIEW)}
          aria-pressed={cloudflareSelected}
          disabled={!previewConfigured}
          title={previewConfigured
            ? 'Use the independently acquired Cloudflare snapshot; GitHub remains the automatic fallback'
            : 'Cloudflare Preview is not configured for this build'}
        >
          Cloudflare <span>(Preview)</span>
        </button>
      </div>
    </section>
  );
}
