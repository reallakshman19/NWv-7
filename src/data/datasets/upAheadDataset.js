import { makeEnvelope, ENVELOPE_SOURCES, ENVELOPE_FRESHNESS } from '../dataEnvelope.js';
import { applyDatasetSlo } from '../slo/applyDatasetSlo.js';
import { fetchUpAheadDatasetApiResponse } from './upAheadDatasetApiClient.js';
import { resolveUpAheadProviderPolicy } from './upAheadProviderPolicy.js';
import {
  fetchStaticUpAheadData,
  fetchLiveUpAheadData,
  mergeUpAheadData,
  loadFromCache,
  saveToCache,
  isActualWeatherAlertText,
  isActualOfferText,
} from '../../services/upAheadService.js';
import { getUpAheadEvidence } from '../../services/upAheadEvidence.js';
import { getUpAheadBriefing } from '../../services/upAheadBriefing.js';
import { getRuntimeCapabilities } from '../../runtime/runtimeCapabilities.js';
import { getSettings } from '../../utils/storage.js';
import plannerStorage from '../../utils/plannerStorage.js';

const OFFER_MAX_AGE_MS      = 2  * 24 * 60 * 60 * 1000; // 2 days
const WEATHER_ALERT_MAX_AGE_MS = 36 * 60 * 60 * 1000;    // 36 hours — forecasts become stale quickly
const ALERT_MAX_AGE_MS      = 48 * 60 * 60 * 1000;       // 48 hours — general alerts
const CIVIC_MAX_AGE_MS      = 7  * 24 * 60 * 60 * 1000;  // 7 days — road/civic notices

const DEFAULT_UP_AHEAD_SETTINGS = {
  categories: {
    movies: true, events: true, festivals: true, alerts: true, sports: true,
    shopping: true, civic: true, weather_alerts: true, airlines: true,
  },
  locations: ['Chennai'],
};

function safeGetSettings() {
  try {
    return getSettings?.() || {};
  } catch {
    return {};
  }
}

function hasVisibleUpAheadContent(data) {
  if (!data) return false;
  if (Array.isArray(data.timeline) && data.timeline.some(day => (day?.items || []).length > 0)) return true;
  if (data.sections && Object.values(data.sections).some(items => Array.isArray(items) && items.length > 0)) return true;
  if (Array.isArray(data.weekly_plan) && data.weekly_plan.some(day => (day?.items || []).length > 0)) return true;
  return false;
}

function getSource(sourceMode) {
  if (sourceMode === 'cache') return ENVELOPE_SOURCES.CACHE;
  if (sourceMode === 'snapshot' || sourceMode === 'static') return ENVELOPE_SOURCES.SNAPSHOT;
  return ENVELOPE_SOURCES.LIVE;
}

function getItemAgeMs(item) {
  const raw = item?.publishedAt || item?.eventStartAt || item?.date || item?.timestamp;
  if (!raw) return 0;
  const ms = typeof raw === 'number' ? (raw < 10_000_000_000 ? raw * 1000 : raw) : Date.parse(raw);
  return Number.isFinite(ms) && ms > 0 ? Date.now() - ms : 0;
}

function buildVisible(data, settings) {
  const sections = data?.sections || {};
  const weatherAlerts = (sections.weather_alerts || []).filter(item => {
    if (!isActualWeatherAlertText(`${item?.title || ''} ${item?.description || ''}`, settings.upAhead)) return false;
    const age = getItemAgeMs(item);
    return !(age > 0 && age > WEATHER_ALERT_MAX_AGE_MS);
  });
  const alerts = [
    ...weatherAlerts,
    ...(sections.alerts || []).filter(item => {
      const age = getItemAgeMs(item);
      return age === 0 || age <= ALERT_MAX_AGE_MS;
    }),
  ];
  const civics = (sections.civic || []).filter(item => {
    const age = getItemAgeMs(item);
    return age === 0 || age <= CIVIC_MAX_AGE_MS;
  });
  const offers = [
    ...(sections.shopping || []),
    ...(sections.airlines || []),
  ].filter(item => {
    if (!isActualOfferText(`${item?.title || ''} ${item?.description || ''}`, settings.upAhead)) return false;
    const pub = item?.publishedAt || item?.eventStartAt;
    return !(pub && (Date.now() - pub) > OFFER_MAX_AGE_MS);
  });
  return {
    plan: data?.weekly_plan || [],
    offers,
    releases: sections.movies || [],
    events: sections.events || [],
    alerts,
    weatherAlerts,
    combinedAlerts: [...alerts, ...civics],
    festivals: sections.festivals || [],
    civics,
  };
}

async function loadPlannerSyncIfAllowed() {
  const { isStaticHost } = getRuntimeCapabilities();

  if (isStaticHost) return;

  await Promise.allSettled([
    plannerStorage.loadBlacklistFromApi?.(),
    plannerStorage.loadPlanFromApi?.(),
  ]);
}

function pushProviderDecision(diagnostics, providerDecision) {
  diagnostics.push({
    event: 'upAheadDataset.provider_policy',
    severity: 'info',
    message: providerDecision.shouldAttemptLive ? 'Live fetch allowed' : 'Live fetch skipped by policy',
    details: providerDecision,
  });
}

function pushLiveSkipped(diagnostics, providerDecision, data) {
  diagnostics.push({
    event: providerDecision.browserWideFeedFetchAllowed
      ? 'upAheadDataset.live_skipped_policy'
      : 'upAheadDataset.live_skipped_runtime',
    severity: data ? 'info' : 'warn',
    message: providerDecision.skippedLiveReason || 'Live fetch not permitted',
  });
}

function pushDatasetApiEdgeDiagnostics(diagnostics, edgeDiagnostics) {
  diagnostics.push({
    event: 'upAheadDataset.api_edge_diagnostics',
    severity: 'info',
    message: 'Captured Up Ahead edge API response diagnostics',
    details: edgeDiagnostics || {
      source: 'unknown',
      reason: 'unknown',
      freshness: 'unknown',
      ageSeconds: 'unknown',
    },
  });
}

function persistUpAheadData(data) {
  saveToCache(data);
  return data;
}

async function loadDatasetApiData({ runtimeCapabilities, data, diagnostics }) {
  diagnostics.push({ event: 'upAheadDataset.api_attempted', severity: 'info', message: 'Attempting Up Ahead dataset API' });
  const apiResponse = await fetchUpAheadDatasetApiResponse({ baseUrl: runtimeCapabilities.configuredBackendUrl });
  pushDatasetApiEdgeDiagnostics(diagnostics, apiResponse?.diagnostics);
  const apiData = apiResponse?.data;
  if (apiData && hasVisibleUpAheadContent(apiData)) {
    const merged = persistUpAheadData(mergeUpAheadData(data, apiData));
    diagnostics.push({ event: 'upAheadDataset.api_loaded', severity: 'info', message: 'Loaded Up Ahead dataset API data' });
    return { data: merged, sourceMode: apiData.sourceMode || 'dataset-api', hasUsableApi: true };
  }
  diagnostics.push({ event: 'upAheadDataset.api_empty', severity: 'warn', message: 'Dataset API returned no visible Up Ahead content' });
  return { data, sourceMode: null, hasUsableApi: false };
}

async function mergeDatasetApiData({ runtimeCapabilities, data, diagnostics }) {
  try {
    return await loadDatasetApiData({ runtimeCapabilities, data, diagnostics });
  } catch (error) {
    diagnostics.push({ event: 'upAheadDataset.api_failed', severity: 'warn', message: error?.message || String(error) });
    return { data, sourceMode: null, hasUsableApi: false };
  }
}

async function mergeStaticData({ upAheadSettings, data, diagnostics }) {
  try {
    const staticData = await fetchStaticUpAheadData(upAheadSettings);
    if (staticData && hasVisibleUpAheadContent(staticData)) {
      const merged = persistUpAheadData(mergeUpAheadData(data, staticData));
      diagnostics.push({ event: 'upAheadDataset.static_loaded', severity: 'info', message: 'Merged static Up Ahead data' });
      return { data: merged, sourceMode: staticData.sourceMode || 'snapshot', hasUsableStatic: true };
    }
    diagnostics.push({ event: 'upAheadDataset.static_empty', severity: 'warn', message: 'Static Up Ahead data was empty or not displayable' });
  } catch (error) {
    diagnostics.push({ event: 'upAheadDataset.static_failed', severity: 'warn', message: error?.message || String(error) });
  }
  return { data, sourceMode: null, hasUsableStatic: false };
}

async function mergeLiveData({ options, upAheadSettings, data, diagnostics }) {
  try {
    const liveData = await fetchLiveUpAheadData(upAheadSettings);
    if (liveData && hasVisibleUpAheadContent(liveData)) {
      const merged = persistUpAheadData(mergeUpAheadData(options.liveOnly ? null : data, liveData));
      diagnostics.push({ event: 'upAheadDataset.live_loaded', severity: 'info', message: 'Merged live Up Ahead data' });
      return { data: merged, sourceMode: liveData?.sourceMode || 'live' };
    }
    diagnostics.push({ event: 'upAheadDataset.live_empty', severity: data ? 'warn' : 'error', message: 'Live Up Ahead fetch returned no visible content' });
  } catch (error) {
    diagnostics.push({ event: 'upAheadDataset.live_failed', severity: data ? 'warn' : 'error', message: error?.message || String(error) });
  }
  return { data, sourceMode: null };
}

function getVisibleContext(data, settings, visible) {
  return {
    data,
    settings,
    visible: {
      weatherAlerts: visible.weatherAlerts,
      combinedAlerts: visible.combinedAlerts,
      offerItems: visible.offers,
      movieCards: visible.releases,
      festivalCards: visible.festivals,
    },
  };
}

export async function load(options = {}) {
  const settings = safeGetSettings();
  const upAheadSettings = settings.upAhead || DEFAULT_UP_AHEAD_SETTINGS;
  const runtimeCapabilities = getRuntimeCapabilities();
  const diagnostics = [];
  let data = null;
  let sourceMode = 'live';
  let hasUsableCache = false;
  let hasUsableApi = false;
  let hasUsableStatic = false;

  await loadPlannerSyncIfAllowed();

  const initialPolicy = resolveUpAheadProviderPolicy({ options, runtimeCapabilities, hasUsableCache, hasUsableApi, hasUsableStatic });

  if (initialPolicy.shouldReadCache) {
    const cached = loadFromCache();
    if (cached) {
      hasUsableCache = hasVisibleUpAheadContent(cached);
      data = cached;
      sourceMode = cached.sourceMode || 'cache';
      diagnostics.push({ event: 'upAheadDataset.cache_hit', severity: 'info', message: 'Loaded Up Ahead cache' });
    }
  }

  if (initialPolicy.shouldAttemptDatasetApi) {
    const result = await mergeDatasetApiData({ runtimeCapabilities, data, diagnostics });
    data = result.data;
    hasUsableApi = result.hasUsableApi;
    if (result.sourceMode) sourceMode = result.sourceMode;
  } else {
    diagnostics.push({ event: 'upAheadDataset.api_skipped_policy', severity: 'info', message: initialPolicy.apiSkippedReason || 'Dataset API not attempted' });
  }

  if (initialPolicy.shouldReadStatic && !hasUsableApi) {
    const result = await mergeStaticData({ upAheadSettings, data, diagnostics });
    data = result.data;
    hasUsableStatic = result.hasUsableStatic;
    if (result.sourceMode) sourceMode = result.sourceMode;
  }

  const providerDecision = resolveUpAheadProviderPolicy({ options, runtimeCapabilities, hasUsableCache, hasUsableApi, hasUsableStatic });
  pushProviderDecision(diagnostics, providerDecision);

  if (providerDecision.shouldAttemptLive) {
    const result = await mergeLiveData({ options, upAheadSettings, data, diagnostics });
    data = result.data;
    if (result.sourceMode) sourceMode = result.sourceMode;
  } else {
    pushLiveSkipped(diagnostics, providerDecision, data);
  }

  const visible = buildVisible(data, settings);
  const context = getVisibleContext(data, settings, visible);
  const evidence = getUpAheadEvidence(context);
  const briefing = getUpAheadBriefing(context);
  const ok = hasVisibleUpAheadContent(data);

  const envelope = makeEnvelope({
    ok,
    datasetId: 'upAhead',
    data: { ...visible, briefing, evidence, sourceMode, raw: data },
    source: getSource(sourceMode),
    freshness: ok ? ENVELOPE_FRESHNESS.FRESH : ENVELOPE_FRESHNESS.EMPTY,
    error: ok ? null : 'up ahead unavailable',
    validation: {
      passed: ok,
      errors: ok ? [] : ['up_ahead_unavailable'],
      warnings: diagnostics.filter(item => item.severity === 'warn').map(item => item.event),
    },
    diagnostics,
  });

  return applyDatasetSlo(envelope);
}

export const __upAheadDatasetInternalsForTest = {
  hasVisibleUpAheadContent,
  buildVisible,
};
