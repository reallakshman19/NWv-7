/**
 * NWv7 Market Desk R2.1 - WP-09 Source Health & Rights Card
 *
 * Displays live passive audit of the registered sources in sourceRegistry.js.
 * Strictly separates legal rights from reachability (UNKNOWN) and request state.
 */

import React, { useSyncExternalStore } from 'react';
import { healthStore } from './healthStore.js';

export function SourceHealthCard({ sourceStates = null }) {
  const health = useSyncExternalStore(healthStore.subscribe, healthStore.getSnapshot);
  const sources = Object.values(sourceStates || health.sourceStates || {});

  const getStatusBadge = (source) => {
    if (source.rights === 'NO_PUBLICATION') {
      return <span className="health-badge badge-restricted" title="Licensing review pending; publication disabled">NO PUBLICATION</span>;
    }
    if (source.accessMode === 'OFFICIAL_LINK') {
      return <span className="health-badge badge-link" title="Navigation link only; zero price redistribution">OFFICIAL LINK</span>;
    }
    if (source.accessMode === 'PROVIDER_EMBED') {
      return <span className="health-badge badge-embed" title="Third-party provider visual embed; no extraction">PROVIDER EMBED</span>;
    }
    if (source.lastResult === 'REQUEST_FAILED') {
      return <span className="health-badge badge-danger" title="Latest request failed; original observation date is retained">LAST CHECK FAILED</span>;
    }
    if (source.observationStatus === 'READY') {
      return <span className="health-badge badge-success">RECORDED</span>;
    }
    if (source.observationStatus === 'HISTORICAL') {
      return <span className="health-badge badge-warning">HISTORICAL</span>;
    }
    if (source.observationStatus === 'FAILED' || source.lastResult === 'REQUEST_FAILED') {
      return <span className="health-badge badge-danger">FAILED</span>;
    }
    return <span className="health-badge badge-neutral">NOT REQUESTED</span>;
  };

  return (
    <div className="health-section">
      <div className="health-section-header">
        <div>
          <h3 className="health-section-title">Registered Market Sources ({sources.length} Total)</h3>
          <p className="health-section-desc">
            Local request history and original provider dates. No automatic source polling or live-reachability assertion.
          </p>
        </div>
      </div>

      <div className="source-grid" role="region" aria-label="Market Data Sources">
        {sources.map((src) => (
          <div key={src.sourceId} className="source-card" data-testid={`source-card-${src.sourceId}`}>
            <div className="source-card-top">
              <span className="source-publisher">{src.publisher}</span>
              {getStatusBadge(src)}
            </div>

            <div className="source-id-line">
              <code className="source-id">{src.sourceId}</code>
              <span className="source-mode">{src.accessMode}</span>
            </div>

            <div className="source-details-table">
              <div className="detail-row">
                <span className="detail-label">Legal Rights:</span>
                <span className="detail-value">{src.rights}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Observation Date:</span>
                <span className="detail-value">{src.providerAsOf || '—'}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Last Request Result:</span>
                <span className="detail-value">{src.lastResult || 'UNKNOWN'}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Last Checked:</span>
                <span className="detail-value">{src.lastChecked ? new Date(src.lastChecked).toLocaleTimeString() : '—'}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Live Reachability:</span>
                <span className="detail-value reachability-unknown" title="Passive desk executes zero polling on boot">
                  {src.currentReachability}
                </span>
              </div>
            </div>

            {src.officialUrl && (
              <div className="source-card-footer">
                <a
                  href={src.officialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="source-official-link"
                  title="Open official publisher destination"
                >
                  Official Destination ↗
                </a>
              </div>
            )}

            {src.policyNotes && (
              <div className="source-notes">
                <small>{src.policyNotes}</small>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
