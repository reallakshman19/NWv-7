// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MarketIndexProviderBoard } from './MarketIndexProviderBoard.jsx';
import { MarketDeskOverview } from './MarketDeskOverview.jsx';
import { freeOpenMarketPayload } from '../../../services/marketFreeOpenPolicy.js';

afterEach(() => cleanup());

function hostedScript(container) {
  return container.querySelector('script[src="https://s3.tradingview.com/external-embedding/embed-widget-market-overview.js"]');
}

describe('Market R4 — Weather-parity index recovery', () => {
  it('renders a provider-owned India index board rather than four empty native cards', () => {
    const { container } = render(<MarketDeskOverview data={freeOpenMarketPayload()} hideNav />);
    const board = container.querySelector('[data-market-index-board="provider"]');
    expect(board).toBeTruthy();
    expect(container.querySelectorAll('.md3-pulse-row')).toHaveLength(0);
    expect(board.textContent).not.toMatch(/No saved value|No qualified index/i);
    const script = hostedScript(board);
    expect(script).toBeTruthy();
    const config = JSON.parse(script.textContent);
    expect(config.tabs).toHaveLength(1);
    expect(config.tabs[0].symbols.map(item => item.s)).toEqual([
      'NSE:NIFTY', 'BSE:SENSEX', 'NSE:BANKNIFTY', 'BSE:BSE500',
    ]);
    expect(config.showChart).toBe(false);
    expect(board.querySelectorAll('a[target="_blank"]')).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Reload index provider board' })).toBeTruthy();
  });

  it('fails gracefully when the third-party widget script is blocked', () => {
    const { container } = render(<MarketIndexProviderBoard />);
    act(() => fireEvent.error(hostedScript(container)));
    expect(screen.getByRole('status').textContent).toMatch(/Provider embed blocked/i);
    expect(container.querySelectorAll('.md3-index-hosted__sources a')).toHaveLength(4);
    expect(screen.getByRole('link', { name: /NIFTY 50/ }).getAttribute('href'))
      .toBe('https://www.nseindia.in/market-data/live-market-indices');
    expect(screen.getByRole('link', { name: /BSE 500/ }).getAttribute('href'))
      .toMatch(/^https:\/\/www\.bseindices\.com\//);
  });

  it('reloads a fresh embed on user action rather than misleadingly claiming native market refresh', () => {
    const { container } = render(<MarketIndexProviderBoard />);
    const first = hostedScript(container);
    act(() => fireEvent.load(first));
    expect(screen.getByRole('status').textContent).toMatch(/Widget loaded/i);
    fireEvent.click(screen.getByRole('button', { name: 'Reload index provider board' }));
    const second = hostedScript(container);
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
    expect(screen.getByRole('status').textContent).toMatch(/Connecting/i);
    expect(container.querySelectorAll('.md3-index-hosted__sources a')).toHaveLength(4);
  });

  it('never turns a free-only injected quote into a displayed native number', () => {
    const invalid = {
      ...freeOpenMarketPayload(),
      indices: [{ name: 'NIFTY 50', symbol: '^NSEI', value: 1234567,
        quoteAt: new Date().toISOString(), sourceProvider: 'unverified' }],
    };
    const { container } = render(<MarketDeskOverview data={invalid} hideNav />);
    expect(container.textContent).not.toContain('12,34,567');
    expect(hostedScript(container)).toBeTruthy();
  });

  it('does not alter the verified last-good value when a qualified native observation exists', () => {
    const quoteAt = new Date(Date.now() - 3600000).toISOString();
    const data = {
      sourceMode: 'stale-cache',
      indices: [{ name: 'NIFTY 50', symbol: '^NSEI', value: 24850.5,
        quoteAt, source: 'verified source' }],
    };
    const { container } = render(<MarketDeskOverview data={data} hideNav />);
    expect(container.querySelector('.md3-pulse-list').textContent).toContain('24,850.5');
    expect(container.querySelector('.md3-pulse-list time').getAttribute('datetime')).toBe(quoteAt);
    expect(hostedScript(container)).toBeNull();
  });
});
