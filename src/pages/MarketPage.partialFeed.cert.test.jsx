// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMarket } from '../context/MarketContext';
import { useMarketPageViewModel } from '../viewModels/useMarketPageViewModel.js';
import { formatMarketTimestamp, getMarketSessionState, getOldestMarketQuoteAt } from '../utils/marketSession.js';
import MarketPage from './MarketPage';

vi.mock('../context/MarketContext', () => ({ useMarket: vi.fn() }));
vi.mock('../viewModels/useMarketPageViewModel.js', () => ({ useMarketPageViewModel: vi.fn() }));
vi.mock('../components/Header', () => ({ DataStatePill: ({ label }) => <span>{label}</span> }));
vi.mock('../components/market/IndiaMarketTools.jsx', () => ({ default: () => null, NewFundOffers: () => null }));
vi.mock('../components/audit/GradeBadge.jsx', () => ({ default: () => null }));

const collectedAt = Date.parse('2026-11-19T05:05:00Z');
const indiaQuote = {
  name: 'NIFTY 50', value: '25,000.25', change: '7.50', changePercent: '0.03',
  sourceMode: 'yahoo-free-daily', quoteAt: '2026-11-18T10:00:00Z',
};
const globalQuote = {
  name: 'S&P 500', value: '6,250.25', change: '-1.50', changePercent: '-0.02',
  sourceProvider: 'yahoo-quote-query1-direct', quoteAt: '2026-11-18T21:00:00Z',
};

function renderMarket({ indiaRows = [indiaQuote], globalRows = [globalQuote], marketSettings = {}, loading = false, sourceMode = 'snapshot' } = {}) {
  const sourceHealth = { indices: { status: sourceMode === 'cache' ? 'live' : sourceMode } };
  const marketData = { indices: indiaRows, globalIndices: globalRows, fetchedAt: collectedAt, sourceMode, sourceHealth };
  const refreshMarket = vi.fn();
  useMarket.mockReturnValue({ marketData });
  useMarketPageViewModel.mockReturnValue({
    marketData,
    rawMarketData: marketData,
    marketSettings: {
      showGainers: false, showLosers: false, showSectorals: false, showMutualFunds: false, showIPO: false, ...marketSettings,
    },
    displayedPrimaryIndices: indiaRows,
    globalIndices: globalRows,
    sectoralIndices: [],
    heroSeries: [],
    mood: { tone: 'neutral', label: 'Mixed market tone' },
    sourceHealth,
    sessionState: getMarketSessionState({ now: new Date(collectedAt), quoteAt: getOldestMarketQuoteAt(indiaRows) }),
    trackedIndexBreadth: { rising: 1, falling: 0, flat: 0, unknown: 1 },
    navSections: [],
    loading,
    refreshMarket,
    helpers: {
      getFloat: Number,
      getMarketToneClass: () => 'market-tone--neutral',
      hasUsableSectionData: data => Array.isArray(data) && data.length > 0,
    },
  });
  const { container } = render(<MarketPage />);
  return { container, refreshMarket };
}

afterEach(cleanup);

describe('Market partial-feed rendering', () => {
  it('keeps global quotes visible when India rows are missing or malformed', () => {
    const { container } = renderMarket({ indiaRows: [null, 5, { name: 'NIFTY 50', value: {} }], globalRows: [null, globalQuote] });
    expect(screen.queryByRole('heading', { name: 'Market pulse' })).toBeNull();
    const globalPanel = within(container.querySelector('.market-hero-side'));
    expect(globalPanel.getByText('S&P 500')).toBeTruthy();
    expect(globalPanel.getByText(`Quote as of ${formatMarketTimestamp(globalQuote.quoteAt)}`)).toBeTruthy();
  });

  it('respects independent India and Global display settings', () => {
    renderMarket({ marketSettings: { showIndices: false } });
    expect(screen.queryByRole('heading', { name: 'Market pulse' })).toBeNull();
    expect(screen.getByText('Global context')).toBeTruthy();
    cleanup();

    renderMarket({ marketSettings: { showGlobalIndices: false } });
    expect(screen.getByRole('heading', { name: 'Market pulse' })).toBeTruthy();
    expect(screen.queryByText('Global context')).toBeNull();
  });

  it('keeps quote age, source mode and source time distinct', () => {
    const { container } = renderMarket({ indiaRows: [null, indiaQuote] });
    const panel = within(container.querySelector('.market-hero-panel'));
    expect(panel.getByText(`Daily · ${formatMarketTimestamp(indiaQuote.quoteAt)}`)).toBeTruthy();
    expect(panel.getByText('Feed timestamp')).toBeTruthy();
    expect(panel.getByText(formatMarketTimestamp(collectedAt))).toBeTruthy();
    expect(panel.getByText('19h ago')).toBeTruthy();
    expect(panel.getByText('Snapshot')).toBeTruthy();
    expect(panel.getByText('Regular NSE Hours')).toBeTruthy();
    expect(panel.getByText('1 rising · 0 falling · 0 flat · 1 unknown')).toBeTruthy();
    expect(screen.queryByText(/^live$/i)).toBeNull();
  });

  it('disables sticky refresh while loading and suppresses a seed payload', () => {
    const { refreshMarket } = renderMarket({ loading: true, sourceMode: 'seed' });
    const refreshButton = screen.getByRole('button', { name: 'Refresh market data' });
    expect(refreshButton.disabled).toBe(true);
    fireEvent.click(refreshButton);
    expect(refreshMarket).not.toHaveBeenCalled();
    expect(screen.getByText('Unavailable', { selector: '.market-sticky-header__title-row span' })).toBeTruthy();
    expect(screen.queryByText('25,000.25')).toBeNull();
    expect(screen.queryByText('6,250.25')).toBeNull();
  });

  it('suppresses explicitly seeded rows in a cached payload', () => {
    const seed = { name: 'NIFTY 50', value: '22,340.55', sourceMode: 'seed' };
    const { container } = renderMarket({ indiaRows: [seed, indiaQuote], sourceMode: 'cache' });
    expect(screen.queryByText(seed.value)).toBeNull();
    expect(within(container.querySelector('.market-hero-panel')).getByText(indiaQuote.value)).toBeTruthy();
  });
});
