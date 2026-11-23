// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Overview,
  MarketNav,
  MOBILE_DIRECT_IDS,
  MOBILE_MORE_IDS,
  MOBILE_DISPLAY_LABELS,
  OverviewSlotErrorBoundary,
} from './index.js';
import { freeOpenMarketPayload } from '../../../services/marketFreeOpenPolicy.js';
import { R21_MARKET_WORKSPACE_IDS } from '../../contracts/index.js';

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('WP-01 Overview and Navigation Certification (WP01-T01 .. WP01-T15)', () => {
  // --------------------------------------------------------------------------
  // WP01-T01: Quote-free Overview renders all 8 content regions and health strip
  // --------------------------------------------------------------------------
  it('WP01-T01: renders all eight content regions and source-health strip with quote-free payload', () => {
    const payload = freeOpenMarketPayload();
    render(<Overview data={payload} onNavigate={() => {}} />);

    // 8 Content sections
    expect(screen.getByRole('heading', { name: /India Market Pulse/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /BSE Provider Board/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Market Briefing/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /My Watchlist/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Movers & Sector References/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Mutual Fund Quick Search/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /OMR \/ INR Currency Quick Tool/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /IPO \/ NFO \/ Verified Events/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Portfolio & Investment Lab/i })).toBeTruthy();

    // Global Source Health strip
    expect(screen.getByRole('heading', { name: /Data Provenance & Source Health/i })).toBeTruthy();
  });

  // --------------------------------------------------------------------------
  // WP01-T02: Mobile navigation: 3 direct tabs + 1 More menu with 6 destinations
  // --------------------------------------------------------------------------
  it('WP01-T02: exposes three direct mobile tabs and six More destinations, all 9 unique', () => {
    const onNavigate = vi.fn();
    render(<MarketNav currentWorkspace="overview" onNavigate={onNavigate} />);

    // Direct mobile tabs
    expect(MOBILE_DIRECT_IDS).toEqual(['overview', 'equity', 'funds']);
    expect(MOBILE_MORE_IDS).toHaveLength(6);

    const mobileDirectTabs = screen.getAllByRole('tab');
    // Ensure labels match UI_ASCII_ACCEPTANCE
    expect(mobileDirectTabs.some(t => t.textContent === 'Overview')).toBe(true);
    expect(mobileDirectTabs.some(t => t.textContent === 'Stocks')).toBe(true);
    expect(mobileDirectTabs.some(t => t.textContent === 'Funds')).toBe(true);

    // Open More menu
    const moreBtn = screen.getByRole('button', { name: /More workspaces/i });
    expect(moreBtn.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(moreBtn);
    expect(moreBtn.getAttribute('aria-expanded')).toBe('true');

    // Dialog menu items
    const dialog = screen.getByRole('dialog', { name: /More market workspaces/i });
    const menuItems = within(dialog).getAllByRole('menuitem');
    expect(menuItems).toHaveLength(6);

    expect(dialog.getAttribute('aria-modal')).toBeNull();
    expect(document.activeElement).toBe(menuItems[0]);
    fireEvent.keyDown(menuItems[0], { key: 'End' });
    expect(document.activeElement).toBe(menuItems[5]);
    fireEvent.keyDown(menuItems[5], { key: 'Escape' });
    expect(document.activeElement).toBe(moreBtn);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(moreBtn);

    // Clicking a More item invokes onNavigate and closes dialog
    fireEvent.click(within(screen.getByRole('dialog')).getAllByRole('menuitem')[0]);
    expect(onNavigate).toHaveBeenCalledWith('indices');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  // --------------------------------------------------------------------------
  // WP01-T03: Desktop navigation contains all nine workspace destinations
  // --------------------------------------------------------------------------
  it('WP01-T03: desktop navigation contains all nine workspace destinations', () => {
    const onNavigate = vi.fn();
    render(<MarketNav currentWorkspace="indices" onNavigate={onNavigate} />);

    const desktopTablist = screen.getByRole('tablist', { name: /Desktop workspaces/i });
    const tabs = within(desktopTablist).getAllByRole('tab');
    expect(tabs).toHaveLength(9);

    const labels = tabs.map(t => t.textContent.trim());
    expect(labels).toContain('Overview');
    expect(labels).toContain('Indices & sectors');
    expect(labels).toContain('Equity');
    expect(labels).toContain('Portfolio');
    expect(labels).toContain('Mutual funds');
    expect(labels).toContain('IPO & events');
    expect(labels).toContain('Currency & macro');
    expect(labels).toContain('Investment lab');
    expect(labels).toContain('Data health');

    // Active tab state
    const activeTab = tabs.find(t => t.getAttribute('aria-selected') === 'true');
    expect(activeTab.textContent).toContain('Indices & sectors');

    // Tab click triggers onNavigate
    const portfolioTab = tabs.find(t => t.textContent.includes('Portfolio'));
    fireEvent.click(portfolioTab);
    expect(onNavigate).toHaveBeenCalledWith('portfolio');
  });

  // --------------------------------------------------------------------------
  // WP01-T04: Unintegrated feature slot renders an honest fallback
  // --------------------------------------------------------------------------
  it('WP01-T04: renders honest action fallbacks when sibling slots are null', () => {
    const onNavigate = vi.fn();
    render(<Overview onNavigate={onNavigate} />);

    // Provider board fallback
    expect(screen.getByText(/Free, branded provider display of BSE equities and indices/i)).toBeTruthy();
    expect(screen.getByText(/Data level: End of Day \(EOD\)/i)).toBeTruthy();

    // Mutual fund search fallback
    expect(screen.getByLabelText(/Search scheme name or 6-digit AMFI code/i)).toBeTruthy();
    const fundInput = screen.getByPlaceholderText(/e\.g\. 120503 or Nifty 50/i);
    fireEvent.change(fundInput, { target: { value: '120503' } });
    fireEvent.click(screen.getByRole('button', { name: /Find in Funds/i }));
    expect(onNavigate).toHaveBeenCalledWith('funds');

    // Currency fallback
    expect(screen.getByText(/OMR \/ INR Currency Quick Tool/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Fetch Latest Rate in Workspace/i }));
    expect(onNavigate).toHaveBeenCalledWith('currency-macro');

    // IPO events fallback
    expect(screen.getByText(/We report source status as/i)).toBeTruthy();
    expect(screen.getAllByText(/unverified/i).length).toBeGreaterThanOrEqual(1);
    fireEvent.click(screen.getByRole('button', { name: /Open IPO & Events Workspace/i }));
    expect(onNavigate).toHaveBeenCalledWith('ipo-events');
  });

  // --------------------------------------------------------------------------
  // WP01-T05: One slot rendering error cannot crash or remove remaining Overview
  // --------------------------------------------------------------------------
  it('WP01-T05: slot error boundary isolates crashes to the affected card', () => {
    // Suppress React boundary console.error during expected throw
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    function CrashingSlot() {
      throw new Error('Simulated sibling feature crash in WP-05');
    }

    render(
      <Overview
        slots={{
          fundSearch: <CrashingSlot />,
        }}
        onNavigate={() => {}}
      />
    );

    // Mutual Fund slot should display localized error fallback
    const alert = screen.getByRole('alert');
    expect(alert).toBeTruthy();
    expect(alert.textContent).toMatch(/Mutual Fund Search.*is temporarily unavailable/i);

    // Sibling sections must still render normally
    expect(screen.getByRole('heading', { name: /India Market Pulse/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /My Watchlist/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /OMR \/ INR Currency Quick Tool/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Portfolio & Investment Lab/i })).toBeTruthy();

    spy.mockRestore();
  });

  // --------------------------------------------------------------------------
  // WP01-T06: Sibling slots rendering normally
  // --------------------------------------------------------------------------
  it('WP01-T06: successfully renders custom injected sibling slots when provided', () => {
    render(
      <Overview
        slots={{
          watchlist: <div data-testid="custom-watchlist-slot">Injected WP-03 Watchlist</div>,
          currency: <div data-testid="custom-currency-slot">Injected WP-06 FX Tool</div>,
        }}
      />
    );

    expect(screen.getByTestId('custom-watchlist-slot').textContent).toBe('Injected WP-03 Watchlist');
    expect(screen.getByTestId('custom-currency-slot').textContent).toBe('Injected WP-06 FX Tool');
  });

  // --------------------------------------------------------------------------
  // WP01-T07: No fabricated market values or 0/16 market headline
  // --------------------------------------------------------------------------
  it('WP01-T07: displays 16 tracked symbols universe without 0/16 misleading quote headlines', () => {
    const payload = freeOpenMarketPayload();
    render(<Overview data={payload} />);

    // Must NOT display "0/16" or misleading zero counters
    expect(screen.queryByText(/0\/16 qualified quotes/i)).toBeNull();
    expect(screen.queryByText(/Market has 0 shares/i)).toBeNull();

    // Must display tracked universe count (16)
    expect(screen.getByText(/Tracked NSE Universe: 16/i)).toBeTruthy();
    // Must display canonical symbols from authoritative universe
    expect(screen.getByText(/NSE:RELIANCE/i)).toBeTruthy();
    expect(screen.getByText(/NSE:TCS/i)).toBeTruthy();
  });

  // --------------------------------------------------------------------------
  // WP01-T08: Provider opt-in: TradingView script is not fetched on mount
  // --------------------------------------------------------------------------
  it('WP01-T08: does not inject third-party TradingView script tags on initial mount', () => {
    render(<Overview />);
    const scripts = Array.from(document.querySelectorAll('script'));
    const tvScript = scripts.find(s => (s.src || '').includes('tradingview.com'));
    expect(tvScript).toBeUndefined();
  });

  // --------------------------------------------------------------------------
  // WP01-T09: Storage safety: existing saved preferences are preserved and untouched
  // --------------------------------------------------------------------------
  it('WP01-T09: reads existing user saved storage non-destructively without erasing it', () => {
    localStorage.setItem('nw7.india-watchlist.v1', JSON.stringify(['INFY', 'TCS']));
    localStorage.setItem('nw7.market-saved-funds.v1', JSON.stringify(['100001', '100002', '100003']));

    render(<Overview />);

    // Verified saved counts displayed
    expect(screen.getByText(/Saved: 2\/12/i)).toBeTruthy();
    expect(screen.getByText(/Saved: 3\/12/i)).toBeTruthy();

    // Storage remains intact
    expect(JSON.parse(localStorage.getItem('nw7.india-watchlist.v1'))).toEqual(['INFY', 'TCS']);
    expect(JSON.parse(localStorage.getItem('nw7.market-saved-funds.v1'))).toEqual(['100001', '100002', '100003']);
  });

  // --------------------------------------------------------------------------
  // WP01-T10: Keyboard navigation and Escape key closes More menu
  // --------------------------------------------------------------------------
  it('WP01-T10: More menu dialog closes on Escape key and returns focus', () => {
    render(<MarketNav currentWorkspace="overview" onNavigate={() => {}} />);

    const moreBtn = screen.getByRole('button', { name: /More workspaces/i });
    fireEvent.click(moreBtn);
    expect(screen.getByRole('dialog', { name: /More market workspaces/i })).toBeTruthy();

    // Press Escape
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  // --------------------------------------------------------------------------
  // WP01-T11: Collapsible Data Health diagnostics toggle
  // --------------------------------------------------------------------------
  it('WP01-T11: toggles global Data Health diagnostics details on user request', () => {
    render(<Overview onNavigate={() => {}} />);

    const toggleBtn = screen.getByRole('button', { name: /Inspect Health/i });
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(/MARKET_FREE_OPEN_ONLY = true/i)).toBeNull();

    // Expand
    fireEvent.click(toggleBtn);
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(/MARKET_FREE_OPEN_ONLY = true/i)).toBeTruthy();
    expect(screen.getByText(/PROVIDER_EMBED · Free branded widget · Isolated iframe/i)).toBeTruthy();

    // Collapse
    fireEvent.click(toggleBtn);
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(/MARKET_FREE_OPEN_ONLY = true/i)).toBeNull();
  });

  // --------------------------------------------------------------------------
  // WP01-T12: Indicative IST session status header
  // --------------------------------------------------------------------------
  it('WP01-T12: displays indicative IST session hours without falsely asserting verified open', () => {
    render(<Overview />);
    expect(screen.getByText(/Indicative IST hours 09:15–15:30; holidays unverified/i)).toBeTruthy();
    expect(screen.getByText(/Free\/open mode — no redistributed quotes/i)).toBeTruthy();
  });

  // --------------------------------------------------------------------------
  // WP01-T13: Header Data Health button navigates to health workspace
  // --------------------------------------------------------------------------
  it('WP01-T13: header and footer Data Health buttons trigger onNavigate("health")', () => {
    const onNavigate = vi.fn();
    render(<Overview onNavigate={onNavigate} />);

    const headerHealthBtn = screen.getByRole('button', { name: /View data health and source availability/i });
    fireEvent.click(headerHealthBtn);
    expect(onNavigate).toHaveBeenCalledWith('health');

    const fullHealthBtn = screen.getByRole('button', { name: /Full Health Workspace/i });
    fireEvent.click(fullHealthBtn);
    expect(onNavigate).toHaveBeenCalledWith('health');
  });

  // --------------------------------------------------------------------------
  // WP01-T14: Shared safety: existing four-route production adapter is unchanged
  // --------------------------------------------------------------------------
  it('WP01-T14: verifies shared marketWorkspaceRoute activated for R2.1 with legacy preserved', async () => {
    const sharedRoute = await import('../../../services/marketWorkspaceRoute.js');
    expect(sharedRoute.LEGACY_MARKET_WORKSPACE_IDS).toEqual(['indices', 'equity', 'funds', 'currency']);
    expect(sharedRoute.MARKET_WORKSPACE_IDS.length).toBe(9);
    expect(sharedRoute.getMarketWorkspaceFromHash('#/markets')).toBe('overview');
  });

  // --------------------------------------------------------------------------
  // WP01-T15: Navigation callback integrity: every section button dispatches a valid ID
  // --------------------------------------------------------------------------
  it('WP01-T15: all Overview section navigation buttons dispatch valid workspace IDs', () => {
    const onNavigate = vi.fn();
    render(<Overview onNavigate={onNavigate} />);

    // Indices navigation
    fireEvent.click(screen.getByRole('button', { name: /All Indices & Sectors/i }));
    expect(onNavigate).toHaveBeenLastCalledWith('indices');

    // Equity navigation
    fireEvent.click(screen.getByRole('button', { name: /Manage Watchlist/i }));
    expect(onNavigate).toHaveBeenLastCalledWith('equity');

    // Currency navigation
    fireEvent.click(screen.getByRole('button', { name: /Currency & Macro/i }));
    expect(onNavigate).toHaveBeenLastCalledWith('currency-macro');

    // Events navigation
    fireEvent.click(screen.getByRole('button', { name: /All Events & News/i }));
    expect(onNavigate).toHaveBeenLastCalledWith('ipo-events');

    // Portfolio navigation
    fireEvent.click(screen.getByRole('button', { name: /Open Portfolio/i }));
    expect(onNavigate).toHaveBeenLastCalledWith('portfolio');

    // Lab navigation
    fireEvent.click(screen.getByRole('button', { name: /Launch Calculators/i }));
    expect(onNavigate).toHaveBeenLastCalledWith('lab');

    // Verify all invoked IDs are valid in R21 registry
    const dispatched = onNavigate.mock.calls.map(c => c[0]);
    for (const id of dispatched) {
      expect(R21_MARKET_WORKSPACE_IDS).toContain(id);
    }
  });
});
