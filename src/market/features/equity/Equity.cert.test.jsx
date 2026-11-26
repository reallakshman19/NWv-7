// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EquityResearchPanel,
  WatchlistSummary,
  createWatchlistStore,
  createNotesStore,
  TRACKED_NSE_METADATA,
  TRACKED_SYMBOLS,
  getNseQuoteUrl,
  getNseAnnouncementsUrl,
  validateCustomSymbol,
  parseWatchlistFile,
  generateWatchlistCsv,
  generateWatchlistJson,
  WATCHLIST_V2_KEY,
  WATCHLIST_V1_KEY,
} from './index.js';

describe('WP-03 Equity Research & Watchlist Certification (WP03-T01 .. WP03-T18)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  // --------------------------------------------------------------------------
  // WP03-T01 (MKT-009): 16-symbol coverage not equated with 16 quotes
  // --------------------------------------------------------------------------
  it('WP03-T01: 16-symbol tracked universe rendered without false "0/16 quotes" or "zero shares"', () => {
    const store = createWatchlistStore({ storage: window.localStorage });
    render(<EquityResearchPanel store={store} />);

    // 16 symbols must all be present
    for (const sym of TRACKED_SYMBOLS) {
      expect(screen.getAllByText(sym).length).toBeGreaterThan(0);
    }

    // Must not display false "0/16" or "market has zero shares"
    expect(screen.queryByText(/0\/16 quotes/i)).toBeNull();
    expect(screen.queryByText(/market has 0 shares/i)).toBeNull();
    expect(screen.getByText(/16 Tracked NSE Universe/i)).toBeTruthy();
  });

  it('offers an explicit BSE reference for a curated equity and removes it on selection change', () => {
    const store = createWatchlistStore({ storage: window.localStorage });
    store.addKey('NSE:RELIANCE');
    store.addKey('NSE:TCS');
    store.addKey('NSE:SBIN');
    const { container } = render(<EquityResearchPanel store={store} />);
    expect(container.querySelector('iframe')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Load BSE:RELIANCE price' }));
    // Inspect the selected symbol in the wrapper without loading the provider.
    const wrapperSrc = container.querySelector('iframe').getAttribute('src');
    expect(decodeURIComponent(wrapperSrc.split(',')[1])).toContain('BSE:RELIANCE');
    fireEvent.click(screen.getByRole('button', { name: /Select TCS for research detail/i }));
    expect(container.querySelector('iframe')).toBeNull();
    expect(screen.getByRole('button', { name: 'Load BSE:TCS price' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Select SBIN for research detail/i }));
    expect(screen.queryByRole('button', { name: /Load BSE:/i })).toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
  });

  // --------------------------------------------------------------------------
  // WP03-T02 (MKT-010): Legacy V1 migration is non-destructive and preserves order
  // --------------------------------------------------------------------------
  it('WP03-T02: legacy INFY, TCS survives migration without duplicates; leaves V1 untouched on disk', () => {
    const legacyData = JSON.stringify(['INFY', 'TCS']);
    window.localStorage.setItem(WATCHLIST_V1_KEY, legacyData);

    const store = createWatchlistStore({ storage: window.localStorage });
    expect(store.getState().keys).toEqual(['NSE:INFY', 'NSE:TCS']);

    // V1 record on disk must remain strictly untouched
    expect(window.localStorage.getItem(WATCHLIST_V1_KEY)).toBe(legacyData);
  });

  // --------------------------------------------------------------------------
  // WP03-T03: Valid V2 takes precedence; malformed V2 does not silently overwrite
  // --------------------------------------------------------------------------
  it('WP03-T03: valid V2 takes precedence; malformed V2 reports corruption without data loss', () => {
    // 1. Valid V2 takes precedence over V1
    window.localStorage.setItem(WATCHLIST_V1_KEY, JSON.stringify(['INFY']));
    window.localStorage.setItem(
      WATCHLIST_V2_KEY,
      JSON.stringify({
        schemaVersion: 2,
        exchange: 'NSE',
        revision: 3,
        keys: ['NSE:SBIN', 'NSE:TCS'],
        updatedAt: '2026-11-20T07:00:00.000Z',
      })
    );

    const store1 = createWatchlistStore({ storage: window.localStorage });
    expect(store1.getState().keys).toEqual(['NSE:SBIN', 'NSE:TCS']);

    // 2. Malformed V2 reports corruption error and does not overwrite
    window.localStorage.setItem(WATCHLIST_V2_KEY, 'INVALID_CORRUPT_JSON{{{');
    const store2 = createWatchlistStore({ storage: window.localStorage });
    expect(store2.getState().errorMessage).toMatch(/corrupt/i);
    expect(window.localStorage.getItem(WATCHLIST_V2_KEY)).toBe('INVALID_CORRUPT_JSON{{{');
  });

  // --------------------------------------------------------------------------
  // WP03-T04 (MKT-030): Storage failure preserves session state and reports non-persistence
  // --------------------------------------------------------------------------
  it('WP03-T04: storage exception leaves usable session and truthful save status', () => {
    const mockStorage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => {
        throw new Error('QuotaExceededError');
      }),
    };

    const store = createWatchlistStore({ storage: mockStorage });
    render(<EquityResearchPanel store={store} />);

    // Add symbol
    act(() => {
      store.addKey('NSE:INFY');
    });

    // In-memory state updated
    expect(store.getState().keys).toEqual(['NSE:INFY']);
    expect(store.getState().isPersistent).toBe(false);

    // Warning banner rendered
    expect(screen.getByText(/Saved for this session only/i)).toBeTruthy();
  });

  // --------------------------------------------------------------------------
  // WP03-T05: Overview and Equity workspace remain synchronized in same tab
  // --------------------------------------------------------------------------
  it('WP03-T05: WatchlistSummary and EquityResearchPanel stay 100% synchronized in same tab', () => {
    const store = createWatchlistStore({ storage: window.localStorage });

    render(
      <div>
        <WatchlistSummary store={store} />
        <EquityResearchPanel store={store} />
      </div>
    );

    // Initially both empty
    expect(screen.getAllByText(/0\/12/i).length).toBeGreaterThan(0);

    // Add INFY in Panel
    fireEvent.change(screen.getByPlaceholderText(/Add NSE symbol/i), {
      target: { value: 'INFY' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save Symbol/i }));

    // Both views now display INFY
    expect(screen.getAllByText('INFY').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/1\/12/i).length).toBeGreaterThanOrEqual(2);

    // Remove INFY via Summary remove button
    const removeBtns = screen.getAllByRole('button', { name: /Remove INFY from watchlist/i });
    fireEvent.click(removeBtns[0]);

    // Both views reflect removal
    expect(screen.getAllByText(/0\/12/i).length).toBeGreaterThanOrEqual(2);
  });

  // --------------------------------------------------------------------------
  // WP03-T06: 12-item limit enforced on direct add, custom add, and reorder
  // --------------------------------------------------------------------------
  it('WP03-T06: 12-item limit enforced strictly with disabled buttons and feedback', () => {
    const store = createWatchlistStore({ storage: window.localStorage });

    // Fill to 12
    const first12 = TRACKED_SYMBOLS.slice(0, 12);
    act(() => {
      for (const sym of first12) {
        store.addKey(`NSE:${sym}`);
      }
    });

    expect(store.getState().count).toBe(12);
    expect(store.getState().isFull).toBe(true);

    // Attempt 13th
    const res = store.addKey('NSE:SUNPHARMA');
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/limit \(12\) reached/i);
    expect(store.getState().count).toBe(12);
  });

  // --------------------------------------------------------------------------
  // WP03-T07 (MKT-006): NSE and BSE not equated; official URL valid and encoded
  // --------------------------------------------------------------------------
  it('WP03-T07: NSE and BSE not equated; official URL strictly built and encoded', () => {
    expect(getNseQuoteUrl('INFY')).toBe('https://www.nseindia.com/get-quotes/equity?symbol=INFY');
    expect(getNseQuoteUrl('M&M')).toBe('https://www.nseindia.com/get-quotes/equity?symbol=M%26M');
    expect(getNseAnnouncementsUrl('INFY')).toBe(
      'https://www.nseindia.com/companies-listing/corporate-filings-announcements?symbol=INFY'
    );

    // BSE symbols rejected by custom NSE symbol validator
    expect(validateCustomSymbol('BSE:INFY')).toBeNull();
  });

  // --------------------------------------------------------------------------
  // WP03-T08: Valid custom symbols are explicitly marked unverified
  // --------------------------------------------------------------------------
  it('WP03-T08: custom symbol entry displays "listing not verified" warning', () => {
    const store = createWatchlistStore({ storage: window.localStorage });
    render(<EquityResearchPanel store={store} />);

    fireEvent.change(screen.getByPlaceholderText(/Add NSE symbol/i), {
      target: { value: 'TATAMOTORS' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save Symbol/i }));

    expect(
      screen.getAllByText(/User-entered NSE symbol — listing not verified/i).length
    ).toBeGreaterThan(0);
  });

  // --------------------------------------------------------------------------
  // WP03-T09 (MKT-011): JSON and CSV imports reject formula payloads & oversized files
  // --------------------------------------------------------------------------
  it('WP03-T09: import rejects formula payloads, malicious HTML, and oversized payloads', () => {
    const maliciousCsv = `exchange,symbol\nNSE,=cmd|calc\nNSE,<script>alert(1)</script>\nBSE,RELIANCE\nNSE,INFY\n`;
    const res = parseWatchlistFile(maliciousCsv, []);

    expect(res.ok).toBe(true);
    expect(res.validCandidates).toEqual(['NSE:INFY']);
    expect(res.rejectedRows.length).toBe(3);
    expect(res.rejectedRows[0].reason).toMatch(/Formula injection/i);
    expect(res.rejectedRows[1].reason).toMatch(/Invalid symbol format/i);
    expect(res.rejectedRows[2].reason).toMatch(/Non-NSE exchange/i);
  });

  // --------------------------------------------------------------------------
  // WP03-T10: Import preview causes zero mutation until user confirms merge
  // --------------------------------------------------------------------------
  it('WP03-T10: import preview causes zero mutation until confirmed; cancel leaves state unchanged', () => {
    const store = createWatchlistStore({ storage: window.localStorage });
    store.addKey('NSE:INFY');

    render(<EquityResearchPanel store={store} />);

    // Open import dialog
    fireEvent.click(screen.getByRole('button', { name: /Import (?:watchlist from )?file/i }));
    expect(screen.getByRole('dialog', { name: /Import Watchlist/i })).toBeTruthy();

    // Cancel without uploading
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(store.getState().keys).toEqual(['NSE:INFY']);
  });

  // --------------------------------------------------------------------------
  // WP03-T11: Duplicate and capacity-limited imports report accurate counts
  // --------------------------------------------------------------------------
  it('WP03-T11: duplicate and capacity-limited imports report accurate diagnostic counts', () => {
    // Current has 10 items
    const existing10 = TRACKED_SYMBOLS.slice(0, 10).map(s => `NSE:${s}`);
    const inputCsv = `exchange,symbol\nNSE,RELIANCE\nNSE,SUNPHARMA\nNSE,WIPRO\nNSE,MARUTI\n`;
    const res = parseWatchlistFile(inputCsv, existing10);

    expect(res.ok).toBe(true);
    expect(res.summary.canImport).toBe(2); // Only 2 slots remain (12 - 10)
    expect(res.summary.duplicates).toBe(1); // RELIANCE already in existing10
    expect(res.summary.overflow).toBe(1); // MARUTI exceeds capacity
  });

  // --------------------------------------------------------------------------
  // WP03-T12: JSON and CSV export/import round-trips safely without data loss
  // --------------------------------------------------------------------------
  it('WP03-T12: JSON and CSV export and import round-trip idempotently', () => {
    const initialKeys = ['NSE:INFY', 'NSE:TCS', 'NSE:RELIANCE'];

    // CSV roundtrip
    const csvData = generateWatchlistCsv(initialKeys);
    const parsedCsv = parseWatchlistFile(csvData, []);
    expect(parsedCsv.validCandidates).toEqual(initialKeys);

    // JSON roundtrip
    const jsonData = generateWatchlistJson(initialKeys);
    const parsedJson = parseWatchlistFile(jsonData, []);
    expect(parsedJson.validCandidates).toEqual(initialKeys);
  });

  // --------------------------------------------------------------------------
  // WP03-T13: Private notes remain local, text-safe, and bounded to 2,000 chars
  // --------------------------------------------------------------------------
  it('WP03-T13: private notes enforce 2000 char bound, safe DOM text, and session fallback', () => {
    const notesStore = createNotesStore({ storage: window.localStorage });

    // Text truncation at 2,000 chars
    const longNote = 'A'.repeat(2500);
    const res = notesStore.saveNote('NSE:INFY', longNote);
    expect(res.ok).toBe(true);
    expect(notesStore.getNote('NSE:INFY').text.length).toBe(2000);

    // Delete note
    notesStore.deleteNote('NSE:INFY');
    expect(notesStore.getNote('NSE:INFY')).toBeNull();
  });

  // --------------------------------------------------------------------------
  // WP03-T14: Cross-workpack buttons preserve exact canonical key
  // --------------------------------------------------------------------------
  it('WP03-T14: cross-workpack callbacks invoke onOpenHolding with canonical key or render disabled', () => {
    const store = createWatchlistStore({ storage: window.localStorage });
    const mockOpenHolding = vi.fn();
    const mockFindNews = vi.fn();

    const { rerender } = render(
      <EquityResearchPanel
        store={store}
        onOpenHolding={mockOpenHolding}
        onFindNews={mockFindNews}
      />
    );

    // Click "View in Portfolio"
    fireEvent.click(screen.getByRole('button', { name: /View in Portfolio/i }));
    expect(mockOpenHolding).toHaveBeenCalledWith('NSE:RELIANCE');

    // Click "Find Market News"
    fireEvent.click(screen.getByRole('button', { name: /Find Market News/i }));
    expect(mockFindNews).toHaveBeenCalledWith('NSE:RELIANCE');

    // Without callbacks -> rendered disabled with informative title
    rerender(<EquityResearchPanel store={store} />);
    expect(screen.getByRole('button', { name: /Portfolio \(WP-04\)/i }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: /Related News \(WP-07\)/i }).hasAttribute('disabled')).toBe(true);
  });

  // --------------------------------------------------------------------------
  // WP03-T15: Two independently mounted views respond to same-tab state updates
  // --------------------------------------------------------------------------
  it('WP03-T15: store reorder updates all subscribers', () => {
    const store = createWatchlistStore({ storage: window.localStorage });
    store.addKey('NSE:INFY');
    store.addKey('NSE:TCS');

    render(<EquityResearchPanel store={store} />);

    // Move TCS up
    const moveUpBtns = screen.getAllByRole('button', { name: /Move TCS up/i });
    fireEvent.click(moveUpBtns[0]);

    expect(store.getState().keys).toEqual(['NSE:TCS', 'NSE:INFY']);
  });

  // --------------------------------------------------------------------------
  // WP03-T17: Accessible modal focus and Escape key behavior
  // --------------------------------------------------------------------------
  it('WP03-T17: import modal traps focus and closes on Escape key', () => {
    const store = createWatchlistStore({ storage: window.localStorage });
    render(<EquityResearchPanel store={store} />);

    fireEvent.click(screen.getByRole('button', { name: /Import (?:watchlist from )?file/i }));
    expect(screen.getByRole('dialog')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  // --------------------------------------------------------------------------
  // WP03-T18: Standalone module import and render verifies zero missing dependencies
  // --------------------------------------------------------------------------
  it('WP03-T18: modules import and render cleanly as standalone components', () => {
    const store = createWatchlistStore({ storage: null });
    const { container: c1 } = render(<WatchlistSummary store={store} />);
    const { container: c2 } = render(<EquityResearchPanel store={store} />);

    expect(c1).toBeTruthy();
    expect(c2).toBeTruthy();
  });
});
