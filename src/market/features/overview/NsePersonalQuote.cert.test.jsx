// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { NsePersonalQuote } from './NsePersonalQuote.jsx';
import { MarketDeskOverview } from './MarketDeskOverview.jsx';
import { freeOpenMarketPayload } from '../../../services/marketFreeOpenPolicy.js';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('NSE quote component does not initiate a browser fetch on mount', () => {
  const fetchImpl = vi.fn();
  vi.stubGlobal('fetch', fetchImpl);
  render(<NsePersonalQuote />);
  expect(screen.getByRole('region', { name: 'NSE personal market quote' })).toBeTruthy();
  expect(screen.getByRole('link', { name: /View NSE equity market at source/ })
    .getAttribute('href')).toBe('https://www.nseindia.in/market-data/live-equity-market');
  expect(fetchImpl).not.toHaveBeenCalled();
});

it('overview retains four source links and presents the official NSE personal panel without Yahoo', () => {
  const fetchImpl = vi.fn();
  vi.stubGlobal('fetch', fetchImpl);
  const { container } = render(<MarketDeskOverview data={freeOpenMarketPayload()} hideNav />);
  expect(screen.getByRole('heading', { name: 'India Market Pulse' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'NSE Official Equity Quote' })).toBeTruthy();
  expect(container.querySelectorAll('.md3-pulse-row')).toHaveLength(4);
  expect(screen.queryByRole('button', { name: 'Check browser-local quotes' })).toBeNull();
  expect(fetchImpl).not.toHaveBeenCalled();
});
