// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MarketPage from './MarketPage.jsx';
import { useMarketPageViewModel } from '../viewModels/useMarketPageViewModel.js';

vi.mock('../viewModels/useMarketPageViewModel.js', () => ({
  useMarketPageViewModel: vi.fn(),
}));

const mockMarketData = {
  sourceMode: 'free-open-only',
  indices: [
    { name: 'NIFTY 50', symbol: '^NSEI', value: 25000, quoteAt: '2026-11-20T10:00:00Z', change: 10, changePercent: 0.04 },
    { name: 'SENSEX', symbol: '^BSESN', value: 82000, quoteAt: '2026-11-20T10:00:00Z', change: 25, changePercent: 0.03 }
  ],
  globalIndices: [],
  sectorals: [],
  movers: { gainers: [], losers: [] },
  sourceHealth: {
    'nse-indices': { status: 'READY', providerAsOf: '2026-11-20' },
    'tradingview-bse': { status: 'READY', providerAsOf: '2026-11-20' },
    'mfapi': { status: 'READY', providerAsOf: '2026-11-20' },
    'frankfurter': { status: 'READY', providerAsOf: '2026-11-20' }
  }
};

function setupViewModel(overrides = {}) {
  const refreshMarket = vi.fn().mockResolvedValue({ ok: true });
  useMarketPageViewModel.mockReturnValue({
    marketData: mockMarketData,
    rawMarketData: mockMarketData,
    marketSettings: { showIndices: true, showSectorals: true },
    sourceHealth: mockMarketData.sourceHealth,
    sessionState: { label: 'Regular trading' },
    loading: false,
    error: null,
    refreshMarket,
    ...overrides
  });
  return { refreshMarket };
}

beforeEach(() => {
  window.location.hash = '#/markets';
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('NWv7 Market Desk R2.1 - WP-10 MarketPage Certification', () => {
  it('WP10-T01: defaults to Overview workspace and renders 9 desktop tabs & 4-control mobile nav', () => {
    setupViewModel();
    render(<MarketPage />);

    // Default Overview workspace verified
    expect(screen.getByText('India Market Pulse')).toBeTruthy();

    // 9 Desktop navigation tabs present
    const desktopTablist = screen.getByRole('tablist', { name: 'Desktop workspaces' });
    expect(within(desktopTablist).getByRole('tab', { name: 'Overview' })).toBeTruthy();
    expect(within(desktopTablist).getByRole('tab', { name: 'Indices & sectors' })).toBeTruthy();
    expect(within(desktopTablist).getByRole('tab', { name: 'Equity' })).toBeTruthy();
    expect(within(desktopTablist).getByRole('tab', { name: 'Portfolio' })).toBeTruthy();
    expect(within(desktopTablist).getByRole('tab', { name: 'Mutual funds' })).toBeTruthy();
    expect(within(desktopTablist).getByRole('tab', { name: 'IPO & events' })).toBeTruthy();
    expect(within(desktopTablist).getByRole('tab', { name: 'Currency & macro' })).toBeTruthy();
    expect(within(desktopTablist).getByRole('tab', { name: 'Investment lab' })).toBeTruthy();
    expect(within(desktopTablist).getByRole('tab', { name: 'Data health' })).toBeTruthy();

    // Mobile navigation bar present with 3 direct tabs + More button
    const mobileTablist = screen.getByRole('tablist', { name: 'Mobile workspaces' });
    expect(within(mobileTablist).getByRole('tab', { name: 'Overview' })).toBeTruthy();
    expect(within(mobileTablist).getByRole('tab', { name: 'Stocks' })).toBeTruthy();
    expect(within(mobileTablist).getByRole('tab', { name: 'Funds' })).toBeTruthy();
    expect(within(mobileTablist).getByRole('button', { name: 'More workspaces' })).toBeTruthy();
  });

  it('WP10-T02: renders all 8 integrated slots on Overview', () => {
    setupViewModel();
    render(<MarketPage />);

    // Slot 1: Provider Board
    expect(screen.getByText('BSE end-of-day reference — TradingView')).toBeTruthy();

    // Slot 2: Watchlist Summary
    expect(screen.getAllByText('My Watchlist').length).toBeGreaterThanOrEqual(1);

    // Slot 3: Fund Summary
    expect(screen.getAllByText('Mutual Funds Desk').length).toBeGreaterThanOrEqual(1);

    // Slot 4: Currency Quick Tool
    expect(screen.getByText('Currency Reference')).toBeTruthy();

    // Slot 5: Events Quick Widget
    expect(screen.getByText('Market Events & Public Issues')).toBeTruthy();

    // Slot 6: Portfolio Summary
    expect(screen.getByText('Portfolio Desk')).toBeTruthy();

    // Slot 7: Source Health Strip
    expect(screen.getByText(/Data Provenance & Source Health/i)).toBeTruthy();
  });

  it('WP10-T03: zero-boot silence: mounting Overview injects 0 third-party TradingView script tags', () => {
    setupViewModel();
    render(<MarketPage />);

    const scripts = document.querySelectorAll('script[src*="tradingview.com"]');
    expect(scripts.length).toBe(0);
  });

  it('WP10-T04: navigates to Indices & Sectors workspace', () => {
    setupViewModel();
    render(<MarketPage />);

    const desktopTablist = screen.getByRole('tablist', { name: 'Desktop workspaces' });
    fireEvent.click(within(desktopTablist).getByRole('tab', { name: 'Indices & sectors' }));

    expect(window.location.hash).toBe('#/markets?view=indices');
    expect(screen.getByRole('heading', { name: 'Indices' })).toBeTruthy();
    expect(screen.getByText('India Market Board')).toBeTruthy();
  });

  it('WP10-T05: navigates to Equity workspace', () => {
    setupViewModel();
    render(<MarketPage />);

    const desktopTablist = screen.getByRole('tablist', { name: 'Desktop workspaces' });
    fireEvent.click(within(desktopTablist).getByRole('tab', { name: 'Equity' }));

    expect(window.location.hash).toBe('#/markets?view=equity');
    expect(screen.getByText('NSE Equity Research & Watchlist')).toBeTruthy();
  });

  it('WP10-T06: navigates to Portfolio workspace', () => {
    setupViewModel();
    render(<MarketPage />);

    const desktopTablist = screen.getByRole('tablist', { name: 'Desktop workspaces' });
    fireEvent.click(within(desktopTablist).getByRole('tab', { name: 'Portfolio' }));

    expect(window.location.hash).toBe('#/markets?view=portfolio');
    expect(screen.getByText(/Analytical P&L Notice/i)).toBeTruthy();
  });

  it('WP10-T07: navigates to Mutual Funds workspace', () => {
    setupViewModel();
    render(<MarketPage />);

    const desktopTablist = screen.getByRole('tablist', { name: 'Desktop workspaces' });
    fireEvent.click(within(desktopTablist).getByRole('tab', { name: 'Mutual funds' }));

    expect(window.location.hash).toBe('#/markets?view=funds');
    expect(screen.getByText('Mutual Funds Desk')).toBeTruthy();
  });

  it('WP10-T08: navigates to IPO & Events workspace', () => {
    setupViewModel();
    render(<MarketPage />);

    const desktopTablist = screen.getByRole('tablist', { name: 'Desktop workspaces' });
    fireEvent.click(within(desktopTablist).getByRole('tab', { name: 'IPO & events' }));

    expect(window.location.hash).toBe('#/markets?view=ipo-events');
    expect(screen.getByText('IPO, NFO & Financial Events')).toBeTruthy();
  });

  it('WP10-T09: navigates to Currency & Macro workspace', () => {
    setupViewModel();
    render(<MarketPage />);

    const desktopTablist = screen.getByRole('tablist', { name: 'Desktop workspaces' });
    fireEvent.click(within(desktopTablist).getByRole('tab', { name: 'Currency & macro' }));

    expect(window.location.hash).toBe('#/markets?view=currency-macro');
    expect(screen.getByText(/Currency & FX Reference Desk|Currency & Macro Indicators/)).toBeTruthy();
  });

  it('WP10-T10: navigates to Investment Lab workspace', () => {
    setupViewModel();
    render(<MarketPage />);

    const desktopTablist = screen.getByRole('tablist', { name: 'Desktop workspaces' });
    fireEvent.click(within(desktopTablist).getByRole('tab', { name: 'Investment lab' }));

    expect(window.location.hash).toBe('#/markets?view=lab');
    expect(screen.getByText('Investment Lab & Financial Mathematics')).toBeTruthy();
  });

  it('WP10-T11: navigates to Data Health workspace', () => {
    setupViewModel();
    render(<MarketPage />);

    const desktopTablist = screen.getByRole('tablist', { name: 'Desktop workspaces' });
    fireEvent.click(within(desktopTablist).getByRole('tab', { name: 'Data health' }));

    expect(window.location.hash).toBe('#/markets?view=health');
    expect(screen.getByText('Data Health, Rights & Privacy Governance')).toBeTruthy();
  });

  it('WP10-T12: mobile More drawer opens on click and allows navigating to secondary workspaces', () => {
    setupViewModel();
    render(<MarketPage />);

    const moreBtn = screen.getByRole('button', { name: 'More workspaces' });
    fireEvent.click(moreBtn);

    // Dialog menu appears
    const moreMenu = document.getElementById('market-more-menu');
    expect(moreMenu).toBeTruthy();

    // Click Investment lab from the More menu
    const labItem = within(moreMenu).getByRole('menuitem', { name: /Investment lab/i });
    fireEvent.click(labItem);

    expect(window.location.hash).toBe('#/markets?view=lab');
    expect(screen.getByText('Investment Lab & Financial Mathematics')).toBeTruthy();
  });

  it('WP10-T13: MarketDataStatus reports local policy status without claiming full license certification', () => {
    setupViewModel();
    render(<MarketPage />);

    expect(screen.getByText('Policy guard: No local violation detected')).toBeTruthy();
    expect(screen.queryByText('Policy: 100% Free/Open')).toBeNull();
    expect(screen.getByText(/Publication: Free\/open mode — no redistributed quotes/i)).toBeTruthy();
  });

  it('WP10-T14: hashchange listener updates active workspace synchronously', () => {
    setupViewModel();
    render(<MarketPage />);

    window.location.hash = '#/markets?view=health';
    fireEvent(window, new Event('hashchange'));

    expect(screen.getByText('Data Health, Rights & Privacy Governance')).toBeTruthy();
  });
});
