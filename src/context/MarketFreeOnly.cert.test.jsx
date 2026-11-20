// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MarketProvider, useMarket } from './MarketContext.jsx';
import { fetchAllMarketData } from '../services/indianMarketStableService.js';
import { getIdbCache, setIdbCache } from '../services/indexedDbCache.js';

vi.mock('../services/indexedDbCache.js', () => ({ getIdbCache: vi.fn(), setIdbCache: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  getIdbCache.mockResolvedValue({ schemaVersion: 'old', indices: [{ name: 'NIFTY', value: 12345 }] });
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('rejects previous quotes and avoids cache/network, including force and legacy opt-in', async () => {
  for (const options of [{}, { forceRefresh: true, allowLegacyLive: true, previousData: { indices: [{ name: 'NIFTY', value: 12345 }] } }]) {
    const data = await fetchAllMarketData(options);
    expect(data.sourceMode).toBe('free-open-only');
    expect(data.indices).toEqual([]);
    expect(data.equities).toEqual([]);
  }
  expect(getIdbCache).not.toHaveBeenCalled();
  expect(setIdbCache).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it('never rehydrates previous quotes on provider boot or refresh', async () => {
  const { result } = renderHook(useMarket, { wrapper: MarketProvider });
  act(() => result.current.ensureBoot());
  await waitFor(() => expect(result.current.marketData?.sourceMode).toBe('free-open-only'));
  await act(async () => { await result.current.refreshMarket(); });
  expect(result.current.marketData.indices).toEqual([]);
  expect(result.current.loading).toBe(false);
  expect(getIdbCache).not.toHaveBeenCalled();
  expect(setIdbCache).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
