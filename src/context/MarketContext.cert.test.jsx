// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketProvider, useMarket } from './MarketContext.jsx';
import { fetchAllMarketData } from '../services/indianMarketStableService.js';
import { getIdbCache, setIdbCache } from '../services/indexedDbCache.js';
import { MARKET_CACHE_SCHEMA_VERSION, MARKET_CONTEXT_CACHE_KEY } from '../services/marketTrust.js';

// These cases certify the isolated legacy refresh machinery, not free-only mode.
vi.mock('../services/marketFreeOpenPolicy.js', async (importOriginal) => ({
    ...await importOriginal(), MARKET_FREE_OPEN_ONLY: false,
}));

vi.mock('../services/indianMarketStableService.js', async (importOriginal) => ({
    ...await importOriginal(),
    fetchAllMarketData: vi.fn(),
}));

vi.mock('../services/indexedDbCache.js', () => ({
    getIdbCache: vi.fn(),
    setIdbCache: vi.fn(),
}));

function dataAt(fetchedAt) {
    return {
        schemaVersion: MARKET_CACHE_SCHEMA_VERSION,
        sourceMode: 'snapshot',
        fetchedAt,
        indices: [{ name: 'NIFTY 50', value: '25,227.95' }],
    };
}

describe('MarketProvider refresh', () => {
    beforeEach(() => {
        fetchAllMarketData.mockReset();
        getIdbCache.mockReset().mockResolvedValue(null);
        setIdbCache.mockReset().mockResolvedValue(undefined);
    });

    afterEach(() => { cleanup(); vi.restoreAllMocks(); });

    it('serializes manual refresh behind boot and coalesces repeated clicks', async () => {
        let completeBoot;
        const initial = dataAt(Date.now() - 180_000);
        const refreshed = dataAt(Date.now() - 60_000);
        fetchAllMarketData
            .mockReturnValueOnce(new Promise((resolve) => { completeBoot = resolve; }))
            .mockResolvedValueOnce(refreshed);
        const { result } = renderHook(useMarket, { wrapper: MarketProvider });

        let refresh;
        act(() => {
            result.current.ensureBoot();
            result.current.ensureBoot();
            refresh = result.current.refreshMarket();
            expect(result.current.refreshMarket()).toBe(refresh);
        });
        await waitFor(() => expect(fetchAllMarketData).toHaveBeenCalledTimes(1));
        expect(fetchAllMarketData.mock.calls[0][0]).toMatchObject({ forceRefresh: false });

        await act(async () => {
            completeBoot(initial);
            await refresh;
        });

        expect(fetchAllMarketData).toHaveBeenCalledTimes(2);
        expect(fetchAllMarketData).toHaveBeenLastCalledWith({ forceRefresh: true, previousData: initial });
        expect(result.current.marketData).toEqual(refreshed);
        expect(result.current.lastFetch).toBe(refreshed.fetchedAt);
        expect(result.current.loading).toBe(false);
    });

    it('exposes a failed refresh and keeps the fallback timestamp through a retry', async () => {
        const initial = dataAt(Date.now() - 180_000);
        const failure = 'Market refresh failed. Showing the last available market data.';
        const stale = { ...initial, sourceMode: 'stale-cache', errors: { feed: failure } };
        const refreshed = dataAt(Date.now() - 60_000);
        fetchAllMarketData.mockResolvedValueOnce(initial).mockResolvedValueOnce(stale).mockResolvedValueOnce(refreshed);
        const { result } = renderHook(useMarket, { wrapper: MarketProvider });

        act(() => result.current.ensureBoot());
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.marketData).toEqual(initial);

        await act(async () => {
            await expect(result.current.refreshMarket()).rejects.toThrow(failure);
        });
        expect(result.current.marketData).toEqual(stale);
        expect(result.current.lastFetch).toBe(initial.fetchedAt);
        expect(result.current.error).toBe(failure);
        expect(setIdbCache).toHaveBeenCalledTimes(1);

        await act(async () => {
            await result.current.refreshMarket();
        });
        expect(result.current.marketData).toEqual(refreshed);
        expect(result.current.error).toBeNull();
    });

    it('keeps a valid quote when the revalidation service throws', async () => {
        const initial = dataAt(Date.now() - 180_000);
        getIdbCache.mockResolvedValueOnce(initial);
        fetchAllMarketData.mockRejectedValueOnce(new Error('Network unavailable'));
        const { result } = renderHook(useMarket, { wrapper: MarketProvider });

        act(() => result.current.ensureBoot());
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(getIdbCache).toHaveBeenCalledWith(MARKET_CONTEXT_CACHE_KEY);
        expect(fetchAllMarketData).not.toHaveBeenCalled();
        expect(result.current.marketData.sourceMode).toBe('cache');

        await act(async () => {
            await expect(result.current.refreshMarket()).rejects.toThrow('Network unavailable');
        });
        expect(result.current.lastFetch).toBe(initial.fetchedAt);
        expect(result.current.marketData.sourceMode).toBe('stale-cache');
        expect(result.current.error).toBe('Network unavailable');
    });


    it('rejects a legacy v3 quote cache instead of silently relabeling it v4', async () => {
        const legacy = { ...dataAt(Date.now() - 120_000), schemaVersion: 'market-v3' };
        getIdbCache.mockResolvedValueOnce(legacy);
        const qualified = dataAt(Date.now() - 60_000);
        fetchAllMarketData.mockResolvedValueOnce(qualified);
        const { result } = renderHook(useMarket, { wrapper: MarketProvider });
        act(() => result.current.ensureBoot());
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(getIdbCache).toHaveBeenCalledWith(MARKET_CONTEXT_CACHE_KEY);
        expect(fetchAllMarketData).toHaveBeenCalledTimes(1);
        expect(fetchAllMarketData).toHaveBeenCalledWith({ forceRefresh: false, previousData: null });
        expect(result.current.marketData).toEqual(qualified);
    });


    it('expires in-memory quotes after a long-open tab, even if the next refresh throws', async () => {
        const now = Date.now();
        const initial = dataAt(now - 180_000);
        fetchAllMarketData.mockResolvedValueOnce(initial).mockRejectedValueOnce(new Error('Network unavailable'));
        const { result } = renderHook(useMarket, { wrapper: MarketProvider });
        act(() => result.current.ensureBoot());
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.marketData).toEqual(initial);
        vi.spyOn(Date, 'now').mockReturnValue(now + 25 * 3600_000);
        await act(async () => {
            await expect(result.current.refreshMarket()).rejects.toThrow('Network unavailable');
        });
        expect(fetchAllMarketData).toHaveBeenLastCalledWith({ forceRefresh: true, previousData: null });
        expect(result.current.marketData).toBeNull();
        expect(result.current.lastFetch).toBeNull();
    });
});
