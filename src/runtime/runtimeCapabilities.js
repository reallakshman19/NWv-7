// src/runtime/runtimeCapabilities.js

const STATIC_HOST_PATTERNS = [
  /github\.io$/i,
  /\.netlify\.app$/i,
  /\.vercel\.app$/i,
  /\.pages\.dev$/i,
];

function isKnownStaticHost(hostname) {
  return STATIC_HOST_PATTERNS.some(pattern => pattern.test(hostname || ''));
}

function getConfiguredBackendUrl() {
  return (
    import.meta.env?.VITE_API_BASE_URL ||
    import.meta.env?.VITE_BACKEND_URL ||
    ''
  );
}

function readSnapshotOverride(isBrowser) {
  if (!isBrowser) return false;
  try {
    const params = window.location?.search
      ? new URLSearchParams(window.location.search)
      : null;
    const fromUrl = params
      ? (params.get('preferSnapshots') === 'true' || params.get('prefer_snapshots') === 'true')
      : false;
    const fromStorage = typeof localStorage !== 'undefined'
      ? (localStorage.getItem('preferSnapshots') === 'true' || localStorage.getItem('prefer_snapshots') === 'true')
      : false;
    return fromUrl || fromStorage;
  } catch {
    return false;
  }
}

function normalizeBackendUrl(value) {
  return String(value || '').trim();
}

function getCanUseLocalRuntimeApi(isBrowser, staticFrontend, forceSnapshots) {
  return Boolean(isBrowser && !staticFrontend && !forceSnapshots);
}

function getCanUseConfiguredDatasetApi(configuredBackendUrl, forceSnapshots) {
  return Boolean(normalizeBackendUrl(configuredBackendUrl) && !forceSnapshots);
}

function getRuntimeKind({ isBrowser, staticFrontend, canUseDatasetApi }) {
  if (!isBrowser) return 'server-or-test';
  if (staticFrontend && canUseDatasetApi) return 'static-with-dataset-api';
  if (staticFrontend) return 'static-only';
  return 'browser-runtime';
}

function getDatasetRuntimeMode({ canUseDatasetApi, preferStaticSnapshots }) {
  if (canUseDatasetApi) return 'dataset-api';
  return preferStaticSnapshots ? 'static-snapshot' : 'local-runtime';
}

function getRuntimeLabel({ runtimeKind, preferStaticSnapshots }) {
  if (runtimeKind === 'static-with-dataset-api') return 'static-host-with-dataset-api';
  if (runtimeKind === 'static-only' || preferStaticSnapshots) return 'static-host';
  return runtimeKind === 'browser-runtime' ? 'full-runtime' : 'server-or-test';
}

function getFeatureStatus(preferStaticSnapshots, canUseDatasetApi, datasetRuntimeMode) {
  return {
    settings: preferStaticSnapshots ? 'local-only' : 'remote-capable',
    planner: preferStaticSnapshots ? 'local-only' : 'remote-capable',
    weather: preferStaticSnapshots ? 'snapshot-or-cache' : 'live',
    market: preferStaticSnapshots ? 'snapshot-or-cache' : 'live',
    upAhead: preferStaticSnapshots ? 'limited-live' : 'full-live',
    datasetApi: canUseDatasetApi ? datasetRuntimeMode : 'unavailable'
  };
}

function getApiCapabilityFields(values) {
  return {
    canUseBackendApi: values.backendConfigured,
    canUseDatasetApi: values.canUseDatasetApi,
    datasetApiConfigured: values.canUseConfiguredDatasetApi,
    canUseConfiguredDatasetApi: values.canUseConfiguredDatasetApi,
    canUseLocalRuntimeApi: values.canUseLocalRuntimeApi,
    datasetRuntimeMode: values.datasetRuntimeMode,
    allowRemoteSettingsSync: values.backendConfigured,
    canUseApi: values.backendConfigured,
    canUseRemoteStorage: values.backendConfigured,
    canUseLocalStorage: values.isBrowser,
  };
}

function getDatasetModeFields(preferStaticSnapshots) {
  return {
    weatherMode: preferStaticSnapshots ? 'cache-or-snapshot' : 'live',
    marketMode: preferStaticSnapshots ? 'snapshot-first' : 'live',
    upAheadMode: preferStaticSnapshots ? 'limited-live' : 'full-live',
    plannerSyncMode: preferStaticSnapshots ? 'local-only' : 'remote-capable',
  };
}

function deriveRuntimeValues(input) {
  const isBrowser = Boolean(input.isBrowser);
  const hostname = input.hostname || '';
  const staticFrontend = isKnownStaticHost(hostname);
  const configuredBackendUrl = normalizeBackendUrl(input.configuredBackendUrl);
  const forceSnapshots = Boolean(input.forceSnapshots);
  const canUseLocalRuntimeApi = getCanUseLocalRuntimeApi(isBrowser, staticFrontend, forceSnapshots);
  const canUseConfiguredDatasetApi = getCanUseConfiguredDatasetApi(configuredBackendUrl, forceSnapshots);
  const canUseDatasetApi = canUseConfiguredDatasetApi || canUseLocalRuntimeApi;
  const preferDatasetApi = canUseDatasetApi && !forceSnapshots;
  const preferStaticSnapshots = forceSnapshots || (!canUseDatasetApi && staticFrontend);
  const browserWideFeedFetchAllowed = canUseLocalRuntimeApi;
  const staticSnapshotFallback = Boolean(isBrowser && staticFrontend);
  const runtimeKind = getRuntimeKind({ isBrowser, staticFrontend, canUseDatasetApi });
  const datasetRuntimeMode = getDatasetRuntimeMode({ canUseDatasetApi, preferStaticSnapshots });
  return {
    isBrowser, hostname, staticFrontend, configuredBackendUrl, forceSnapshots,
    canUseLocalRuntimeApi, canUseConfiguredDatasetApi, canUseDatasetApi,
    preferDatasetApi, preferStaticSnapshots, browserWideFeedFetchAllowed,
    staticSnapshotFallback, runtimeKind, datasetRuntimeMode,
    backendConfigured: canUseDatasetApi,
  };
}

export function resolveRuntimeCapabilities(input = {}) {
  const values = deriveRuntimeValues(input);
  const runtimeLabel = getRuntimeLabel(values);
  return {
    isBrowser: values.isBrowser,
    hostname: values.hostname,
    isStaticHost: values.staticFrontend,
    isStaticFrontend: values.staticFrontend,
    staticFrontend: values.staticFrontend,
    configuredBackendUrl: values.configuredBackendUrl,
    backendConfigured: values.backendConfigured,
    forceSnapshots: values.forceSnapshots,
    preferDatasetApi: values.preferDatasetApi,
    preferStaticSnapshots: values.preferStaticSnapshots,
    preferSnapshots: values.preferStaticSnapshots,
    staticSnapshotFallback: values.staticSnapshotFallback,
    browserWideFeedFetchAllowed: values.browserWideFeedFetchAllowed,
    allowWideFeedFetch: values.browserWideFeedFetchAllowed,
    runtimeKind: values.runtimeKind,
    ...getApiCapabilityFields(values),
    ...getDatasetModeFields(values.preferStaticSnapshots),
    featureStatus: getFeatureStatus(
      values.preferStaticSnapshots, values.canUseDatasetApi, values.datasetRuntimeMode
    ),
    runtimeLabel,
  };
}

export function getRuntimeCapabilities() {
  const isBrowser = typeof window !== 'undefined';
  return resolveRuntimeCapabilities({
    isBrowser,
    hostname: isBrowser ? window.location.hostname : '',
    configuredBackendUrl: getConfiguredBackendUrl(),
    forceSnapshots: readSnapshotOverride(isBrowser),
  });
}
