import { MARKET_FREE_OPEN_ONLY, freeOpenMarketPayload } from '../services/marketFreeOpenPolicy.js';
import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { getIdbCache, setIdbCache } from '../services/indexedDbCache.js';
import { fetchAllMarketData, sanitizeMarketPayload } from '../services/indianMarketStableService.js';
import {
    getMarketPayloadAgeMs,
    isMarketPayloadUsable,
    MARKET_CONTEXT_CACHE_KEY,
    MARKET_CACHE_SCHEMA_VERSION,
    MARKET_FRESH_CACHE_TTL_MS,
    shouldRejectMarketPayload,
} from '../services/marketTrust.js';
import { isLiveMode } from '../utils/fetchMode.js';

const MarketContext = createContext(null);
/* eslint-disable react-refresh/only-export-components */

async function readContextCache() {
    try {
        const cached = await getIdbCache(MARKET_CONTEXT_CACHE_KEY);
        if (cached?.schemaVersion !== MARKET_CACHE_SCHEMA_VERSION) return null;

        const data = sanitizeMarketPayload(cached);
        return shouldRejectMarketPayload(data, { allowSeed: false }).reject ? null : data;
    } catch {
        return null;
    }
}

export function MarketProvider({ children }) {
    const [marketData, setMarketData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [booted, setBooted] = useState(false);
    const bootStarted = useRef(false);
    const bootRequest = useRef(null);
    const activeRefresh = useRef(null);
    const lastData = useRef(null);

    const loadMarketData = useCallback(async (forceRefresh) => {
        setLoading(true);
        setError(null);
        // The normal stored/cache branch can contain former Yahoo/AMFI quotes.
        // In public free/open mode never rehydrate or show those historic values.
        if (MARKET_FREE_OPEN_ONLY) {
            const empty = freeOpenMarketPayload();
            lastData.current = empty;
            setMarketData(empty);
            setLoading(false);
            return;
        }

        const showData = (data) => {
            lastData.current = data;
            setMarketData(data);
        };

        const prior = lastData.current || await readContextCache();
        const previousData = shouldRejectMarketPayload(prior, {
            maxAgeMs: 24 * 60 * 60 * 1000,
            allowSeed: false,
        }).reject ? null : prior;
        if (prior && !previousData) showData(null);
        try {
            if (!forceRefresh && !isLiveMode() &&
                getMarketPayloadAgeMs(previousData) < MARKET_FRESH_CACHE_TTL_MS) {
                showData(sanitizeMarketPayload(previousData, 'cache', { sourceHealth: { cache: 'cache' } }));
                return;
            }

            const data = await fetchAllMarketData({ forceRefresh, previousData });
            const message = data.errors?.feed;
            if (!message || isMarketPayloadUsable(data) || !isMarketPayloadUsable(previousData)) {
                showData(data);
            }

            if (message && forceRefresh) throw new Error(message);
            setError(message || null);

            if (data.sourceMode === 'snapshot' || data.sourceMode === 'live') {
                try {
                    await setIdbCache(MARKET_CONTEXT_CACHE_KEY, data);
                } catch {
                    // Storage is optional after displaying a valid payload.
                }
            }
        } catch (err) {
            const message = err?.message || 'Market refresh failed.';
            if (previousData &&
                !shouldRejectMarketPayload(previousData, { maxAgeMs: 24 * 60 * 60 * 1000, allowSeed: false }).reject &&
                (lastData.current === previousData || !isMarketPayloadUsable(lastData.current))) {
                showData(sanitizeMarketPayload(previousData, 'stale-cache', {
                    sourceHealth: { cache: 'stale-cache' },
                    errors: { feed: message },
                }));
            }
            setError(message);
            if (forceRefresh) throw err;
        } finally {
            setLoading(false);
        }
    }, []);

    const ensureBoot = useCallback(() => {
        if (bootStarted.current) return;

        bootStarted.current = true;
        setBooted(true);
        bootRequest.current = loadMarketData(false);
    }, [loadMarketData]);

    const refreshMarket = useCallback(() => {
        if (activeRefresh.current) return activeRefresh.current;

        bootStarted.current = true;
        setBooted(true);
        const request = Promise.resolve(bootRequest.current)
            .then(() => loadMarketData(true))
            .finally(() => {
                activeRefresh.current = null;
            });
        activeRefresh.current = request;
        return request;
    }, [loadMarketData]);

    return (
        <MarketContext.Provider value={{
            marketData,
            loading: booted ? loading : true,
            error,
            lastFetch: marketData?.fetchedAt || null,
            refreshMarket,
            ensureBoot,
            booted
        }}>
            {children}
        </MarketContext.Provider>
    );
}

export function useMarket() {
    const context = useContext(MarketContext);
    if (!context) {
        throw new Error('useMarket must be used within MarketProvider');
    }
    return context;
}
