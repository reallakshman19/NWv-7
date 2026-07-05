import { describe, expect, it } from 'vitest';
import { resolveRuntimeCapabilities } from './runtimeCapabilities.js';

describe('NW-DP-002 runtime capability split', () => {
  it('keeps static frontend distinct from configured dataset API', () => {
    const caps = resolveRuntimeCapabilities({
      isBrowser: true,
      hostname: 'example.github.io',
      configuredBackendUrl: 'https://data.example.test',
    });

    expect(caps.isStaticFrontend).toBe(true);
    expect(caps.isStaticHost).toBe(true);
    expect(caps.canUseDatasetApi).toBe(true);
    expect(caps.datasetApiConfigured).toBe(true);
    expect(caps.preferSnapshots).toBe(false);
    expect(caps.datasetRuntimeMode).toBe('dataset-api');
    expect(caps.runtimeLabel).toBe('static-host-with-dataset-api');
  });

  it('keeps static snapshot behavior when no dataset API is configured', () => {
    const caps = resolveRuntimeCapabilities({
      isBrowser: true,
      hostname: 'example.github.io',
      configuredBackendUrl: '',
    });

    expect(caps.isStaticFrontend).toBe(true);
    expect(caps.canUseDatasetApi).toBe(false);
    expect(caps.preferSnapshots).toBe(true);
    expect(caps.datasetRuntimeMode).toBe('static-snapshot');
    expect(caps.runtimeLabel).toBe('static-host');
  });

  it('lets snapshot override win even when dataset API is configured', () => {
    const caps = resolveRuntimeCapabilities({
      isBrowser: true,
      hostname: 'example.pages.dev',
      configuredBackendUrl: 'https://data.example.test',
      forceSnapshots: true,
    });

    expect(caps.canUseDatasetApi).toBe(false);
    expect(caps.preferSnapshots).toBe(true);
    expect(caps.datasetApiConfigured).toBe(false);
    expect(caps.runtimeLabel).toBe('static-host');
  });

  it('preserves local non-static runtime compatibility', () => {
    const caps = resolveRuntimeCapabilities({
      isBrowser: true,
      hostname: 'localhost',
      configuredBackendUrl: '',
    });

    expect(caps.isStaticFrontend).toBe(false);
    expect(caps.canUseLocalRuntimeApi).toBe(true);
    expect(caps.canUseBackendApi).toBe(true);
    expect(caps.canUseApi).toBe(true);
    expect(caps.canUseDatasetApi).toBe(true);
    expect(caps.preferSnapshots).toBe(false);
  });
});
