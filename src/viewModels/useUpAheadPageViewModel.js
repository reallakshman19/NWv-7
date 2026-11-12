import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSettings } from '../context/SettingsContext';
import { useWatchlist } from '../hooks/useWatchlist';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { useUpAheadExpiry } from '../hooks/useUpAheadExpiry';
import {
  loadFromCache,
  sanitizeUpAheadData,
  isActualWeatherAlertText,
  isActualOfferText,
} from '../services/upAheadService';
import { isUpAheadItemActive } from '../services/upAheadLifecycle';
import { load as loadUpAhead } from '../data/datasets/upAheadDataset';
import plannerStorage, {
  getPlannerStorageError,
  isPlannerStorageSuccess,
} from '../utils/plannerStorage';
import { getRuntimeCapabilities } from '../runtime/runtimeCapabilities';
import { getUpAheadEvidence } from '../services/upAheadEvidence';
import { getUpAheadBriefing } from '../services/upAheadBriefing';
import { toLocalDateKey } from '../utils/dateKey';

const DEFAULT_UPAHEAD_SETTINGS = {
  categories: {
    movies: true,
    events: true,
    festivals: true,
    alerts: true,
    sports: true,
    shopping: true,
    civic: true,
    weather_alerts: true,
    airlines: true,
  },
  locations: ['Chennai', 'Muscat'],
};

const CIVIC_MAX_ITEMS          = 20;                        // cap civic notices shown

function normalizePlanDate(dateStr) {
  // Local-calendar keys, consistent with dateAware/plannerStorage; UTC
  // extraction shifted early-morning IST timestamps to the previous day.
  if (!dateStr) return toLocalDateKey(new Date());
  return toLocalDateKey(dateStr) || dateStr;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asSections(data) {
  return data?.sections && typeof data.sections === 'object'
    ? data.sections
    : {};
}

function itemLocation(item) {
  return String(item?.city || item?.locationCanonical || item?.region || '').trim();
}

function matchesConfiguredLocation(item, locations) {
  const loc = itemLocation(item).toLowerCase();
  if (!loc) return false;
  return (locations || []).some(configured => {
    const c = String(configured || '').trim().toLowerCase();
    return c && (c === loc || loc.includes(c) || c.includes(loc));
  });
}

// Fallback for items (e.g. Google News shopping results) that have no explicit
// location metadata: scan title + description + source for the configured city name.
function matchesConfiguredLocationByText(item, locations) {
  const text = `${item?.title || ''} ${item?.description || ''} ${item?.source || ''}`.toLowerCase();
  return (locations || []).some(configured => {
    const c = String(configured || '').trim().toLowerCase();
    return c.length >= 4 && text.includes(c);
  });
}

function publishedMs(item) {
  return getEventDateMs(item?.publishedAt || item?.eventStartAt || item?.date || item?.timestamp);
}

function hasVisibleUpAheadContent(data) {
  if (!data) return false;
  if (Array.isArray(data.timeline) && data.timeline.some(day => (day?.items || []).length > 0)) return true;
  if (data.sections && Object.values(data.sections).some(items => Array.isArray(items) && items.length > 0)) return true;
  if (Array.isArray(data.weekly_plan) && data.weekly_plan.some(day => (day?.items || []).length > 0)) return true;
  return false;
}

function getSourceModeState({ data, runtime }) {
  const isStaticHost = Boolean(runtime?.isStaticHost);

  if (isStaticHost) {
    return {
      modeStr: data?.sourceMode === 'snapshot' ? 'snapshot' : 'degraded',
      modeLabel: data?.sourceMode === 'snapshot' ? 'Snapshot' : 'Limited',
    };
  }

  return {
    modeStr: data?.sourceMode === 'cache' ? 'cached' : 'live',
    modeLabel: data?.sourceMode === 'cache' ? 'Cached' : 'Live',
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
} = {}) {
  if (asArray(offers).length > 0) {
    return {
      status: 'ready',
      verified: true,
      reason: 'results',
      counts: categoryAcquisitionTotals(acquisitionSummary, categories),
    };
  }

  if (!enabled) {
    return {
      status: 'disabled',
      verified: true,
      reason: 'category_disabled',
      counts: categoryAcquisitionTotals(acquisitionSummary, categories),
    };
  }

  if (acquisitionSummary?.status === 'blocked') {
    return {
      status: 'unavailable',
      verified: false,
      reason: acquisitionSummary.reason || 'browser_live_blocked',
      counts: categoryAcquisitionTotals(acquisitionSummary, categories),
    };
  }

  const counts = categoryAcquisitionTotals(acquisitionSummary, categories);

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

function buildCardArticle(item) {
  return {
    ...item,
    time: formatConciseDate(
      item?.date || item?.releaseDate,
      item?.publishedAt || item?.timestamp
    ),
    summary: item?.description || item?.summary || '',
    source: item?.source || item?.platform || item?.category || 'Up Ahead',
    imageUrl: item?.posterUrl || item?.imageUrl || null,
  };
}

function formatConciseDate(dateStr, publishedAt) {
  if (!dateStr) {
    if (publishedAt) {
      const ms = typeof publishedAt === 'number'
        ? (publishedAt < 10_000_000_000 ? publishedAt * 1000 : publishedAt)
        : Date.parse(publishedAt);
      if (ms > 0) {
        const diffH = (Date.now() - ms) / 3600000;
        if (diffH < 1) return 'Just now';
        if (diffH < 24) return `${Math.floor(diffH)}h ago`;
        if (diffH < 48) return 'Yesterday';
        return `${Math.floor(diffH / 24)}d ago`;
      }
    }
    return 'Coming Soon';
  }

  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;

  const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
  const dayNum = d.getDate().toString().padStart(2, '0');
  const month = d.toLocaleDateString('en-US', { month: 'short' });

  return `${dayName}, ${dayNum} ${month}`;
}

function getEventDateMs(value) {
  if (!value) return 0;

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1000 : value;
  }

  const numeric = Number(value);

  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Curated sale-campaign signatures. Online offers about the SAME campaign
// (e.g. the dozen "Amazon Prime Day 2026" write-ups from different outlets)
// are grouped into one card so the Offers tab isn't flooded with duplicates.
const OFFER_CAMPAIGNS = [
  { key: 'amazon-prime-day', re: /\bprime day\b/i },
  { key: 'flipkart-big-billion-days', re: /\bbig billion days\b/i },
  { key: 'amazon-great-indian', re: /\bgreat indian (festival|sale)\b/i },
  { key: 'myntra-eoss', re: /\b(end of season sale|eoss)\b/i },
  { key: 'target-circle-week', re: /\bcircle (week|deal days)\b/i },
  { key: 'black-friday', re: /\bblack friday\b/i },
  { key: 'cyber-monday', re: /\bcyber monday\b/i },
  { key: 'festive-sale', re: /\b(diwali|festive) sale\b/i },
  { key: 'independence-day-sale', re: /\bindependence day sale\b/i },
  { key: 'republic-day-sale', re: /\brepublic day sale\b/i },
];

function offerCampaignKey(item) {
  const text = `${item?.title || ''} ${item?.description || ''}`;
  for (const campaign of OFFER_CAMPAIGNS) {
    if (campaign.re.test(text)) return campaign.key;
  }
  return null;
}

// Group online offers by sale campaign. Offers that don't match a known
// campaign are kept as-is. Each group keeps the newest item as the
// representative and exposes sourceCount + grouped members for the UI.
function groupOnlineOffers(offers = []) {
  const groups = new Map();
  const singles = [];

  for (const offer of offers) {
    const key = offerCampaignKey(offer);
    if (!key) {
      singles.push(offer);
      continue;
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(offer);
  }

  const grouped = [];
  for (const members of groups.values()) {
    if (members.length === 1) {
      grouped.push(members[0]);
      continue;
    }
    const sorted = [...members].sort((a, b) => publishedMs(b) - publishedMs(a));
    const representative = sorted[0];
    const sources = [...new Set(members.map(m => m.source).filter(Boolean))];
    grouped.push({
      ...representative,
      sourceCount: Math.max(Number(representative.sourceCount || 1), sources.length || members.length),
      sources,
      groupedOffers: sorted,
      groupedCount: members.length,
    });
  }

  return [...grouped, ...singles];
}

// Sort key for the Suggested feed: prefer a real upcoming event/release date,
// otherwise fall back to publish recency.
function getSuggestedSortMs(item) {
  const eventMs = getEventDateMs(item?.date || item?.releaseDate || item?.eventStartAt);
  if (eventMs > 0) return eventMs;
  return publishedMs(item);
}

// The "Suggested" tab is the automatic, cross-category feed (the planner is
// manual-only). Combine the auto-derived categories — releases, events,
// festivals, offers, civic — rank them (soonest upcoming first, then most
// recent), dedupe, and cap.
function buildSuggestedItems({ movieCards, festivalCards, eventItems, onlineOffers, offlineOffers, civicAlerts } = {}) {
  const tagged = [
    ...asArray(movieCards).map(item => ({ ...item, _suggestKind: 'release' })),
    ...asArray(festivalCards).map(item => ({ ...item, _suggestKind: 'festival' })),
    ...asArray(eventItems).map(item => ({ ...item, _suggestKind: 'event' })),
    ...asArray(onlineOffers).map(item => ({ ...item, _suggestKind: 'offer', isOffer: true })),
    ...asArray(offlineOffers).map(item => ({ ...item, _suggestKind: 'offer', isOffer: true })),
    ...asArray(civicAlerts).map(item => ({ ...item, _suggestKind: 'civic' })),
  ];

  const seen = new Set();
  const deduped = [];
  for (const item of tagged) {
    const key = String(item?.id || item?.link || item?.url || item?.title || '').trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  const now = Date.now();
  return deduped
    .sort((a, b) => {
      const aMs = getSuggestedSortMs(a);
      const bMs = getSuggestedSortMs(b);
      const aUpcoming = aMs >= now;
      const bUpcoming = bMs >= now;
      if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1; // upcoming before past
      if (aUpcoming) return aMs - bMs;                        // soonest upcoming first
      return bMs - aMs;                                       // most recent first
    })
    .slice(0, 24);
}

function getVisibleUpAheadProjection({ data, settings }) {
  const upAheadSettings = settings?.upAhead || DEFAULT_UPAHEAD_SETTINGS;
  const now = Date.now();
  const sections = Object.fromEntries(Object.entries(asSections(data)).map(([key, items]) => [
    key,
    upAheadSettings.categories?.[key] === false
      ? []
      : asArray(items).filter(item => isUpAheadItemActive({ category: key, ...item }, now)),
  ]));
  const weatherAlerts = asArray(sections.weather_alerts).filter(item =>
    isActualWeatherAlertText(`${item?.title || ''} ${item?.description || ''}`, upAheadSettings)
  );
  const generalAlerts = asArray(sections.alerts);

  const locations = upAheadSettings.locations || DEFAULT_UPAHEAD_SETTINGS.locations;

  // This feeds both the Civics tab and the civic portion of the Alerts badge.
  const civicItems = asArray(sections.civic)
    .filter(item => matchesConfiguredLocation(item, locations))
    .sort((a, b) => publishedMs(b) - publishedMs(a))
    .slice(0, CIVIC_MAX_ITEMS);
  const civicAlerts = civicItems;
  const combinedAlerts = [...weatherAlerts, ...generalAlerts, ...civicItems];

  // Online offers are city-agnostic e-commerce and airline deals.
  const onlineOfferCandidates = [
    ...asArray(sections.shopping),
    ...asArray(sections.airlines),
  ].filter(item => !itemLocation(item)
    && isActualOfferText(`${item?.title || ''} ${item?.description || ''}`, upAheadSettings));

  // Group near-duplicate online offers (e.g. the many "Amazon Prime Day 2026"
  // write-ups from different outlets) into a single representative carrying a
  // sourceCount, so the Offers tab shows one card per deal instead of a dozen.
  const onlineOffers = groupOnlineOffers(onlineOfferCandidates)
    .sort((a, b) => publishedMs(b) - publishedMs(a));

  // The local shopping feeds are already filtered for offer intent.
  // Google News RSS items carry no explicit location metadata, so fall back to
  // text scanning when city/locationCanonical/region fields are all absent.
  const offlineOffers = asArray(sections.shopping)
    .filter(item =>
      itemLocation(item)
        ? matchesConfiguredLocation(item, locations)
        : matchesConfiguredLocationByText(item, locations)
    )
    .sort((a, b) => publishedMs(b) - publishedMs(a))
    .slice(0, CIVIC_MAX_ITEMS);

  const offerItems = [...onlineOffers, ...offlineOffers]; // combined, for backward-compat

  const movieCards = asArray(sections.movies).map(buildCardArticle);
  const festivalCards = asArray(sections.festivals).map(buildCardArticle);
  const eventItems = [
    ...asArray(sections.events),
    ...asArray(sections.sports),
  ];

  const suggestedItems = buildSuggestedItems({
    movieCards,
    festivalCards,
    eventItems,
    onlineOffers,
    offlineOffers,
    civicAlerts,
  });

  const visible = {
    weatherAlerts,
    generalAlerts,
    civicAlerts,
    civicItems,
    combinedAlerts,
    offerItems,
    onlineOffers,
    offlineOffers,
    movieCards,
    festivalCards,
    eventItems,
    suggestedItems,
  };

  return {
    ...visible,
    upAheadEvidence: getUpAheadEvidence({
      data,
      settings,
      visible,
    }),
    upAheadBriefing: getUpAheadBriefing({
      data,
      settings,
      visible,
    }),
  };
}

export function useUpAheadPageViewModel() {
  const { settings, updateSettings } = useSettings();
  const { toggleWatchlist, isWatched, watchlistError } = useWatchlist();

  const [data, setData] = useState(null);
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
    const retained = loadFromCache() || sanitizeUpAheadData(lastData.current);
    lastData.current = retained;
    setData(retained);
    return retained;
  }, []);

  const loadData = useCallback(async ({ forceRefresh = false } = {}) => {
    const request = ++latestLoad.current;
    const retained = showRetained();
    setLoading(!retained);
    setLoadingPhase(retained ? 1 : 0);
    setIsRefreshing(true);
    try {
      const envelope = await loadUpAhead({
        policy: forceRefresh ? 'refresh-now' : 'smart',
        forceRefresh,
        fallbackData: retained,
        settings,
      });
      if (request !== latestLoad.current) return;
      const { raw, sourceMode, acquisitionSummary } = envelope.data;
      lastData.current = raw && { ...raw, sourceMode };
      setData(lastData.current);
      setLiveAcquisition(acquisitionSummary);
      setLoadingPhase(acquisitionSummary && acquisitionSummary.status !== 'blocked' ? 3 : 2);
    } catch (error) {
      if (request !== latestLoad.current) return;
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
    const id = item?.hiddenKey || item?.canonicalId || item?.id;

    if (!id) return;

    if (plannerStorage.addToBlacklist) {
      const result = plannerStorage.addToBlacklist(id);
      if (!isPlannerStorageSuccess(result)) {
        if (typeof window !== 'undefined' && typeof window.alert === 'function') {
          window.alert(getPlannerStorageError(result, 'Planner item was not removed'));
        }
        return result;
      }

      showRetained();
    }
  }, [showRetained]);

  const handleAddToPlan = useCallback((item, dateStr) => {
    const hiddenKey = item?.hiddenKey || item?.canonicalId || item?.id;
    const normalizedDate = item?.planDate || normalizePlanDate(dateStr);

    const result = plannerStorage.addItem(normalizedDate, {
      id: hiddenKey || item?.id,
      hiddenKey,
      upAheadIds: item?.upAheadIds,
      title: item?.title,
      category: item?.tags?.[0] || 'event',
      type: item?.type || item?.tags?.[0] || 'event',
      link: item?.link,
      description: item?.description,
      icon: item?.icon,
      planDate: normalizedDate,
      eventDateKey: normalizedDate,
      eventDate: normalizedDate,
    });

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
    })
  ), [data, runtime]);

  const locationLabel = useMemo(() => (
    upAheadSettings.locations?.join(', ') || 'All Locations'
  ), [upAheadSettings.locations]);

  const effectiveAcquisition = liveAcquisition || data?.acquisitionSummary || null;
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
  }), [
    visibleProjection.onlineOffers,
    effectiveAcquisition,
    onlineCategoriesEnabled,
    data?.sourceMode,
  ]);

  const offlineOffersCapability = useMemo(() => deriveOfferCapability({
    offers: visibleProjection.offlineOffers,
    acquisitionSummary: effectiveAcquisition,
    enabled: offlineCategoryEnabled,
    categories: ['shopping'],
    sourceMode: data?.sourceMode || null,
  }), [
    visibleProjection.offlineOffers,
    effectiveAcquisition,
    offlineCategoryEnabled,
    data?.sourceMode,
  ]);

  return {
    data,
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

    hasVisibleContent: hasVisibleUpAheadContent(data),
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
  asArray,
  asSections,
  hasVisibleUpAheadContent,
  getSourceModeState,
  categoryAcquisitionTotals,
  deriveOfferCapability,
  getOfferCapabilityMessage,
  buildCardArticle,
  formatConciseDate,
  getEventDateMs,
  getVisibleUpAheadProjection,
  buildSuggestedItems,
};
