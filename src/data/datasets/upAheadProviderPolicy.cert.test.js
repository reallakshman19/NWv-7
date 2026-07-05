import { describe, expect, it } from 'vitest';
import {
  resolveUpAheadProviderPolicy,
  shouldAttemptUpAheadLiveFetch,
} from './upAheadProviderPolicy.js';

const browserRuntime = {
  isStaticFrontend: false,
  allowWideFeedFetch: true,
  canUseDatasetApi: true,
  configuredBackendUrl: 'https://api.example.com',
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
  configuredBackendUrl: 'https://api.example.com',
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

describe('NW-DP-004 Up Ahead dataset API policy', () => {
  it('attempts dataset API for static-with-dataset-api plus configured URL', () => {
    const result = decision({
      options: { policy: 'smart' },
      runtimeCapabilities: staticWithApiRuntime,
    });

    expect(result.shouldAttemptDatasetApi).toBe(true);
    expect(result.apiReason).toBe('configured-dataset-api');
  });

  it('skips dataset API for static-only runtime', () => {
    const result = decision({
      options: { policy: 'smart' },
      runtimeCapabilities: staticOnlyRuntime,
    });

    expect(result.shouldAttemptDatasetApi).toBe(false);
    expect(result.apiSkippedReason).toBe('snapshot-forced');
  });

  it('skips dataset API when snapshots are forced', () => {
    const result = decision({
      options: { policy: 'smart' },
      runtimeCapabilities: { ...staticWithApiRuntime, forceSnapshots: true },
    });

    expect(result.shouldAttemptDatasetApi).toBe(false);
    expect(result.apiSkippedReason).toBe('snapshot-forced');
  });

  it('browser runtime with configured backend can prefer dataset API', () => {
    const result = decision({
      options: { policy: 'smart' },
      runtimeCapabilities: browserRuntime,
    });

    expect(result.runtimeKind).toBe('browser-runtime');
    expect(result.preferDatasetApi).toBe(true);
    expect(result.shouldAttemptDatasetApi).toBe(true);
  });

  it('liveOnly skips cache/static/API reads', () => {
    const result = decision({
      options: { liveOnly: true },
      runtimeCapabilities: staticWithApiRuntime,
    });

    expect(result.shouldReadCache).toBe(false);
    expect(result.shouldReadStatic).toBe(false);
    expect(result.shouldAttemptDatasetApi).toBe(false);
  });

  it('usable API result prevents smart browser live fetch', () => {
    const result = decision({
      options: { policy: 'smart' },
      runtimeCapabilities: browserRuntime,
      hasUsableApi: true,
    });

    expect(result.shouldAttemptLive).toBe(false);
    expect(result.skippedLiveReason).toBe('usable-dataset-api');
  });
});
