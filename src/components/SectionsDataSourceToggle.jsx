import React, { useCallback, useEffect, useState } from 'react';
import { clearSectionsSnapshotCache } from '../adapters/sectionsSnapshotFetcher.js';
import { clearEnvelopeCache } from '../data/orchestrator/useDataset.js';
import { clearNewsCache } from '../services/rssAggregator.js';
import { statusCopy } from './sectionsStatusCopy.js';
import {
  getSectionsDataSource,
  getSectionsDataSourceRuntimeStatus,
  isCloudflareSectionsPreviewConfigured,
  isSectionsSourceOverrideEnabled,
  SECTIONS_DATA_SOURCES,
  SECTIONS_DATA_SOURCE_STATUS_EVENT,
  setSectionsDataSource,
} from '../utils/sectionsDataSource.js';


export default function SectionsDataSourceToggle() {
  const [source, setSource] = useState(getSectionsDataSource);
  const [runtimeStatus, setRuntimeStatus] = useState(getSectionsDataSourceRuntimeStatus);
  const previewConfigured = isCloudflareSectionsPreviewConfigured();
  const overrideEnabled = isSectionsSourceOverrideEnabled();

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

  if (!overrideEnabled) {
    return (
      <section className="sections-source-control" aria-label="Sections data authority">
        <div className="sections-source-control__label">
          <span>Sections authority</span>
          <small aria-live="polite">{statusCopy(source, runtimeStatus, previewConfigured)}</small>
        </div>
      </section>
    );
  }

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
