// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MarketDeskOverview } from './MarketDeskOverview.jsx';
import { fetchPersonalMarketPulse } from './personalQuoteOverride.js';
import { freeOpenMarketPayload } from '../../../services/marketFreeOpenPolicy.js';

vi.mock('./personalQuoteOverride.js', () => ({ fetchPersonalMarketPulse: vi.fn() }));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});
afterEach(() => { cleanup(); localStorage.clear(); });

it('does not fetch on mount; explicit override shows the provider quote and timestamp', async () => {
  const row = {
    name: 'NIFTY 50', symbol: '^NSEI', value: 22000.5,
    quoteAt: '2026-11-23T08:00:00.000Z',
    sourceProvider: 'Yahoo Finance (browser-direct)', sourceMode: 'personal-browser-lookup',
  };
  fetchPersonalMarketPulse.mockResolvedValueOnce([row]);
  const { container } = render(<MarketDeskOverview data={freeOpenMarketPayload()} hideNav />);
  expect(fetchPersonalMarketPulse).not.toHaveBeenCalled();
  expect(container.querySelector('.md3-pulse-list').textContent).not.toContain('22,000.5');
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Check browser-local quotes' })); });
  expect(fetchPersonalMarketPulse).toHaveBeenCalledTimes(1);
  expect(container.querySelector('.md3-pulse-list').textContent).toContain('22,000.5');
  expect(container.querySelector('.md3-pulse-list').textContent).toContain('2026-11-23T08:00:00.000Z');
});

it('keeps source links and shows a clear failure when cross-origin direct lookup is blocked', async () => {
  fetchPersonalMarketPulse.mockRejectedValueOnce(new Error('Browser blocked direct quote access'));
  const { container } = render(<MarketDeskOverview data={freeOpenMarketPayload()} hideNav />);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Check browser-local quotes' })); });
  expect(screen.getByRole('alert').textContent).toMatch(/Browser blocked direct quote access/);
  expect(container.querySelectorAll('.md3-pulse-row')).toHaveLength(4);
  expect(container.querySelector('.md3-pulse-list').textContent).toContain('View at source');
});
