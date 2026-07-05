import { describe, expect, it } from 'vitest';
import { resolveRuntimeCapabilities } from './runtimeCapabilities.js';

const REQUIRED_FIELDS = [
  'isBrowser',
  'hostname',
  'isStaticHost',
  'staticFrontend',
  'backendConfigured',
  'canUseBackendApi',
  'preferSnapshots',
  'allowWideFeedFetch',
  'allowRemoteSettingsSync',
  'canUseApi',
  'canUseRemoteStorage',
  'canUseLocalStorage',
  'weatherMode',
  'marketMode',
  'upAheadMode',
  'plannerSyncMode',
  'featureStatus',
  'runtimeLabel',
  'configuredBackendUrl',
  'datasetApiConfigured',
  'canUseDatasetApi',
  'preferDatasetApi',
  'preferStaticSnapshots',
  'staticSnapshotFallback',
  'browserWideFeedFetchAllowed',
  'forceSnapshots',
  'runtimeKind',
];

function browserCaps(hostname, options = {}) {
  return resolveRuntimeCapabilities({ isBrowser: true, hostname, ...options });
}

describe('NW-DP-002 runtime capability split', () => {
  it('classifies GitHub Pages without API as static-only', () => {
    const caps = browserCaps('example.github.io');

    expect(caps.staticFrontend).toBe(true);
    expect(caps.canUseDatasetApi).toBe(false);
    expect(caps.preferStaticSnapshots).toBe(true);
    expect(caps.preferSnapshots).toBe(true);
    expect(caps.browserWideFeedFetchAllowed).toBe(false);
    expect(caps.allowWideFeedFetch).toBe(false);
    expect(caps.runtimeKind).toBe('static-only');
  });

  it('classifies Cloudflare Pages with API as static-with-dataset-api', () => {
    const caps = browserCaps('example.pages.dev', {
      configuredBackendUrl: 'https://data.example.test',
    });

    expect(caps.staticFrontend).toBe(true);
    expect(caps.datasetApiConfigured).toBe(true);
    expect(caps.canUseDatasetApi).toBe(true);
    expect(caps.preferDatasetApi).toBe(true);
    expect(caps.preferStaticSnapshots).toBe(false);
    expect(caps.preferSnapshots).toBe(false);
    expect(caps.staticSnapshotFallback).toBe(true);
    expect(caps.browserWideFeedFetchAllowed).toBe(false);
    expect(caps.allowWideFeedFetch).toBe(false);
    expect(caps.runtimeKind).toBe('static-with-dataset-api');
  });

  it('classifies Netlify with API as static-with-dataset-api', () => {
    const caps = browserCaps('site.netlify.app', {
      configuredBackendUrl: 'https://data.example.test',
    });

    expect(caps.isStaticHost).toBe(true);
    expect(caps.canUseDatasetApi).toBe(true);
    expect(caps.runtimeKind).toBe('static-with-dataset-api');
    expect(caps.runtimeLabel).toBe('static-host-with-dataset-api');
  });

  it('classifies Vercel without API as static-only', () => {
    const caps = browserCaps('site.vercel.app');

    expect(caps.staticFrontend).toBe(true);
    expect(caps.canUseDatasetApi).toBe(false);
    expect(caps.runtimeKind).toBe('static-only');
  });

  it('preserves localhost browser runtime behavior', () => {
    const caps = browserCaps('localhost');

    expect(caps.staticFrontend).toBe(false);
    expect(caps.canUseDatasetApi).toBe(true);
    expect(caps.preferDatasetApi).toBe(true);
    expect(caps.preferStaticSnapshots).toBe(false);
    expect(caps.browserWideFeedFetchAllowed).toBe(true);
    expect(caps.allowWideFeedFetch).toBe(true);
    expect(caps.runtimeKind).toBe('browser-runtime');
  });

  it('lets snapshot override win on static host even when API is configured', () => {
    const caps = browserCaps('example.pages.dev', {
      configuredBackendUrl: 'https://data.example.test',
      forceSnapshots: true,
    });

    expect(caps.forceSnapshots).toBe(true);
    expect(caps.preferStaticSnapshots).toBe(true);
    expect(caps.preferSnapshots).toBe(true);
    expect(caps.preferDatasetApi).toBe(false);
    expect(caps.canUseDatasetApi).toBe(false);
    expect(caps.browserWideFeedFetchAllowed).toBe(false);
  });

  it('lets localStorage snapshot override semantics win via resolver input', () => {
    const caps = browserCaps('localhost', { forceSnapshots: true });

    expect(caps.forceSnapshots).toBe(true);
    expect(caps.preferSnapshots).toBe(true);
    expect(caps.canUseLocalRuntimeApi).toBe(false);
    expect(caps.allowWideFeedFetch).toBe(false);
  });

  it('reports server-or-test without browser local storage claim', () => {
    const caps = resolveRuntimeCapabilities({ isBrowser: false, hostname: '' });

    expect(caps.runtimeKind).toBe('server-or-test');
    expect(caps.canUseLocalStorage).toBe(false);
    expect(caps.staticSnapshotFallback).toBe(false);
  });

  it('preserves compatibility fields', () => {
    const caps = browserCaps('localhost');

    REQUIRED_FIELDS.forEach(field => {
      expect(caps).toHaveProperty(field);
    });
  });

  it('does not allow wide feed fetch on static frontend just because API is configured', () => {
    const caps = browserCaps('example.github.io', {
      configuredBackendUrl: 'https://data.example.test',
    });

    expect(caps.canUseDatasetApi).toBe(true);
    expect(caps.browserWideFeedFetchAllowed).toBe(false);
    expect(caps.allowWideFeedFetch).toBe(false);
  });
});
