import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSettings } from '../context/SettingsContext';
import { useWatchlist } from '../hooks/useWatchlist';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { useUpAheadExpiry } from '../hooks/useUpAheadExpiry';
import {
  loadFromCache,
  sanitizeUpAheadData,
} from '../services/upAheadService';
import { load as loadUpAhead } from '../data/datasets/upAheadDataset';
import { publishDirectUpAheadEnvelope } from '../data/upAheadDirectPageEvidence.js';
import plannerStorage, {
  getPlannerStorageError,
  isPlannerStorageSuccess,
} from '../utils/plannerStorage';
import { getRuntimeCapabilities } from '../runtime/runtimeCapabilities';
import { DEFAULT_UPAHEAD_SETTINGS, getVisibleUpAheadProjection, buildSuggestedItems, buildCardArticle, formatConciseDate, getEventDateMs } from '../services/upAheadProjection.js';
import { toLocalDateKey } from '../utils/dateKey';
import { upAheadOccurrenceKey } from '../services/upAheadLifecycle.js';
import { buildExplicitPlannerSave } from '../utils/plannerIntelligenceBridge.js';

function normalizePlanDate(dateStr) {
  // Local-calendar keys, consistent with dateAware/plannerStorage; UTC
  // extraction shifted early-morning IST timestamps to the previous day.
  if (!dateStr) return toLocalDateKey(new Date());
  return toLocalDateKey(dateStr) || dateStr;
}

function hasVisibleUpAheadContent(data) {
  if (!data) return false;
  if (Array.isArray(data.timeline) && data.timeline.some(day => (day?.items || []).length > 0)) return true;
  if (data.sections && Object.values(data.sections).some(items => Array.isArray(items) && items.length > 0)) return true;
  return false;
}

function getSourceModeState({ data, runtime, envelope }) {
  const isStaticHost = Boolean(runtime?.isStaticHost);
  if (data?.auditSummary?.fallback === 'festival_calendar'
    || (envelope && envelope.freshness !== 'fresh')) {
    return { modeStr: 'degraded', modeLabel: data?.auditSummary?.fallback === 'festival_calendar' ? 'Calendar fallback' : 'Limited' };
  }
  // The selected envelope is the canonical source family. Payload sourceMode
  // may describe an older retained response and must never promote it to Live.
  if (envelope?.source === 'failed' || envelope?.source === 'unknown') {
    return { modeStr: 'degraded', modeLabel: 'Source unverified' };
  }
  if (envelope?.source === 'seed') {
    return { modeStr: 'degraded', modeLabel: 'Calendar fallback' };
  }
  if (envelope?.source === 'cache') {
    return { modeStr: 'cached', modeLabel: 'Cached' };
  }
  if (envelope?.source === 'snapshot'
      && !['snapshot', 'static', 'dataset-api'].includes(data?.sourceMode)) {
    return { modeStr: 'snapshot', modeLabel: 'Snapshot' };
  }
  if (envelope?.source === 'live'
      && ['snapshot', 'static', 'dataset-api'].includes(data?.sourceMode)) {
    return { modeStr: 'degraded', modeLabel: 'Source mismatch' };
  }

  // A Worker-backed snapshot is a successful dataset API response, not a
  // degraded feed merely because the frontend is hosted on GitHub Pages.
  if (data?.sourceMode === 'dataset-api') {
    return { modeStr: 'snapshot', modeLabel: 'Worker API' };
  }
  if (data?.sourceMode === 'snapshot' || data?.sourceMode === 'static') {
    return { modeStr: 'snapshot', modeLabel: 'Snapshot' };
  }

  if (isStaticHost) {
    return {
      modeStr: data?.sourceMode === 'snapshot' ? 'snapshot' : 'degraded',
      modeLabel: data?.sourceMode === 'snapshot' ? 'Snapshot' : 'Limited',
    };
  }

  return {
    modeStr: data?.sourceMode === 'cache' ? 'cached'
      : data?.sourceMode === 'live' ? 'live' : 'degraded',
    modeLabel: data?.sourceMode === 'cache' ? 'Cached'
      : data?.sourceMode === 'live' ? 'Live' : 'Source unverified',
  };
}

function categoryAcquisitionTotals(acquisitionSummary, categories = []) {
  const byCategory = acquisitionSummary?.byCategory || {};

  return categories.reduce((totals, category) => {
    const row = byCategory?.[category] || {};
    totals.attemptedSources += Number(row.attemptedSources || 0);
    totals.successfulSources += Number(row.successfulSources || 0);
    totals.failedSources += Number(row.failedSources || 0);
    totals.returnedItems += Number(row.returnedItems || 0);
    return totals;
  }, {
    attemptedSources: 0,
    successfulSources: 0,
    failedSources: 0,
    returnedItems: 0,
  });
}

function deriveOfferCapability({
  offers = [],
  acquisitionSummary = null,
  enabled = true,
  categories = [],
  sourceMode = null,
  freshness = 'fresh',
} = {}) {
  // Configuration authority and offer availability are separate. Preserve
  // retained cards but never call them verified without fresh successful sources.
  const counts = categoryAcquisitionTotals(acquisitionSummary, categories);
  if (!enabled) {
    return { status: 'disabled', verified: false, reason: 'category_disabled', counts };
  }

  if (Array.isArray(offers) && offers.length > 0) {
    const verified = freshness === 'fresh' && counts.successfulSources > 0
      && counts.failedSources === 0;
    return {
      status: 'ready',
      verified,
      reason: verified ? 'verified_acquired_results'
        : freshness !== 'fresh' ? 'retained_results_stale' : 'unverified_acquired_results',
      counts,
    };
  }

  if (freshness !== 'fresh') {
    return { status: 'snapshot_unknown', verified: false, reason: 'stale_acquisition_evidence',
      counts: categoryAcquisitionTotals(acquisitionSummary, categories) };
  }

  if (acquisitionSummary?.status === 'blocked') {
    return {
      status: 'unavailable',
      verified: false,
      reason: acquisitionSummary.reason || 'browser_live_blocked',
      counts: categoryAcquisitionTotals(acquisitionSummary, categories),
    };
  }

  if (acquisitionSummary && counts.attemptedSources > 0) {
    if (counts.successfulSources === 0 && counts.failedSources > 0) {
      return {
        status: 'unavailable',
        verified: false,
        reason: 'all_offer_sources_failed',
        counts,
      };
    }

    if (counts.successfulSources > 0 && counts.failedSources > 0) {
      return {
        status: 'partial',
        verified: false,
        reason: 'offer_sources_partial',
        counts,
      };
    }

    if (counts.successfulSources > 0) {
      return {
        status: 'verified_zero',
        verified: true,
        reason: 'successful_offer_sources_zero_matches',
        counts,
      };
    }

    return {
      status: 'unavailable',
      verified: false,
      reason: 'offer_sources_not_usable',
      counts,
    };
  }

  if (sourceMode === 'snapshot' || sourceMode === 'static' || sourceMode === 'cache') {
    return {
      status: 'snapshot_unknown',
      verified: false,
      reason: 'snapshot_has_no_offer_acquisition_evidence',
      counts,
    };
  }

  return {
    status: 'unavailable',
    verified: false,
    reason: acquisitionSummary?.status || 'offer_acquisition_unknown',
    counts,
  };
}

function getOfferCapabilityMessage(capability, kind, locationLabel = '') {
  const online = kind === 'online';

  switch (capability?.status) {
    case 'verified_zero':
      return online
        ? 'No matching online offers found right now.'
        : `No matching local offers for ${locationLabel || 'your locations'} right now.`;
    case 'partial':
      return online
        ? 'Online offer sources are limited right now; no verified offers were found.'
        : `Local offer sources are limited for ${locationLabel || 'your locations'} right now.`;
    case 'disabled':
      return online
        ? 'Online offers are disabled in Up Ahead settings.'
        : 'Local shopping offers are disabled in Up Ahead settings.';
    case 'snapshot_unknown':
      return online
        ? 'Online offer availability cannot be verified from the current snapshot.'
        : `Local offer availability for ${locationLabel || 'your locations'} cannot be verified from the current snapshot.`;
    case 'unavailable':
    default:
      return online
        ? 'Online offers are temporarily unavailable.'
        : `Local offers for ${locationLabel || 'your locations'} are temporarily unavailable.`;
  }
}

function getCategoryEmptyMessage(acquisition, categories, label, fresh) {
  const counts = categoryAcquisitionTotals(acquisition, categories);
  if (!fresh || !counts.attemptedSources) return `${label} coverage cannot be verified right now. Please try refreshing later.`;
  if (!counts.successfulSources) return `${label} sources are unavailable right now. Please try again later.`;
  if (counts.failedSources) return `${label} sources are limited right now; no matching items were found.`;
  return `No matching ${label.toLowerCase()} found for your locations right now.`;
}

export function useUpAheadPageViewModel() {
  const { settings, updateSettings } = useSettings();
  const { toggleWatchlist, isWatched, watchlistError } = useWatchlist();

  const [data, setData] = useState(null);
  const [envelope, setEnvelope] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState(0);
  const [view, setView] = useState('plan');
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [liveAcquisition, setLiveAcquisition] = useState(null);
  const latestLoad = useRef(0);
  const lastData = useRef(null);

  const runtime = useMemo(() => (
    getRuntimeCapabilities()
  ), []);

  const upAheadSettings = settings?.upAhead || DEFAULT_UPAHEAD_SETTINGS;

  const showRetained = useCallback(() => {
    const retained = loadFromCache(upAheadSettings) || sanitizeUpAheadData(lastData.current);
    lastData.current = retained;
    setData(retained);
    return retained;
  }, [upAheadSettings]);

  const loadData = useCallback(async ({ forceRefresh = false } = {}) => {
    const request = ++latestLoad.current;
    const retained = showRetained();
    setLoading(!retained);
    setLoadingPhase(retained ? 1 : 0);
    setIsRefreshing(true);
    try {
      const nextEnvelope = await loadUpAhead({
        policy: forceRefresh ? 'refresh-now' : 'smart',
        forceRefresh,
        fallbackData: retained,
        settings,
      });
      if (request !== latestLoad.current) return;
      setEnvelope(nextEnvelope);
      publishDirectUpAheadEnvelope(nextEnvelope, { requestedPagePolicy: forceRefresh ? 'refresh-now' : 'smart' });
      setError(nextEnvelope.error || null);
      const { raw, sourceMode, acquisitionSummary } = nextEnvelope.data || {};
      lastData.current = raw && { ...raw, sourceMode };
      setData(lastData.current);
      setLiveAcquisition(acquisitionSummary);
      setLoadingPhase(acquisitionSummary && acquisitionSummary.status !== 'blocked' ? 3 : 2);
    } catch (error) {
      if (request !== latestLoad.current) return;
      publishDirectUpAheadEnvelope({
        ok: false, source: 'failed', freshness: 'unknown',
        error: error?.message || 'Up Ahead refresh failed',
        data: { sourceMode: 'failed' },
      }, { requestedPagePolicy: forceRefresh ? 'refresh-now' : 'smart' });
      setError(error?.message || 'Up Ahead refresh failed. Showing retained active items if available.');
      setLiveAcquisition({ status: 'failed', reason: error?.message || 'refresh_failed', byCategory: {} });
    } finally {
      if (request === latestLoad.current) {
        setIsRefreshing(false);
        setLoading(false);
      }
    }
  }, [settings, showRetained]);

  const { pullDistance } = usePullToRefresh(() => (
    loadData({ forceRefresh: true })
  ));

  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) loadData(); });
    window.addEventListener('focus', showRetained);
    return () => {
      active = false;
      latestLoad.current += 1;
      window.removeEventListener('focus', showRetained);
    };
  }, [loadData, showRetained]);
  useUpAheadExpiry(data, showRetained);

  const handleRemoveFromPlan = useCallback((item) => {
    const id = item && upAheadOccurrenceKey(item);

    if (!id) return;

    if (plannerStorage.addToBlacklist) {
      const result = plannerStorage.addToBlacklist(id);
      if (!isPlannerStorageSuccess(result)) {
        if (typeof window !== 'undefined' && typeof window.alert === 'function') {
          window.alert(getPlannerStorageError(result, 'Suggestion was not dismissed'));
        }
        return result;
      }

      showRetained();
    }
  }, [showRetained]);

  const handleAddToPlan = useCallback((item, dateStr) => {
    const payload = buildExplicitPlannerSave(item, dateStr);
    if (!payload) return { ok: false, error: 'Planner item is invalid' };
    const result = plannerStorage.addItem(payload.planDate, payload);

    if (!isPlannerStorageSuccess(result)) {
      if (typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert(getPlannerStorageError(result, 'Planner item was not saved'));
      }
      return result;
    }

    showRetained();

    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert('Added to Plan!');
    }

    return { ok: true };
  }, [showRetained]);

  const removeUpAheadLocation = useCallback((location) => {
    const current = upAheadSettings.locations || ['Chennai', 'Muscat'];
    const next = current.filter(item => item !== location);

    if (next.length > 0 && typeof updateSettings === 'function') {
      updateSettings({
        ...settings,
        upAhead: {
          ...settings.upAhead,
          locations: next,
        },
      });
    }
  }, [settings, upAheadSettings.locations, updateSettings]);

  const addUpAheadLocation = useCallback((location) => {
    const cleanLocation = String(location || '').trim();

    if (!cleanLocation) return;

    const current = upAheadSettings.locations || ['Chennai', 'Muscat'];

    if (!current.includes(cleanLocation) && typeof updateSettings === 'function') {
      updateSettings({
        ...settings,
        upAhead: {
          ...settings.upAhead,
          locations: [...current, cleanLocation],
        },
      });
    }
  }, [settings, upAheadSettings.locations, updateSettings]);

  const promptAddUpAheadLocation = useCallback(() => {
    if (typeof window === 'undefined' || typeof window.prompt !== 'function') return;

    const location = window.prompt('Add location (e.g. Trichy, Dubai):');
    addUpAheadLocation(location);
  }, [addUpAheadLocation]);

  const visibleProjection = useMemo(() => (
    getVisibleUpAheadProjection({
      data,
      settings,
    })
  ), [data, settings]);

  const sourceModeState = useMemo(() => (
    getSourceModeState({
      data,
      runtime,
      envelope,
    })
  ), [data, runtime, envelope]);

  const locationLabel = useMemo(() => (
    upAheadSettings.locations?.join(', ') || 'All Locations'
  ), [upAheadSettings.locations]);

  const effectiveAcquisition = liveAcquisition || data?.acquisitionSummary || null;
  const freshCoverage = envelope?.freshness === 'fresh';
  const emptyMessages = {
    movies: getCategoryEmptyMessage(effectiveAcquisition, ['movies'], 'Releases', freshCoverage),
    events: getCategoryEmptyMessage(effectiveAcquisition, ['events', 'sports'], 'Events', freshCoverage),
    alerts: getCategoryEmptyMessage(effectiveAcquisition, ['alerts', 'weather_alerts', 'civic'], 'Alerts', freshCoverage),
    festivals: getCategoryEmptyMessage(effectiveAcquisition, ['festivals'], 'Festivals', freshCoverage),
    civic: getCategoryEmptyMessage(effectiveAcquisition, ['civic'], 'Civic notices', freshCoverage),
  };
  const onlineCategoriesEnabled = Boolean(
    upAheadSettings?.categories?.shopping !== false ||
    upAheadSettings?.categories?.airlines !== false
  );
  const offlineCategoryEnabled = upAheadSettings?.categories?.shopping !== false;

  const onlineOffersCapability = useMemo(() => deriveOfferCapability({
    offers: visibleProjection.onlineOffers,
    acquisitionSummary: effectiveAcquisition,
    enabled: onlineCategoriesEnabled,
    categories: ['shopping', 'airlines'],
    sourceMode: data?.sourceMode || null,
    freshness: envelope?.freshness,
  }), [
    visibleProjection.onlineOffers,
    effectiveAcquisition,
    onlineCategoriesEnabled,
    data?.sourceMode,
    envelope?.freshness,
  ]);

  const offlineOffersCapability = useMemo(() => deriveOfferCapability({
    offers: visibleProjection.offlineOffers,
    acquisitionSummary: effectiveAcquisition,
    enabled: offlineCategoryEnabled,
    categories: ['shopping'],
    sourceMode: data?.sourceMode || null,
    freshness: envelope?.freshness,
  }), [
    visibleProjection.offlineOffers,
    effectiveAcquisition,
    offlineCategoryEnabled,
    data?.sourceMode,
    envelope?.freshness,
  ]);

  return {
    data,
    envelope,
    error: error || (effectiveAcquisition?.status === 'partial' ? 'Some sources could not be checked; coverage is incomplete.' : null),
    emptyMessages,
    loading,
    isRefreshing,
    loadingPhase,
    view,
    showDiagnostics,
    pullDistance,

    runtime,
    isStaticHost: runtime.isStaticHost,
    upAheadSettings,
    locationLabel,

    hasVisibleContent: visibleProjection.hasVisibleContent,
    modeStr: sourceModeState.modeStr,
    modeLabel: sourceModeState.modeLabel,
    liveAcquisition: effectiveAcquisition,
    onlineOffersCapability,
    offlineOffersCapability,
    onlineOffersEmptyMessage: getOfferCapabilityMessage(onlineOffersCapability, 'online', locationLabel),
    offlineOffersEmptyMessage: getOfferCapabilityMessage(offlineOffersCapability, 'offline', locationLabel),

    ...visibleProjection,

    setView,
    setShowDiagnostics,
    loadData,
    handleAddToPlan,
    handleRemoveFromPlan,
    removeUpAheadLocation,
    addUpAheadLocation,
    promptAddUpAheadLocation,
    toggleWatchlist,
    watchlistError,
    isWatched,
  };
}

export const __upAheadPageViewModelInternalsForTest = {
  DEFAULT_UPAHEAD_SETTINGS,
  normalizePlanDate,
  hasVisibleUpAheadContent,
  getSourceModeState,
  categoryAcquisitionTotals,
  deriveOfferCapability,
  getOfferCapabilityMessage,
  getCategoryEmptyMessage,
  buildCardArticle,
  formatConciseDate,
  getEventDateMs,
  getVisibleUpAheadProjection,
  buildSuggestedItems,
};
