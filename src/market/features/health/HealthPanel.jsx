/**
 * NWv7 Market Desk R2.1 - WP-09 Root Data Health, Rights, Cache & Privacy Workspace
 *
 * Connects to healthStore via useSyncExternalStore for referentially stable,
 * reactive state across source health, activity log, storage, and cache controls.
 */

import React, { useState, useSyncExternalStore } from 'react';
import { healthStore } from './healthStore.js';
import { SourceHealthCard } from './SourceHealthCard.jsx';
import { ReceiptsAuditPanel } from './ReceiptsAuditPanel.jsx';
import { StoragePrivacyPanel } from './StoragePrivacyPanel.jsx';
import { ClearCacheModal } from './ClearCacheModal.jsx';

export function HealthPanel() {
  const [activeTab, setActiveTab] = useState('sources');
  const snapshot = useSyncExternalStore(healthStore.subscribe, healthStore.getSnapshot);

  const {
    sourceStates,
    receipts,
    receiptsSummary,
    storageSummary,
    rollbackEligibility,
    normalizedFunds,
    qualityEvaluation,
    privacyDisclosure
  } = snapshot;

  const dims = qualityEvaluation?.dimensions || {};

  return (
    <div className="health-workspace-container" data-testid="health-workspace">
      {/* Top Header & Quality Summary */}
      <header className="health-workspace-header">
        <div className="header-titles">
          <h2 className="workspace-main-title">Data Health, Rights & Privacy Governance</h2>
          <p className="workspace-subtitle">
            On-device source receipts and access rights. No automatic polling or claim of current market availability.
          </p>
        </div>

        {/* Multi-Dimensional Evaluation Bar */}
        <div className="quality-dimensions-bar" role="region" aria-label="Quality Governance Dimensions">
          <div className="dim-chip" title={dims.policyCompliance?.detail}>
            <span className="dim-label">Policy Compliance:</span>
            <span className="dim-value">{dims.policyCompliance?.status === 'PASS' ? 'No detected violation' : 'Review required'}</span>
          </div>
          <div className="dim-chip" title={dims.dataAvailability?.detail}>
            <span className="dim-label">Quote Availability:</span>
            <span className="dim-value">{dims.dataAvailability?.status === 'LIMITED_FREE_TIER' ? 'Native quotes restricted' : dims.dataAvailability?.status || 'Not checked'}</span>
          </div>
          <div className="dim-chip" title={dims.freshness?.detail}>
            <span className="dim-label">Freshness:</span>
            <span className="dim-value" aria-live="polite">{dims.freshness?.status === 'NOT_CHECKED' ? 'Not checked' : dims.freshness?.status === 'PASS' ? 'Dated observations recorded' : 'Review dated observations'}</span>
          </div>
          <div className="dim-chip" title={privacyDisclosure?.badgeText}>
            <span className="dim-label">Portfolio Privacy:</span>
            <span className="dim-value text-success">Client-Local</span>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="health-tabs-nav" role="tablist" aria-label="Health Sub-Desks">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'sources'}
          className={`health-tab-btn ${activeTab === 'sources' ? 'active' : ''}`}
          onClick={() => setActiveTab('sources')}
        >
          Sources & Rights (11)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'activity'}
          className={`health-tab-btn ${activeTab === 'activity' ? 'active' : ''}`}
          onClick={() => setActiveTab('activity')}
        >
          Local Activity Log ({receipts.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'storage'}
          className={`health-tab-btn ${activeTab === 'storage' ? 'active' : ''}`}
          onClick={() => setActiveTab('storage')}
        >
          Storage, Migration & Privacy
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'cache'}
          className={`health-tab-btn ${activeTab === 'cache' ? 'active' : ''}`}
          onClick={() => setActiveTab('cache')}
        >
          Cache Management
        </button>
      </nav>

      {/* Main Tab Panels */}
      <main className="health-tab-content">
        {activeTab === 'sources' && (
          <SourceHealthCard sourceStates={sourceStates} />
        )}

        {activeTab === 'activity' && (
          <ReceiptsAuditPanel
            receipts={receipts}
            receiptsSummary={receiptsSummary}
            sourceStates={sourceStates}
            storageSummary={storageSummary}
          />
        )}

        {activeTab === 'storage' && (
          <StoragePrivacyPanel
            storageSummary={storageSummary}
            rollbackEligibility={rollbackEligibility}
            normalizedFunds={normalizedFunds}
            privacyDisclosure={privacyDisclosure}
            onMigrateWatchlist={() => healthStore.migrateWatchlist()}
            onRollbackWatchlist={(force) => healthStore.rollbackWatchlist(force)}
          />
        )}

        {activeTab === 'cache' && (
          <ClearCacheModal
            onPurgeCaches={(target) => healthStore.purgeCaches(target)}
          />
        )}
      </main>
    </div>
  );
}
