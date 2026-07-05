import { describe, expect, it } from 'vitest';
import {
  resolveUpAheadProviderPolicy,
  shouldAttemptUpAheadLiveFetch,
} from './upAheadProviderPolicy.js';

const browserRuntime = {
  isStaticFrontend: false,
  allowWideFeedFetch: true,
  canUseDatasetApi: true,
};

const staticOnlyRuntime = {
  runtimeKind: 'static-only',
  isStaticFrontend: true,
  browserWideFeedFetchAllowed: false,
  preferSnapshots: true,
};

const staticWithApiRuntime = {
  runtimeKind: 'static-with-dataset-api',
  isStaticFrontend: true,
  canUseDatasetApi: true,
  browserWideFeedFetchAllowed: false,
};

function decision(input) {
  return resolveUpAheadProviderPolicy(input);
}

describe('NW-DP-003 Up Ahead provider policy', () => {
  it('smart policy with usable static data does not live fetch', () => {
    const result = decision({
      options: { policy: 'smart' },
      runtimeCapabilities: browserRuntime,
      hasUsableStatic: true,
    });

    expect(result.shouldAttemptLive).toBe(false);
    expect(result.skippedLiveReason).toBe('usable-static');
  });

  it('smart policy with usable cache data does not live fetch', () => {
    const result = decision({
      options: { policy: 'smart' },
      runtimeCapabilities: browserRuntime,
      hasUsableCache: true,
    });

    expect(result.shouldAttemptLive).toBe(false);
    expect(result.skippedLiveReason).toBe('usable-cache');
  });

  it('smart policy without usable cache/static may live fetch only when runtime allows it', () => {
    expect(shouldAttemptUpAheadLiveFetch({
      options: { policy: 'smart' },
      runtimeCapabilities: browserRuntime,
    })).toBe(true);

    expect(shouldAttemptUpAheadLiveFetch({
      options: { policy: 'smart' },
      runtimeCapabilities: staticOnlyRuntime,
    })).toBe(false);
  });

  it('static-only runtime never browser-live-fetches in smart path', () => {
    const result = decision({
      options: { policy: 'smart' },
      runtimeCapabilities: staticOnlyRuntime,
    });

    expect(result.runtimeKind).toBe('static-only');
    expect(result.browserWideFeedFetchAllowed).toBe(false);
    expect(result.shouldAttemptLive).toBe(false);
  });

  it('static-with-dataset-api does not fake API by browser-live-fetching', () => {
    const result = decision({
      options: { policy: 'smart' },
      runtimeCapabilities: staticWithApiRuntime,
    });

    expect(result.runtimeKind).toBe('static-with-dataset-api');
    expect(result.preferDatasetApi).toBe(true);
    expect(result.shouldAttemptLive).toBe(false);
  });

  it('developer-live and liveOnly attempt live only when runtime permits browser feeds', () => {
    expect(shouldAttemptUpAheadLiveFetch({
      options: { policy: 'developer-live' },
      runtimeCapabilities: browserRuntime,
    })).toBe(true);

    expect(shouldAttemptUpAheadLiveFetch({
      options: { liveOnly: true },
      runtimeCapabilities: staticWithApiRuntime,
    })).toBe(false);
  });

  it('forceRefresh bypasses cache but does not grant static live permission', () => {
    const result = decision({
      options: { policy: 'refresh-now', forceRefresh: true },
      runtimeCapabilities: staticOnlyRuntime,
    });

    expect(result.shouldReadCache).toBe(false);
    expect(result.shouldReadStatic).toBe(true);
    expect(result.shouldAttemptLive).toBe(false);
  });

  it('legacy/default remains live-compatible where browser runtime allows feeds', () => {
    const result = decision({
      options: {},
      runtimeCapabilities: browserRuntime,
      hasUsableStatic: true,
    });

    expect(result.policy).toBe('legacy');
    expect(result.shouldReadCache).toBe(true);
    expect(result.shouldReadStatic).toBe(true);
    expect(result.shouldAttemptLive).toBe(true);
  });

  it('provider decision contains diagnostic fields', () => {
    const result = decision({
      options: { policy: 'smart' },
      runtimeCapabilities: browserRuntime,
      hasUsableCache: true,
    });

    expect(result).toMatchObject({
      policy: 'smart',
      runtimeKind: 'browser-runtime',
      shouldAttemptLive: false,
      skippedLiveReason: 'usable-cache',
    });
  });
});
