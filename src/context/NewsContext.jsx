/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { load as loadSectionsDataset } from '../data/datasets/sectionsDataset.js';
import { getSettings, incrementViewCount } from '../utils/storage';
import { useSettings } from './SettingsContext';
import { runFullAudit } from '../utils/newsAudit';
import { getRuntimeCapabilities } from '../runtime/runtimeCapabilities';
import { loadFreshBreakingItems } from '../adapters/breakingSnapshotFetcher';
import { mergeBreakingNews } from '../services/breakingNewsService';

const NewsContext = createContext();

const SECTION_IDS = [
    'world',
    'india',
    'chennai',
    'trichy',
    'local',
    'social',
    'entertainment',
    'business',
    'technology',
];

const RESUME_SYNC_MIN_AGE_MS = 60 * 1000;

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function asRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function projectSectionsEnvelope(envelope) {
    const data = asRecord(envelope?.data);
    const sections = asRecord(data.sections);
    return {
        ...sections,
        frontPage: asArray(data.frontPage),
    };
}

function hasRenderableNews(value) {
    const newsData = asRecord(value);
    if (asArray(newsData.frontPage).length > 0) return true;
    return SECTION_IDS.some(section => asArray(newsData[section]).length > 0);
}

function envelopeErrors(envelope) {
    const failures = asArray(envelope?.data?.failedSections);
    return Object.fromEntries(
        failures
            .filter(item => item?.section)
            .map(item => [item.section, item.error || 'section unavailable'])
    );
}

function deriveClientBreaking(newsData) {
    return asArray(newsData?.frontPage)
        .filter(item => item?.isBreaking || Number(item?.breakingScore || 0) > 1.5)
        .sort((a, b) => Number(b?.breakingScore || 0) - Number(a?.breakingScore || 0))
        .slice(0, 3);
}

export function NewsProvider({ children }) {
    const { settingsVersion } = useSettings();
    const prevVersion = useRef(settingsVersion);
    const newsDataRef = useRef({});
    const lastFetchRef = useRef(0);
    const inFlightRef = useRef(null);

    const [envelope, setEnvelope] = useState(null);
    const [newsData, setNewsData] = useState({});
    const [snapshotBreaking, setSnapshotBreaking] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadedSections, setLoadedSections] = useState([]);
    const [errors, setErrors] = useState({});
    const [lastFetch, setLastFetch] = useState(0);
    const [lastSyncReason, setLastSyncReason] = useState(null);
    const [auditResults, setAuditResults] = useState({});

    useEffect(() => {
        newsDataRef.current = newsData;
    }, [newsData]);

    useEffect(() => {
        lastFetchRef.current = lastFetch;
    }, [lastFetch]);

    const applyEnvelope = useCallback((nextEnvelope, reason) => {
        const projected = projectSectionsEnvelope(nextEnvelope);
        const hasNext = hasRenderableNews(projected);
        const hasPrevious = hasRenderableNews(newsDataRef.current);
        const nextErrors = envelopeErrors(nextEnvelope);

        if (!hasNext && hasPrevious) {
            const retainedError = nextEnvelope?.error || 'sections_refresh_empty';
            setErrors(prev => ({
                ...prev,
                ...nextErrors,
                authority: retainedError,
            }));
            setLastSyncReason(reason);
            return {
                ...nextEnvelope,
                ok: false,
                retainedLastKnownGood: true,
                error: retainedError,
            };
        }

        setEnvelope(nextEnvelope);
        setNewsData(projected);
        newsDataRef.current = projected;
        setErrors(nextErrors);
        setLoadedSections(SECTION_IDS.filter(section => Object.prototype.hasOwnProperty.call(projected, section)));

        const frontPageIds = asArray(projected.frontPage).map(item => item?.id).filter(Boolean);
        if (frontPageIds.length > 0) incrementViewCount(frontPageIds);

        const completedAt = Date.now();
        setLastFetch(completedAt);
        lastFetchRef.current = completedAt;
        setLastSyncReason(reason);
        return nextEnvelope;
    }, []);

    const refreshNews = useCallback((specificSections = null, options = {}) => {
        const force = options?.force !== false;
        const reason = options?.reason || (Array.isArray(specificSections) && specificSections.length > 0
            ? 'manual-section-refresh'
            : 'manual-refresh');

        if (inFlightRef.current) return inFlightRef.current;

        setLoading(true);
        const request = loadSectionsDataset({
            sections: SECTION_IDS,
            maxSections: SECTION_IDS.length,
            frontPageLimit: 25,
            forceRefresh: force,
        })
            .then(nextEnvelope => applyEnvelope(nextEnvelope, reason))
            .catch(error => {
                const message = error?.message || String(error);
                setErrors(prev => ({ ...prev, authority: message }));
                throw error;
            })
            .finally(() => {
                if (inFlightRef.current === request) inFlightRef.current = null;
                setLoading(false);
            });

        inFlightRef.current = request;
        return request;
    }, [applyEnvelope]);

    const loadSection = useCallback(async (section) => {
        if (asArray(newsDataRef.current?.[section]).length > 0) return envelope;
        return refreshNews(null, { force: true, reason: `load-section:${section}` });
    }, [envelope, refreshNews]);

    useEffect(() => {
        if (lastFetch === 0) return undefined;

        const timer = setTimeout(async () => {
            try {
                const settings = getSettings();
                const results = await runFullAudit(newsDataRef.current, settings);
                setAuditResults(prev => ({ ...prev, ...results }));
            } catch (err) {
                console.error('[NewsContext] Audit failed:', err);
            }
        }, 3000);

        return () => clearTimeout(timer);
    }, [lastFetch]);

    useEffect(() => {
        if (prevVersion.current !== settingsVersion) {
            prevVersion.current = settingsVersion;
            refreshNews(null, { force: true, reason: 'settings-change' }).catch(() => {});
        }
    }, [settingsVersion, refreshNews]);

    useEffect(() => {
        let cancelled = false;
        const BREAKING_POLL_MS = 4 * 60 * 1000;

        const pullBreaking = async () => {
            try {
                const items = await loadFreshBreakingItems({ force: true });
                if (!cancelled) setSnapshotBreaking(items);
            } catch (err) {
                if (!cancelled) {
                    console.warn('[NewsContext] breaking snapshot poll failed:', err?.message || err);
                }
            }
        };

        pullBreaking();
        const breakingTimer = setInterval(pullBreaking, BREAKING_POLL_MS);

        return () => {
            cancelled = true;
            clearInterval(breakingTimer);
        };
    }, []);

    useEffect(() => {
        refreshNews(null, { force: true, reason: 'boot' }).catch(() => {});

        const { isStaticHost } = getRuntimeCapabilities();
        const refreshIntervalMs = isStaticHost ? 15 * 60 * 1000 : 5 * 60 * 1000;
        const interval = setInterval(() => {
            refreshNews(null, { force: true, reason: 'interval' }).catch(() => {});
        }, refreshIntervalMs);

        return () => clearInterval(interval);
    }, [refreshNews]);

    useEffect(() => {
        if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;

        const syncIfStale = (reason, force = false) => {
            if (document.visibilityState === 'hidden') return;
            const ageMs = Date.now() - Number(lastFetchRef.current || 0);
            if (!force && lastFetchRef.current > 0 && ageMs < RESUME_SYNC_MIN_AGE_MS) return;
            refreshNews(null, { force: true, reason }).catch(() => {});
        };

        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible') syncIfStale('visibility-resume');
        };
        const onPageShow = event => syncIfStale(event?.persisted ? 'pageshow-bfcache' : 'pageshow');
        const onOnline = () => syncIfStale('network-online', true);

        document.addEventListener('visibilitychange', onVisibilityChange);
        window.addEventListener('pageshow', onPageShow);
        window.addEventListener('online', onOnline);

        return () => {
            document.removeEventListener('visibilitychange', onVisibilityChange);
            window.removeEventListener('pageshow', onPageShow);
            window.removeEventListener('online', onOnline);
        };
    }, [refreshNews]);

    const breakingNews = useMemo(
        () => mergeBreakingNews(deriveClientBreaking(newsData), snapshotBreaking),
        [newsData, snapshotBreaking]
    );

    const value = useMemo(() => ({
        envelope,
        authority: envelope?.data?.authority || null,
        freshness: envelope?.freshness || null,
        newsData,
        loading,
        errors,
        refreshNews,
        breakingNews,
        lastFetch,
        lastSyncReason,
        loadSection,
        loadedSections,
        auditResults,
    }), [
        envelope,
        newsData,
        loading,
        errors,
        refreshNews,
        breakingNews,
        lastFetch,
        lastSyncReason,
        loadSection,
        loadedSections,
        auditResults,
    ]);

    return (
        <NewsContext.Provider value={value}>
            {children}
        </NewsContext.Provider>
    );
}

export function useNews() {
    return useContext(NewsContext);
}

export const __newsContextInternalsForTest = {
    SECTION_IDS,
    RESUME_SYNC_MIN_AGE_MS,
    projectSectionsEnvelope,
    hasRenderableNews,
    envelopeErrors,
    deriveClientBreaking,
};
