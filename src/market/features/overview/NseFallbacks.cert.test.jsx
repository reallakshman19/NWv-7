// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NsePersonalQuote, validateNseReply } from './NsePersonalQuote.jsx';
import { TradingViewNseFallback } from './TradingViewNseFallback.jsx';

beforeEach(() => {
  vi.stubEnv('VITE_NSE_PERSONAL_GATEWAY_URL', 'https://private-gateway.example');
});
afterEach(() => {
  cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); document.body.replaceChildren();
});

const eodQuote = {
  symbol: 'RELIANCE', value: 1524.5, priceDate: '2026-11-20',
  sourceTier: 'NSE_EOD_FALLBACK', priceType: 'END_OF_DAY_CLOSE',
  freshness: 'END_OF_DAY', source: 'NSE Bhavcopy MCP',
};

it('client accepts only identified NSE source tier and valid date/price identity', () => {
  expect(validateNseReply({ quote: eodQuote }, 'RELIANCE')).toEqual(eodQuote);
  expect(validateNseReply({ quote: { ...eodQuote, symbol: 'TCS' } }, 'RELIANCE')).toBeNull();
  expect(validateNseReply({ quote: { ...eodQuote, priceDate: '2026-11-31' } }, 'RELIANCE')).toBeNull();
  expect(validateNseReply({ quote: { ...eodQuote, sourceTier: 'NSE_CM_PRIMARY' } }, 'RELIANCE')).toBeNull();
  expect(validateNseReply({ quote: { ...eodQuote, value: -3 } }, 'RELIANCE')).toBeNull();
  expect(validateNseReply({ quote: { symbol: 'RELIANCE', value: 1500, sourceTier: 'NSE_CM_PRIMARY',
    priceType: 'INTRADAY_OBSERVATION', quoteAt: '2026-11-23T08:00:00Z' } }, 'RELIANCE')).not.toBeNull();
});

it('EOD fallback is explicitly NOT LIVE; no quote request before user click', async () => {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ quote: eodQuote }) }));
  vi.stubGlobal('fetch', fetchMock);
  render(<NsePersonalQuote />);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Open delayed provider widget' })).toBeTruthy();
  fireEvent.change(screen.getByPlaceholderText(/Private token/), { target: { value: 'owner-test-token' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Check official NSE sources' })); });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]).toBe('https://private-gateway.example/quote');
  expect(screen.getByText(/Fallback 1 · NSE official end-of-day close/)).toBeTruthy();
  expect(screen.getByText(/Trading date: 2026-11-20 · NOT LIVE/)).toBeTruthy();
  expect(screen.queryByText(/Recent NSE observation/)).toBeNull();
});

it('source failure leaves independent provider fallback available without a quote', async () => {
  const fetchMock = vi.fn(async () => ({ ok: false, status: 502 }));
  vi.stubGlobal('fetch', fetchMock);
  render(<NsePersonalQuote />);
  fireEvent.change(screen.getByPlaceholderText(/Private token/), { target: { value: 'owner-token' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Check official NSE sources' })); });
  expect(screen.getByRole('alert').textContent).toMatch(/Both official NSE MCP sources/);
  expect(screen.getByRole('button', { name: 'Open delayed provider widget' })).toBeTruthy();
  expect(screen.getByRole('link', { name: /Open RELIANCE on official NSE/ })).toBeTruthy();
});

it('TradingView script is strictly opt-in, branded, symbol scoped; hiding removes widget', async () => {
  const { container } = render(<TradingViewNseFallback symbol="RELIANCE" />);
  expect(container.querySelectorAll('script[src*="tradingview.com"]')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Open delayed provider widget' }));
  await waitFor(() => expect(container.querySelectorAll('script[src*="tradingview.com"]')).toHaveLength(1));
  const script = container.querySelector('script[src*="tradingview.com"]');
  expect(script.getAttribute('src')).toBe('https://s3.tradingview.com/external-embedding/embed-widget-symbol-info.js');
  expect(JSON.parse(script.textContent).symbol).toBe('NSE:RELIANCE');
  fireEvent.click(screen.getByRole('button', { name: 'Hide provider widget' }));
  expect(container.querySelectorAll('script[src*="tradingview.com"]')).toHaveLength(0);
});

it('new symbol requires new TradingView opt-in rather than retaining a prior embed', () => {
  const { rerender, container } = render(<TradingViewNseFallback key="RELIANCE" symbol="RELIANCE" />);
  fireEvent.click(screen.getByRole('button', { name: 'Open delayed provider widget' }));
  expect(container.querySelector('script[src*="tradingview.com"]')).toBeTruthy();
  rerender(<TradingViewNseFallback key="TCS" symbol="TCS" />);
  expect(container.querySelector('script[src*="tradingview.com"]')).toBeNull();
  expect(screen.getByRole('button', { name: 'Open delayed provider widget' })).toBeTruthy();
});
