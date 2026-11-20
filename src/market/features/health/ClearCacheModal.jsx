/**
 * NWv7 Market Desk R2.1 - WP-09 Granular Cache Management & Invalidation
 *
 * Implements safe, epoch-guarded cache purging with live store invalidation.
 * Strictly protects user portfolio transactions, holdings, and watchlists.
 */

import React, { useState } from 'react';

export function ClearCacheModal({ onPurgeCaches }) {
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [purgeResult, setPurgeResult] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const targets = [
    {
      id: 'fx',
      label: 'Foreign Exchange Rate Cache',
      desc: 'Clears cached Frankfurter OMR/INR and USD/INR rates. Next fetch will acquire fresh ECB reference rates.',
      keys: ['nw7.omr-inr.frankfurter.v1', 'nw7.usd-inr.frankfurter.v1']
    },
    {
      id: 'nav',
      label: 'Mutual Fund NAV & History Cache',
      desc: 'Clears cached MFapi scheme NAVs and series histories. Saved fund watchlists remain 100% intact.',
      keys: ['nw7.market-fund-nav.v1', 'nw7.market-fund-history.v1']
    },
    {
      id: 'receipts',
      label: 'Source Activity Receipts Log',
      desc: 'Clears the 100-record local source activity log. Next verifications will rebuild the log.',
      keys: ['nw7.market-source-receipts.v1']
    },
    {
      id: 'all',
      label: 'Purge All Temporary Caches',
      desc: 'Purges all temporary caches, resets memory snapshots, and increments the concurrency epoch.',
      keys: ['All allowlisted cache keys']
    }
  ];

  const handleInitiatePurge = (targetId) => {
    setSelectedTarget(targetId);
    setConfirming(true);
    setPurgeResult(null);
  };

  const handleExecutePurge = () => {
    if (onPurgeCaches && selectedTarget) {
      const result = onPurgeCaches(selectedTarget);
      setPurgeResult(result);
      setConfirming(false);
    }
  };

  return (
    <div className="health-section">
      <div className="health-section-header">
        <div>
          <h3 className="health-section-title">Granular Cache Controls & Concurrency Guard</h3>
          <p className="health-section-desc">
            Safely purge temporary API response caches and invalidate live memory stores.
          </p>
        </div>
      </div>

      <div className="cache-safety-guarantee-banner" role="status">
        <span className="guarantee-icon">🛡️</span>
        <div className="guarantee-text">
          <strong>Permanent Data Inviolability:</strong>
          <span> Personal portfolio transactions, asset holdings, and saved watchlists are strictly protected and will never be deleted by cache operations.</span>
        </div>
      </div>

      <div className="cache-targets-grid">
        {targets.map((tgt) => (
          <div key={tgt.id} className="cache-target-card">
            <div className="target-top">
              <h4 className="target-title">{tgt.label}</h4>
              <button
                type="button"
                className="health-action-btn btn-purge"
                onClick={() => handleInitiatePurge(tgt.id)}
              >
                Purge Cache
              </button>
            </div>
            <p className="target-desc">{tgt.desc}</p>
            <div className="target-keys">
              <small>Target Keys: <code>{tgt.keys.join(', ')}</code></small>
            </div>
          </div>
        ))}
      </div>

      {confirming && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="modal-dialog">
            <h4 id="modal-title" className="modal-title">Confirm Cache Invalidation</h4>
            <p className="modal-body">
              Are you sure you want to purge <strong>{selectedTarget.toUpperCase()}</strong> cache?
              This will drop persistent entries, increment the store concurrency epoch, and broadcast
              an invalidation event to all active views and browser tabs.
            </p>
            <div className="modal-footer">
              <button
                type="button"
                className="health-action-btn btn-danger"
                onClick={handleExecutePurge}
              >
                Yes, Purge Now
              </button>
              <button
                type="button"
                className="health-action-btn btn-secondary"
                onClick={() => setConfirming(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {purgeResult && (
        <div className="status-alert alert-success mt-4">
          <div className="alert-header">
            <strong>✓ Purge Completed Successfully</strong>
            <span className="epoch-tag">Epoch: #{purgeResult.epoch}</span>
          </div>
          <p>
            Deleted keys: <code>{(purgeResult.keysPurged || []).join(', ') || 'None'}</code>
          </p>
          <small>
            Persistent cache dropped, store memory invalidated, and cross-tab event broadcast at {purgeResult.purgedAt}.
          </small>
        </div>
      )}
    </div>
  );
}
