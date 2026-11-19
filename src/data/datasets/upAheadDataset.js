import { makeEnvelope, ENVELOPE_SOURCES, ENVELOPE_FRESHNESS } from '../dataEnvelope.js';
import { applyDatasetSlo } from '../slo/applyDatasetSlo.js';
import { fetchUpAheadDatasetApiResponse } from './upAheadDatasetApiClient.js';
import { resolveUpAheadProviderPolicy } from './upAheadProviderPolicy.js';
import {
  fetchStaticUpAheadData,
  fetchLiveUpAheadData,
  loadFromCache,
  saveToCache,
  beginUpAheadRequest,
  sanitizeUpAheadData,
  isUpAheadDataFresh,
  UP_AHEAD_REFRESH_MAX_AGE_MS,
} from '../../services/upAheadService.js';
import { getVisibleUpAheadProjection } from '../../services/upAheadProjection.js';
import { getRuntimeCapabilities } from '../../runtime/runtimeCapabilities.js';
import { getSettings } from '../../utils/storage.js';
import plannerStorage from '../../utils/plannerStorage.js';

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
  return false;
}

function getSource(sourceMode) {
  if (sourceMode === 'cache') return ENVELOPE_SOURCES.CACHE;
  if (['snapshot', 'static', 'dataset-api'].includes(sourceMode)) return ENVELOPE_SOURCES.SNAPSHOT;
  if (sourceMode === 'calendar') return ENVELOPE_SOURCES.SEED;
  if (sourceMode === 'failed') return ENVELOPE_SOURCES.FAILED;
  if (sourceMode === 'live') return ENVELOPE_SOURCES.LIVE;
  return ENVELOPE_SOURCES.UNKNOWN;
}

function buildVisible(data, settings) {
  const projected = getVisibleUpAheadProjection({ data, settings });
  return {
    plan: data?.weekly_plan || [],
    offers: projected.offerItems,
    releases: projected.movieCards,
    events: projected.eventItems,
    alerts: projected.generalAlerts,
    weatherAlerts: projected.weatherAlerts,
    combinedAlerts: projected.combinedAlerts,
    festivals: projected.festivalCards,
    civics: projected.civicItems,
    projected,
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

async function loadDatasetApiData({ runtimeCapabilities, upAheadSettings, data, diagnostics, request }) {
  diagnostics.push({ event: 'upAheadDataset.api_attempted', severity: 'info', message: 'Attempting Up Ahead dataset API' });
  const apiResponse = await fetchUpAheadDatasetApiResponse({ baseUrl: runtimeCapabilities.configuredBackendUrl });
  pushDatasetApiEdgeDiagnostics(diagnostics, apiResponse?.diagnostics);
  const edgeFreshness = apiResponse?.diagnostics?.freshness;
  const apiData = apiResponse?.data ? {
    ...apiResponse.data,
    sourceMode: 'dataset-api',
    datasetApiFreshness: edgeFreshness === 'fresh' || edgeFreshness === 'stale' ? edgeFreshness : 'unknown',
  } : null;
  if (apiData) data = saveToCache(apiData, data, upAheadSettings, request);
  if (hasVisibleUpAheadContent(sanitizeUpAheadData(apiData))) {
    diagnostics.push({ event: 'upAheadDataset.api_loaded', severity: 'info', message: 'Loaded Up Ahead dataset API data' });
    return {
      data,
      sourceMode: apiData.sourceMode,
      // The Worker may answer HTTP 200 using a retained snapshot. Do not
      // override a stale response header or a stale payload timestamp.
      hasFreshApi: isUpAheadDataFresh(apiData),
    };
  }
  diagnostics.push({ event: 'upAheadDataset.api_empty', severity: 'warn', message: 'Dataset API returned no visible Up Ahead content' });
  return { data, sourceMode: null, hasFreshApi: false };
}

async function mergeDatasetApiData({ runtimeCapabilities, upAheadSettings, data, diagnostics, request }) {
  try {
    return await loadDatasetApiData({ runtimeCapabilities, upAheadSettings, data, diagnostics, request });
  } catch (error) {
    diagnostics.push({ event: 'upAheadDataset.api_failed', severity: 'warn', message: error?.message || String(error) });
    return { data, sourceMode: null, hasFreshApi: false };
  }
}

async function mergeStaticData({ upAheadSettings, data, diagnostics, request }) {
  try {
    const snapshot = await fetchStaticUpAheadData(upAheadSettings);
    const staticData = snapshot ? { ...snapshot, sourceMode: snapshot.sourceMode || 'snapshot' } : null;
    if (staticData) data = saveToCache(staticData, data, upAheadSettings, request);
    if (hasVisibleUpAheadContent(sanitizeUpAheadData(staticData))) {
      diagnostics.push({ event: 'upAheadDataset.static_loaded', severity: 'info', message: 'Merged static Up Ahead data' });
      return { data, sourceMode: staticData.sourceMode, hasUsableStatic: isUpAheadDataFresh(staticData) };
    }
    diagnostics.push({ event: 'upAheadDataset.static_empty', severity: 'warn', message: 'Static Up Ahead data was empty or not displayable' });
  } catch (error) {
    diagnostics.push({ event: 'upAheadDataset.static_failed', severity: 'warn', message: error?.message || String(error) });
  }
  return { data, sourceMode: null, hasUsableStatic: false };
}

async function mergeLiveData({ upAheadSettings, data, diagnostics, request }) {
  try {
    const result = await fetchLiveUpAheadData(upAheadSettings);
    const liveData = result ? { ...result, sourceMode: result.sourceMode || 'live' } : null;
    if (liveData) data = saveToCache(liveData, data, upAheadSettings, request);
    if (hasVisibleUpAheadContent(sanitizeUpAheadData(liveData))) {
      diagnostics.push({ event: 'upAheadDataset.live_loaded', severity: 'info', message: 'Merged live Up Ahead data' });
      return { data, sourceMode: liveData.sourceMode, acquisitionSummary: liveData.acquisitionSummary };
    }
    diagnostics.push({ event: 'upAheadDataset.live_empty', severity: data ? 'warn' : 'error', message: 'Live Up Ahead fetch returned no visible content' });
    return { data, sourceMode: null, acquisitionSummary: liveData?.acquisitionSummary };
  } catch (error) {
    diagnostics.push({ event: 'upAheadDataset.live_failed', severity: data ? 'warn' : 'error', message: error?.message || String(error) });
  }
  return { data, sourceMode: null };
}

export async function load(options = {}) {
  const settings = options.settings || safeGetSettings();
  const upAheadSettings = settings.upAhead || DEFAULT_UP_AHEAD_SETTINGS;
  const request = beginUpAheadRequest(upAheadSettings);
  const runtimeCapabilities = getRuntimeCapabilities();
  const diagnostics = [];
  let data = null;
  let sourceMode = 'live';
  let hasUsableCache = false;
  let hasFreshApi = false;
  let hasUsableStatic = false;
  let acquisitionSummary = null;

  if (options.syncPlanner !== false) await loadPlannerSyncIfAllowed();

  const initialPolicy = resolveUpAheadProviderPolicy({ options, runtimeCapabilities });

  const cached = loadFromCache(upAheadSettings) || sanitizeUpAheadData(options.fallbackData);
  if (cached) {
    // Cache freshness can satisfy a fetch policy. All active cached items
    // remain the baseline even for a forced or live-only refresh.
    hasUsableCache = initialPolicy.shouldReadCache && isUpAheadDataFresh(cached, UP_AHEAD_REFRESH_MAX_AGE_MS);
    data = cached;
    sourceMode = cached.sourceMode || 'cache';
    diagnostics.push({ event: 'upAheadDataset.cache_hit', severity: 'info', message: 'Loaded retained Up Ahead items' });
  }

  if (initialPolicy.shouldAttemptDatasetApi) {
    const result = await mergeDatasetApiData({ runtimeCapabilities, upAheadSettings, data, diagnostics, request });
    data = result.data;
    hasFreshApi = result.hasFreshApi;
    if (result.sourceMode) sourceMode = result.sourceMode;
  } else {
    diagnostics.push({ event: 'upAheadDataset.api_skipped_policy', severity: 'info', message: initialPolicy.apiSkippedReason || 'Dataset API not attempted' });
  }

  if (initialPolicy.shouldReadStatic && !hasFreshApi) {
    const result = await mergeStaticData({ upAheadSettings, data, diagnostics, request });
    data = result.data;
    hasUsableStatic = result.hasUsableStatic;
    if (result.sourceMode) sourceMode = result.sourceMode;
  }

  const providerDecision = resolveUpAheadProviderPolicy({
    options, runtimeCapabilities, hasUsableCache, hasUsableApi: hasFreshApi, hasUsableStatic,
  });
  pushProviderDecision(diagnostics, providerDecision);

  if (providerDecision.shouldAttemptLive) {
    const result = await mergeLiveData({ upAheadSettings, data, diagnostics, request });
    data = result.data;
    acquisitionSummary = result.acquisitionSummary;
    if (result.sourceMode) sourceMode = result.sourceMode;
  } else {
    pushLiveSkipped(diagnostics, providerDecision, data);
    if (!providerDecision.browserWideFeedFetchAllowed) {
      acquisitionSummary = data?.acquisitionSummary || { status: 'blocked', reason: 'static_runtime_blocks_browser_live', byCategory: {} };
    }
  }

  // Cache merging may retain the timestamp and provenance of another publisher
  // snapshot. Use the same retained record for both the source and freshness.
  sourceMode = data?.sourceMode || sourceMode;
  const visible = buildVisible(data, settings);
  acquisitionSummary ||= data?.acquisitionSummary || null;
  const evidence = visible.projected.upAheadEvidence;
  const briefing = visible.projected.upAheadBriefing;
  const ok = visible.projected.hasVisibleContent;
  const fresh = ok && data?.auditSummary?.fallback !== 'festival_calendar'
    && sourceMode !== 'calendar' && sourceMode !== 'failed'
    && isUpAheadDataFresh(data);
  const coverageError = !ok ? 'Current Up Ahead coverage is unavailable. Please refresh later.'
    : !fresh ? 'The publisher has not provided a fresh update. Showing retained active items only.' : null;
  if (!fresh) diagnostics.push({ event: 'upAheadDataset.coverage_not_fresh', severity: 'warn', message: coverageError });

  const envelope = makeEnvelope({
    ok,
    datasetId: 'upAhead',
    data: { ...visible, briefing, evidence, sourceMode, raw: data, acquisitionSummary },
    source: getSource(sourceMode),
    freshness: ok ? (fresh ? ENVELOPE_FRESHNESS.FRESH : ENVELOPE_FRESHNESS.STALE) : ENVELOPE_FRESHNESS.EMPTY,
    fetchedAt: data?.fetchedAt || data?.lastUpdated || null,
    error: coverageError,
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
  getSource,
};
