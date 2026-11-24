// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MarketPage from './MarketPage.jsx';
import { macroStore } from '../market/features/macro/macroStore.js';
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

    // Slot 3: Fund lookup
    expect(screen.getByRole('textbox', { name: 'Scheme name or code' })).toBeTruthy();

    // Slot 4: Currency Quick Tool
    expect(screen.getByText('Currency calculator').parentElement.open).toBe(false);
    expect(screen.queryByRole('heading', { name: 'India Market Desk' })).toBeNull();

    // Slot 5: Events Quick Widget
    expect(screen.getByText('Market Events & Public Issues')).toBeTruthy();

    // Slot 6: Portfolio Summary
    expect(screen.getByText('Portfolio Desk')).toBeTruthy();

    // Slot 7: Source Health Strip
    expect(screen.getByText(/Data Provenance & Source Health/i)).toBeTruthy();
  });

  it('WP10-T03: only the authorized branded index board may load on Market Overview', () => {
    setupViewModel();
    render(<MarketPage />);

    const scripts = document.querySelectorAll('script[src*="tradingview.com"]');
    expect(scripts.length).toBe(1);
    expect(scripts[0].src).toBe('https://s3.tradingview.com/external-embedding/embed-widget-market-overview.js');
    const config = JSON.parse(scripts[0].textContent);
    expect(config.tabs[0].symbols.map(item => item.s)).toEqual([
      'NSE:NIFTY', 'BSE:SENSEX', 'NSE:BANKNIFTY', 'BSE:BSE500',
    ]);
    expect(document.querySelectorAll('[data-market-index-board="provider"]')).toHaveLength(1);
  });

  it('loads the allowed FX reference once and keeps fund lookups and widgets user-triggered', async () => {
    setupViewModel();
    const now = new Date();
    const providerDate = new Date(now - 86400000).toISOString().slice(0, 10);
    const headline = 'Government publishes the latest fiscal release';
    const fxUrl = 'https://api.frankfurter.dev/v2/rate/usd/inr?providers=ecb';
    const fundUrl = 'https://api.mfapi.in/mf/125497/latest';
    const fetchMock = vi.fn(async url => {
      if (url === fxUrl) return response({ date: providerDate, base: 'USD', quote: 'INR', rate: 92.4 });
      if (url.endsWith('market_economy_news.json')) return response({
        schemaVersion: 'market-economy-news-v1', checkedAt: now.toISOString(),
        items: [{
          id: '2331234', headline, ministry: 'Ministry of Finance', publishedOn: providerDate,
          url: 'https://www.pib.gov.in/PressReleaseDetail.aspx?PRID=2331234&lang=1&reg=20'
        }, ...[2331235, 2331236, 2331237].map(id => ({
          id: String(id), headline: 'Other official release ' + id,
          ministry: 'Ministry of Finance', publishedOn: providerDate,
          url: 'https://www.pib.gov.in/PressReleaseDetail.aspx?PRID=' + id + '&lang=1&reg=20'
        }))]
      });
      if (url === fundUrl) return response({
        status: 'SUCCESS',
        meta: { scheme_code: 125497, scheme_name: 'Example Fund - Direct Plan - Growth' },
        data: [{ date: providerDate, nav: '92.50' }]
      });
      throw new Error('Unexpected provider call: ' + url);
    });
    const response = payload => ({ ok: true, status: 200, json: async () => payload });
    vi.stubGlobal('fetch', fetchMock);
    macroStore.init();
    try {
      const page = render(<React.StrictMode><MarketPage /></React.StrictMode>);

      expect(await screen.findByText(/ECB-derived cross via Frankfurter/)).toBeTruthy();
      expect((await screen.findByRole('link', { name: headline })).getAttribute('href'))
        .toBe('https://www.pib.gov.in/PressReleaseDetail.aspx?PRID=2331234&lang=1&reg=20');
      expect(screen.queryByRole('link', { name: 'Other official release 2331237' })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Show all 4 headlines' }));
      expect(screen.getByRole('link', { name: 'Other official release 2331237' })).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Show fewer headlines' }));
      expect(screen.queryByRole('link', { name: 'Other official release 2331237' })).toBeNull();
      expect(fetchMock.mock.calls.filter(([url]) => url === fxUrl)).toHaveLength(1);
      expect(fetchMock.mock.calls.some(([url]) => /omr\/inr|mfapi|tradingview/.test(url))).toBe(false);

      fireEvent.change(screen.getByRole('textbox', { name: 'Scheme name or code' }), { target: { value: '125497' } });
      fireEvent.click(screen.getByRole('button', { name: 'Search funds' }));
      expect(await screen.findByText('Example Fund - Direct Plan - Growth')).toBeTruthy();
      expect(screen.getByText(/Latest reported NAV/)).toBeTruthy();
      expect(fetchMock.mock.calls.filter(([url]) => url === fundUrl)).toHaveLength(1);

      page.unmount();
      fetchMock.mockImplementation(async () => { throw new Error('offline'); });
      render(<MarketPage />);
      expect(await screen.findByText('Showing retained official releases.')).toBeTruthy();
      expect(screen.getByRole('link', { name: headline })).toBeTruthy();
      expect(screen.getByText(/ECB-derived cross via Frankfurter/)).toBeTruthy();
    } finally {
      cleanup();
      localStorage.clear();
      macroStore.init();
      vi.unstubAllGlobals();
    }
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

    expect(screen.queryByText('Policy guard: No local violation detected')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Data status' }));
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
