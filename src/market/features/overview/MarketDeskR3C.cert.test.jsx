// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketDeskOverview } from './MarketDeskOverview.jsx';
import { healthStore } from '../health/healthStore.js';
import { recordMarketSourceObservation } from '../health/marketSourceRecorder.js';
import { freeOpenMarketPayload } from '../../../services/marketFreeOpenPolicy.js';

describe('Market R3C — actual Overview route acceptance', () => {
  beforeEach(() => {
    localStorage.clear();
    healthStore.refresh();
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
    healthStore.refresh();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders a dense actionable desk rather than fabricated market prices or four blank quote cards', () => {
    const payload = freeOpenMarketPayload();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(<MarketDeskOverview data={payload} hideNav />);
    expect(screen.getByTestId('market-desk-r3c')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Jump to a Market section' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /India Market Pulse/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /My Watchlist/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Portfolio & Investment Lab/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Mutual Fund Quick Search/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Currency Rates/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /BSE Provider Board/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Market Briefing/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Movers & Sector References/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /IPO \/ NFO \/ Verified Events/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Data Provenance & Source Health/ })).toBeTruthy();
    expect(container.querySelectorAll('.md3-pulse-row')).toHaveLength(4);
    expect(screen.getByRole('link', { name: /SENSEX/ }).getAttribute('href'))
      .toBe('https://www.bseindices.com/indices-details/code/16');
    expect(screen.queryByRole('button', { name: /browser-local quotes/i })).toBeNull();
    expect(container.textContent).not.toContain('Quote Unavailable');
    expect(container.textContent).not.toContain('SLA < 24h');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.querySelectorAll('script[src*="tradingview.com"]')).toHaveLength(0);
  });

  it('puts the four main data sections first and lets jump links focus them', () => {
    const { container } = render(<MarketDeskOverview hideNav showSessionHeader={false} />);
    const firstSections = Array.from(container.querySelectorAll('.md3-grid > section h2'))
      .slice(0, 4).map(heading => heading.textContent);
    expect(firstSections).toEqual([
      'India Market Pulse', 'Currency Rates', 'Mutual Fund Quick Search', 'Market Briefing'
    ]);
    expect(screen.queryByRole('heading', { name: 'India Market Desk' })).toBeNull();
    const links = within(screen.getByRole('navigation', { name: 'Jump to a Market section' }));
    fireEvent.click(links.getByRole('button', { name: 'News' }));
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Market Briefing' }));
    fireEvent.click(links.getByRole('button', { name: 'Find fund' }));
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Mutual Fund Quick Search' }));
  });

  it('does not render unlicensed index values even if free-mode payload includes them', () => {
    const { container } = render(<MarketDeskOverview data={{
      ...freeOpenMarketPayload(),
      indices: [{ symbol: '^NSEI', value: 9999999, quoteAt: '2026-11-20', source: 'test' }]
    }} hideNav />);
    expect(container.querySelector('.md3-pulse-list').textContent).not.toContain('9,999,999');
    expect(container.querySelectorAll('.md3-pulse-row')).toHaveLength(4);
  });

  it('shows a retained index value with a clock label and its original quote time', () => {
    const quoteAt = new Date(Date.now() - 86400000).toISOString();
    render(<MarketDeskOverview hideNav data={{
      sourceMode: 'stale-cache',
      indices: [{ symbol: '^NSEI', value: 24850.5, quoteAt, source: 'verified source' }]
    }} />);
    const nifty = screen.getByRole('link', { name: /NIFTY 50/ });
    expect(nifty.textContent).toContain('24,850.5');
    expect(nifty.querySelector('.md3-pulse-history svg')).toBeTruthy();
    expect(nifty.textContent).toContain('Last available');
    expect(nifty.querySelector('time').getAttribute('datetime')).toBe(quoteAt);
    expect(screen.getByRole('link', { name: /SENSEX/ }).textContent).toContain('No saved value');
  });

  it('keeps the official link when the saved observation has expired or has an invalid date', () => {
    const expired = new Date(Date.now() - 6 * 86400000).toISOString();
    render(<MarketDeskOverview hideNav data={{
      sourceMode: 'stale-cache',
      indices: [
        { symbol: '^NSEI', value: 24850.5, quoteAt: expired, source: 'verified source' },
        { symbol: '^BSESN', value: 82500, quoteAt: 'invalid', source: 'verified source' }
      ]
    }} />);
    expect(screen.getByRole('link', { name: /NIFTY 50/ }).textContent).toContain('No saved value');
    expect(screen.getByRole('link', { name: /SENSEX/ }).textContent).toContain('No saved value');
    expect(screen.queryByText('Last available')).toBeNull();
  });

  it('routes key financial actions to canonical nine-workspace destinations', () => {
    const onNavigate = vi.fn();
    render(<MarketDeskOverview data={freeOpenMarketPayload()} hideNav onNavigate={onNavigate} />);
    for (const [name, target] of [
      ['All indices', 'indices'],
      ['Manage Watchlist', 'equity'],
      ['Open Portfolio', 'portfolio'],
      ['Research funds', 'funds'],
      ['All rates', 'currency-macro'],
      ['Launch Calculators', 'lab'],
      ['All Events & News', 'ipo-events'],
      ['Full Health Workspace', 'health']
    ]) {
      fireEvent.click(screen.getByRole('button', { name }));
      expect(onNavigate).toHaveBeenLastCalledWith(target);
    }
  });

  it('updates source evidence after a real receipt and labels empty evidence Not checked', () => {
    const { container } = render(<MarketDeskOverview data={freeOpenMarketPayload()} hideNav />);
    expect(container.querySelector('.md3-health-meta').textContent).toContain('NOT_CHECKED');
    const date = new Date().toISOString().slice(0, 10);
    act(() => {
      const saved = recordMarketSourceObservation({
        sourceId: 'frankfurter', state: 'HISTORICAL', providerAsOf: date,
        sourceUrl: 'https://api.frankfurter.dev/v2/rates?base=omr&quotes=inr'
      });
      expect(saved.ok).toBe(true);
    });
    const summary = container.querySelector('.md3-health-meta').textContent;
    expect(summary).toContain('1 recorded checks');
    expect(summary).toContain('1 dated sources');
  });

  it('gates detailed source cards behind a deliberate action', () => {
    render(<MarketDeskOverview hideNav slots={{ sourceHealth: <div data-testid="source-details">11 source cards</div> }} />);
    const btn = screen.getByRole('button', { name: 'Inspect Health' });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('source-details')).toBeNull();
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('source-details')).toBeTruthy();
    fireEvent.click(btn);
    expect(screen.queryByTestId('source-details')).toBeNull();
  });

  it('contains a broken provider slot without losing currency and holdings tools', () => {
    const onNavigate = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    function Broken() { throw new Error('external provider unavailable'); }
    render(<MarketDeskOverview hideNav onNavigate={onNavigate}
      slots={{ providerBoard: <Broken />, currency: <div>Verified currency tool region</div> }} />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Verified currency tool region')).toBeTruthy();
    consoleError.mockRestore();
  });
});
