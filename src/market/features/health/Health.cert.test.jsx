// @vitest-environment jsdom
/**
 * Vitest certification suite for NWv7 Market Desk R2.1 - WP-09 Health, Rights & Privacy UI
 */

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { HealthPanel } from './HealthPanel.jsx';
import { SourceHealthCard } from './SourceHealthCard.jsx';
import { ReceiptsAuditPanel } from './ReceiptsAuditPanel.jsx';
import { StoragePrivacyPanel } from './StoragePrivacyPanel.jsx';
import { ClearCacheModal } from './ClearCacheModal.jsx';
import { buildInitialSourceStates } from './sourceHealthEngine.js';
import { RECORD_CLASSES } from './receiptsLedger.js';
import { PRIVACY_DISCLOSURE } from './privacyGuard.js';

describe('WP-09 Health & Privacy Workspace UI', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('renders root HealthPanel with header, quality dimensions, and tabs', () => {
    render(<HealthPanel />);
    expect(screen.getByText(/Data Health, Rights & Privacy Governance/i)).toBeTruthy();
    expect(screen.getByText(/No detected violation/i)).toBeTruthy();
    expect(screen.getByText(/Not checked/i)).toBeTruthy();
    expect(screen.queryByText('Freshness: Verified')).toBeNull();
    expect(screen.getByRole('tab', { name: /Sources & Rights/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Local Activity Log/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Storage, Migration & Privacy/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Cache Management/i })).toBeTruthy();
  });

  it('navigates between sub-desks via tabs in HealthPanel', () => {
    render(<HealthPanel />);

    // Default tab is Sources & Rights
    expect(screen.getByText(/Registered Market Sources \(11 Total\)/i)).toBeTruthy();

    // Switch to Local Activity Log
    fireEvent.click(screen.getByRole('tab', { name: /Local Activity Log/i }));
    expect(screen.getByText(/Local Source Activity Log/i)).toBeTruthy();

    // Switch to Storage, Migration & Privacy
    fireEvent.click(screen.getByRole('tab', { name: /Storage, Migration & Privacy/i }));
    expect(screen.getByText(/Storage, Migration & Privacy Governance/i)).toBeTruthy();

    // Switch to Cache Management
    fireEvent.click(screen.getByRole('tab', { name: /Cache Management/i }));
    expect(screen.getByText(/Granular Cache Controls & Concurrency Guard/i)).toBeTruthy();
  });

  it('renders SourceHealthCard with all 11 registered sources and badges', () => {
    const states = buildInitialSourceStates();
    render(<SourceHealthCard sourceStates={states} />);

    expect(screen.getByText(/Registered Market Sources \(11 Total\)/i)).toBeTruthy();
    expect(screen.getByText('TradingView')).toBeTruthy();
    expect(screen.getByText('AMFI')).toBeTruthy();
    expect(screen.getByText('MFapi')).toBeTruthy();
    expect(screen.getByText('Frankfurter')).toBeTruthy();
    expect(screen.getByText('World Bank')).toBeTruthy();

    // World bank has NO_PUBLICATION badge
    expect(screen.getByText('NO PUBLICATION')).toBeTruthy();
  });

  it('renders ReceiptsAuditPanel with statistics and filter buttons', () => {
    const sampleReceipts = [
      {
        recordClass: RECORD_CLASSES.VALID_RECEIPT,
        capturedAt: '2026-11-20T10:00:00Z',
        receipt: {
          sourceId: 'mfapi',
          publisher: 'MFapi',
          state: 'READY',
          providerAsOf: '2026-11-20',
          transportStatus: 200
        }
      },
      {
        recordClass: RECORD_CLASSES.REJECTED_ATTEMPT,
        capturedAt: '2026-11-20T10:01:00Z',
        sourceId: 'mfapi',
        errors: ['INVALID_PROVIDER_CLOCK']
      }
    ];

    render(
      <ReceiptsAuditPanel
        receipts={sampleReceipts}
        receiptsSummary={{ totalRetained: 2, validReceiptCount: 1, rejectedAttemptCount: 1 }}
        sourceStates={{}}
        storageSummary={{}}
      />
    );

    expect(screen.getByText(/Export Sanitized JSON/i)).toBeTruthy();
    expect(screen.getByText(/Valid Receipts \(1\)/i)).toBeTruthy();
    expect(screen.getByText(/Rejected Attempts \(1\)/i)).toBeTruthy();

    // Filter to valid
    fireEvent.click(screen.getByText(/Valid Receipts \(1\)/i));
    expect(screen.getByText('VALID')).toBeTruthy();

    // Filter to rejected
    fireEvent.click(screen.getByText(/Rejected Attempts \(1\)/i));
    expect(screen.getByText('REJECTED')).toBeTruthy();
  });

  it('renders StoragePrivacyPanel with privacy banner, migration preview, and quota table', () => {
    render(
      <StoragePrivacyPanel
        storageSummary={{ knownPayloadBytes: 1540, itemCounts: { 'nw7.india-watchlist.v1': 3 } }}
        rollbackEligibility={{ eligible: true }}
        normalizedFunds={{ codes: ['119551'], rawCount: 1 }}
        privacyDisclosure={PRIVACY_DISCLOSURE}
      />
    );

    expect(screen.getByText(/Privacy Guarantee/i)).toBeTruthy();
    expect(screen.getByText(/Watchlist Schema Migration/i)).toBeTruthy();
    expect(screen.getByText(/1540 bytes/i)).toBeTruthy();
    expect(screen.getByText(/Dry-Run Preview/i)).toBeTruthy();

    // Click Dry-Run Preview
    fireEvent.click(screen.getByText(/Dry-Run Preview/i));
    expect(screen.getByText(/Dry-Run Migration Plan/i)).toBeTruthy();
  });

  it('renders ClearCacheModal with purge targets, guarantee banner, and confirmation dialog', () => {
    const purgeMock = vi.fn().mockReturnValue({
      persistentDeleted: true,
      memoryInvalidated: true,
      keysPurged: ['nw7.omr-inr.frankfurter.v1'],
      epoch: 2,
      purgedAt: '2026-11-20T10:00:00Z'
    });

    render(<ClearCacheModal onPurgeCaches={purgeMock} />);

    expect(screen.getByText(/Permanent Data Inviolability/i)).toBeTruthy();
    expect(screen.getByText(/Foreign Exchange Rate Cache/i)).toBeTruthy();
    expect(screen.getByText(/Mutual Fund NAV & History Cache/i)).toBeTruthy();

    // Click purge FX
    const purgeButtons = screen.getAllByRole('button', { name: /Purge Cache/i });
    fireEvent.click(purgeButtons[0]);

    // Modal appears
    expect(screen.getByText(/Confirm Cache Invalidation/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Yes, Purge Now/i })).toBeTruthy();

    // Confirm
    fireEvent.click(screen.getByRole('button', { name: /Yes, Purge Now/i }));
    expect(purgeMock).toHaveBeenCalledWith('fx');
    expect(screen.getByText(/Purge Completed Successfully/i)).toBeTruthy();
  });
});
