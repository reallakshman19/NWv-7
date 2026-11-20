/**
 * NWv7 Market Desk R2.1 - WP-09 Storage & Privacy Panel
 *
 * Provides conflict-safe watchlist migration controls, rollback verification,
 * in-memory saved-funds status, privacy disclosure, and storage usage audits.
 */

import React, { useState } from 'react';
import { previewWatchlistMigration } from './storageManager.js';
import { MARKET_LEGACY_STORAGE_KEYS, MARKET_R21_STORAGE_KEYS } from '../../contracts/storagePolicy.js';

export function StoragePrivacyPanel({
  storageSummary = {},
  rollbackEligibility = {},
  normalizedFunds = {},
  privacyDisclosure = {},
  onMigrateWatchlist,
  onRollbackWatchlist
}) {
  const [migrationStatus, setMigrationStatus] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  // Check legacy watchlist in localStorage if available
  let legacyWatchlistRaw = null;
  if (typeof window !== 'undefined' && window.localStorage) {
    legacyWatchlistRaw = window.localStorage.getItem(MARKET_LEGACY_STORAGE_KEYS.watchlist);
  }
  let legacyArray = [];
  try {
    legacyArray = JSON.parse(legacyWatchlistRaw || '[]');
  } catch {
    legacyArray = [];
  }

  const preview = previewWatchlistMigration(legacyArray);
  const v2Count = storageSummary.itemCounts?.['nw7.market-watchlist.v2'] ?? 0;
  const legacyCount = storageSummary.itemCounts?.['nw7.india-watchlist.v1'] ?? legacyArray.length;

  const handleMigrate = () => {
    if (onMigrateWatchlist) {
      const res = onMigrateWatchlist();
      setMigrationStatus(res);
    }
  };

  const handleRollback = () => {
    if (onRollbackWatchlist) {
      const res = onRollbackWatchlist();
      setMigrationStatus(res);
    }
  };

  return (
    <div className="health-section">
      <div className="health-section-header">
        <div>
          <h3 className="health-section-title">Storage, Migration & Privacy Governance</h3>
          <p className="health-section-desc">
            Manages non-destructive legacy storage migration, conflict-safe rollbacks,
            and privacy boundary assurances.
          </p>
        </div>
      </div>

      {/* Privacy Disclosure Notice */}
      <div className="privacy-banner-card" role="note" aria-label="Privacy Governance">
        <div className="privacy-banner-header">
          <span className="privacy-badge">🔒 Privacy Guarantee</span>
          <span className="privacy-pill">Client-Local Storage</span>
        </div>
        <p className="privacy-badge-text">
          {privacyDisclosure.badgeText || 'Portfolio stored locally in this browser. Diagnostic exports exclude portfolio records. Third-party integration privacy verification pending.'}
        </p>
        <ul className="privacy-points-list">
          {(privacyDisclosure.trustBoundaryNotes || []).map((note, idx) => (
            <li key={idx}>{note}</li>
          ))}
        </ul>
      </div>

      <div className="panels-split-grid">
        {/* Watchlist Migration Card */}
        <div className="sub-card">
          <h4 className="sub-card-title">Watchlist Schema Migration (V1 → V2)</h4>
          <p className="sub-card-desc">
            Migrates legacy unqualified symbols (e.g. <code>INFY</code>) to canonical keys (<code>NSE:INFY</code>)
            under a 12-item limit. Legacy keys are <strong>never deleted or overwritten</strong>.
          </p>

          <div className="migration-stat-bar">
            <div className="mig-stat">
              <span className="mig-label">Legacy Watchlist (V1):</span>
              <span className="mig-value">{legacyCount} items</span>
            </div>
            <div className="mig-stat">
              <span className="mig-label">Active Watchlist (V2):</span>
              <span className="mig-value text-accent">{v2Count} items</span>
            </div>
            {rollbackEligibility?.reason && (
              <div className="mig-stat">
                <span className="mig-label">Rollback State:</span>
                <span className="mig-value">{rollbackEligibility.reason}</span>
              </div>
            )}
          </div>

          <div className="migration-actions-group">
            <button
              type="button"
              className="health-action-btn btn-secondary"
              onClick={() => setShowPreview(!showPreview)}
            >
              {showPreview ? 'Hide Dry-Run Preview' : 'Dry-Run Preview'}
            </button>

            <button
              type="button"
              className="health-action-btn btn-primary"
              onClick={handleMigrate}
              disabled={!preview.canMigrate}
            >
              Execute V2 Migration
            </button>

            {v2Count > 0 && (
              <button
                type="button"
                className="health-action-btn btn-danger"
                onClick={handleRollback}
              >
                Rollback to Legacy
              </button>
            )}
          </div>

          {showPreview && (
            <div className="preview-box">
              <h5>Dry-Run Migration Plan</h5>
              <p>Planned V2 Keys ({preview.plannedV2Keys.length}): <code>{preview.plannedV2Keys.join(', ') || 'None'}</code></p>
              {preview.rejected.length > 0 && (
                <p className="text-warning">Rejected Items: <code>{preview.rejected.join(', ')}</code></p>
              )}
            </div>
          )}

          {migrationStatus && (
            <div className={`status-alert ${migrationStatus.ok ? 'alert-success' : 'alert-danger'}`}>
              <p>{migrationStatus.message || (migrationStatus.ok ? 'Migration completed successfully!' : 'Action failed.')}</p>
              {migrationStatus.blocked && (
                <p className="text-danger font-semibold">
                  Automatic rollback is blocked. Current V2 edits are preserved.
                  Export and reconcile the watchlist explicitly before any recovery.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Saved Funds & Storage Quota Card */}
        <div className="sub-card">
          <h4 className="sub-card-title">Saved Funds & Storage Quotas</h4>

          <div className="funds-status-section">
            <div className="detail-row">
              <span className="detail-label">Saved Funds Count:</span>
              <span className="detail-value">{normalizedFunds.rawCount ?? 0}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Normalized AMFI Codes:</span>
              <span className="detail-value text-success">{normalizedFunds.codes?.length ?? 0} valid</span>
            </div>
            <p className="funds-notice">
              ✓ Funds normalization operates strictly in-memory. The legacy storage key
              <code> {MARKET_LEGACY_STORAGE_KEYS.funds} </code> is preserved byte-for-byte.
            </p>
          </div>

          <hr className="divider" />

          <h5 className="sub-card-subtitle">Market Storage Footprint</h5>
          <div className="quota-table">
            <div className="quota-row">
              <span>Known NWv7 Payload Bytes:</span>
              <strong>{storageSummary.knownPayloadBytes || 0} bytes</strong>
            </div>
            <div className="quota-row">
              <span>Browser Origin Quota Estimate:</span>
              <strong>
                {storageSummary.estimatedOriginQuotaBytes
                  ? `${Math.round(storageSummary.estimatedOriginQuotaBytes / 1024)} KB (approx.)`
                  : 'Not reported by browser'}
              </strong>
            </div>
          </div>
          <small className="quota-disclaimer">
            * Storage bytes represent exact UTF-8 serialization of known NWv7 keys.
            Personal portfolio data remains strictly client-local and aggregated.
          </small>
        </div>
      </div>
    </div>
  );
}
