function hasExplicitLiveIntent(options = {}) {
  return options.liveOnly === true || options.policy === 'developer-live';
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

function getSkipReason({ hasUsableCache, hasUsableStatic, runtimeKind, browserWideFeedFetchAllowed }) {
  if (hasUsableCache) return 'usable-cache';
  if (hasUsableStatic) return 'usable-static';
  if (!browserWideFeedFetchAllowed) return `${runtimeKind}-blocks-browser-live`;
  return null;
}

export function resolveUpAheadProviderPolicy(input = {}) {
  const options = input.options || {};
  const runtimeCapabilities = input.runtimeCapabilities || {};
  const policy = getPolicy(options);
  const runtimeKind = getRuntimeKind(runtimeCapabilities);
  const preferDatasetApi = Boolean(runtimeCapabilities.canUseDatasetApi && runtimeCapabilities.isStaticFrontend);
  const preferStaticSnapshots = Boolean(runtimeCapabilities.preferSnapshots || runtimeKind === 'static-only');
  const browserWideFeedFetchAllowed = getBrowserWideFeedAllowed(runtimeCapabilities, runtimeKind);
  const shouldReadCache = !options.forceRefresh && !options.liveOnly;
  const shouldReadStatic = !options.liveOnly;
  const usableExisting = Boolean(input.hasUsableCache || input.hasUsableStatic);
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
    shouldAttemptLive,
    liveReason: shouldAttemptLive ? (explicitLive ? 'explicit-live' : 'no-usable-cache-or-static') : null,
    skippedLiveReason: shouldAttemptLive ? null : getSkipReason({
      hasUsableCache: input.hasUsableCache,
      hasUsableStatic: input.hasUsableStatic,
      runtimeKind,
      browserWideFeedFetchAllowed,
    }),
  };
}

export function shouldAttemptUpAheadLiveFetch(input = {}) {
  return resolveUpAheadProviderPolicy(input).shouldAttemptLive;
}
