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

function getCanUseLocalRuntimeApi(isBrowser, isStaticHost, forceSnapshots) {
  return Boolean(isBrowser && !isStaticHost && !forceSnapshots);
}

function getCanUseConfiguredDatasetApi(configuredBackendUrl, forceSnapshots) {
  return Boolean(normalizeBackendUrl(configuredBackendUrl) && !forceSnapshots);
}

function getDatasetRuntimeMode({ canUseDatasetApi, preferSnapshots }) {
  if (canUseDatasetApi) return 'dataset-api';
  return preferSnapshots ? 'static-snapshot' : 'local-runtime';
}

function getRuntimeLabel({ isStaticHost, canUseDatasetApi, preferSnapshots }) {
  if (isStaticHost && canUseDatasetApi) return 'static-host-with-dataset-api';
  if (preferSnapshots) return 'static-host';
  return canUseDatasetApi ? 'full-runtime' : 'snapshot-runtime';
}

export function getRuntimeCapabilities() {
  const isBrowser = typeof window !== 'undefined';
  const hostname = isBrowser ? window.location.hostname : '';
  const isStaticHost = isKnownStaticHost(hostname);
  const configuredBackendUrl = normalizeBackendUrl(getConfiguredBackendUrl());

  // Developer override: force pure client-side snapshot mode on localhost via
  // ?preferSnapshots=true (or localStorage). This bypasses local API endpoints
  // (no /api 500s) and wide RSS proxy fetches (no CORS/429 floods) so the app
  // runs fully from static JSON, exactly like the deployed static host.
  const forceSnapshots = readSnapshotOverride(isBrowser);
  const canUseLocalRuntimeApi = getCanUseLocalRuntimeApi(isBrowser, isStaticHost, forceSnapshots);
  const canUseConfiguredDatasetApi = getCanUseConfiguredDatasetApi(configuredBackendUrl, forceSnapshots);
  const canUseDatasetApi = canUseConfiguredDatasetApi || canUseLocalRuntimeApi;
  const preferSnapshots = forceSnapshots || (!canUseDatasetApi && isStaticHost);

  const backendConfigured = canUseLocalRuntimeApi;
  const datasetRuntimeMode = getDatasetRuntimeMode({ canUseDatasetApi, preferSnapshots });
  const runtimeLabel = getRuntimeLabel({ isStaticHost, canUseDatasetApi, preferSnapshots });

  return {
    isBrowser,
    hostname,
    isStaticHost,
    isStaticFrontend: isStaticHost,
    configuredBackendUrl,
    backendConfigured,

    // Existing compatibility fields.
    canUseBackendApi: backendConfigured,
    preferSnapshots,
    allowWideFeedFetch: !preferSnapshots,

    // Dataset API capability is intentionally separate from static frontend status.
    canUseDatasetApi,
    datasetApiConfigured: canUseConfiguredDatasetApi,
    canUseConfiguredDatasetApi,
    canUseLocalRuntimeApi,
    datasetRuntimeMode,

    // Release 1C compatibility + future runtime fields.
    allowRemoteSettingsSync: backendConfigured,
    canUseApi: backendConfigured,
    canUseRemoteStorage: backendConfigured,
    canUseLocalStorage: isBrowser,

    weatherMode: preferSnapshots ? 'cache-or-snapshot' : 'live',
    marketMode: preferSnapshots ? 'snapshot-first' : 'live',
    upAheadMode: preferSnapshots ? 'limited-live' : 'full-live',
    plannerSyncMode: preferSnapshots ? 'local-only' : 'remote-capable',

    featureStatus: {
      settings: preferSnapshots ? 'local-only' : 'remote-capable',
      planner: preferSnapshots ? 'local-only' : 'remote-capable',
      weather: preferSnapshots ? 'snapshot-or-cache' : 'live',
      market: preferSnapshots ? 'snapshot-or-cache' : 'live',
      upAhead: preferSnapshots ? 'limited-live' : 'full-live',
      datasetApi: canUseDatasetApi ? datasetRuntimeMode : 'unavailable'
    },

    runtimeLabel
  };
}
