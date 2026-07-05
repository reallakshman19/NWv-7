function hasExplicitLiveIntent(options = {}) {
  return options.liveOnly === true || options.policy === 'developer-live';
}

function hasExplicitNoReadIntent(options = {}) {
  return options.liveOnly === true || options.policy === 'developer-live' || options.policy === 'offline';
}

function getRuntimeKind(runtimeCapabilities = {}) {
  if (runtimeCapabilities.runtimeKind) return runtimeCapabilities.runtimeKind;
  if (runtimeCapabilities.isStaticFrontend && runtimeCapabilities.canUseDatasetApi) {
    return 'static-with-dataset-api';
  }
  if (runtimeCapabilities.isStaticFrontend || runtimeCapabilities.isStaticHost) {
    return 'static-only';
  }
  return 'browser-runtime';
}

function getBrowserWideFeedAllowed(runtimeCapabilities = {}, runtimeKind) {
  if (typeof runtimeCapabilities.browserWideFeedFetchAllowed === 'boolean') {
    return runtimeCapabilities.browserWideFeedFetchAllowed;
  }
  if (runtimeKind === 'static-only' || runtimeKind === 'static-with-dataset-api') return false;
  return Boolean(runtimeCapabilities.allowWideFeedFetch ?? true);
}

function getPolicy(options = {}) {
  return options.policy || 'legacy';
}

function getConfiguredBackendUrl(runtimeCapabilities = {}) {
  return String(runtimeCapabilities.configuredBackendUrl || '').trim();
}

function getSkipReason({ hasUsableCache, hasUsableStatic, hasUsableApi, runtimeKind, browserWideFeedFetchAllowed }) {
  if (hasUsableCache) return 'usable-cache';
  if (hasUsableApi) return 'usable-dataset-api';
  if (hasUsableStatic) return 'usable-static';
  if (!browserWideFeedFetchAllowed) return `${runtimeKind}-blocks-browser-live`;
  return null;
}

function getApiSkipReason({ noReadIntent, configuredBackendUrl, runtimeCapabilities }) {
  if (noReadIntent) return 'policy-live-or-offline';
  if (runtimeCapabilities.forceSnapshots || runtimeCapabilities.preferSnapshots === true) return 'snapshot-forced';
  if (!runtimeCapabilities.canUseDatasetApi) return 'dataset-api-unavailable';
  if (!configuredBackendUrl) return 'missing-configured-backend-url';
  return null;
}

function shouldAttemptDatasetApi({ noReadIntent, configuredBackendUrl, runtimeCapabilities }) {
  if (noReadIntent) return false;
  if (runtimeCapabilities.forceSnapshots || runtimeCapabilities.preferSnapshots === true) return false;
  return Boolean(runtimeCapabilities.canUseDatasetApi && configuredBackendUrl);
}

export function resolveUpAheadProviderPolicy(input = {}) {
  const options = input.options || {};
  const runtimeCapabilities = input.runtimeCapabilities || {};
  const policy = getPolicy(options);
  const runtimeKind = getRuntimeKind(runtimeCapabilities);
  const configuredBackendUrl = getConfiguredBackendUrl(runtimeCapabilities);
  const noReadIntent = hasExplicitNoReadIntent(options);
  const preferDatasetApi = Boolean(runtimeCapabilities.canUseDatasetApi && configuredBackendUrl);
  const preferStaticSnapshots = Boolean(runtimeCapabilities.preferSnapshots || runtimeKind === 'static-only');
  const browserWideFeedFetchAllowed = getBrowserWideFeedAllowed(runtimeCapabilities, runtimeKind);
  const shouldReadCache = !options.forceRefresh && !options.liveOnly;
  const shouldReadStatic = !options.liveOnly;
  const shouldAttemptApi = shouldAttemptDatasetApi({ noReadIntent, configuredBackendUrl, runtimeCapabilities });
  const usableExisting = Boolean(input.hasUsableCache || input.hasUsableStatic || input.hasUsableApi);
  const legacy = policy === 'legacy';
  const explicitLive = hasExplicitLiveIntent(options);
  const smartMayLive = !usableExisting && browserWideFeedFetchAllowed;
  const shouldAttemptLive = legacy
    ? browserWideFeedFetchAllowed
    : ((explicitLive || policy === 'smart' || policy === 'refresh-now') && smartMayLive);

  return {
    policy,
    runtimeKind,
    preferDatasetApi,
    preferStaticSnapshots,
    browserWideFeedFetchAllowed,
    shouldReadCache,
    shouldReadStatic,
    shouldAttemptDatasetApi: shouldAttemptApi,
    apiReason: shouldAttemptApi ? 'configured-dataset-api' : null,
    apiSkippedReason: shouldAttemptApi ? null : getApiSkipReason({ noReadIntent, configuredBackendUrl, runtimeCapabilities }),
    shouldAttemptLive,
    liveReason: shouldAttemptLive ? (explicitLive ? 'explicit-live' : 'no-usable-cache-api-or-static') : null,
    skippedLiveReason: shouldAttemptLive ? null : getSkipReason({
      hasUsableCache: input.hasUsableCache,
      hasUsableStatic: input.hasUsableStatic,
      hasUsableApi: input.hasUsableApi,
      runtimeKind,
      browserWideFeedFetchAllowed,
    }),
  };
}

export function shouldAttemptUpAheadLiveFetch(input = {}) {
  return resolveUpAheadProviderPolicy(input).shouldAttemptLive;
}
