import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchStaticUpAheadData: vi.fn(),
  fetchLiveUpAheadData: vi.fn(),
  loadFromCache: vi.fn(),
  saveToCache: vi.fn(),
  fetchUpAheadDatasetApiResponse: vi.fn(),
  getRuntimeCapabilities: vi.fn(),
}));

const visibleApi = { sections: { events: [{ title: 'API event' }] }, timeline: [], weekly_plan: [] };
const visibleStatic = { sections: { events: [{ title: 'Static event' }] }, timeline: [], weekly_plan: [] };
const emptyData = { sections: {}, timeline: [], weekly_plan: [] };
const okDiagnostics = { source: 'upstream', reason: 'ok', freshness: 'fresh', ageSeconds: '42' };

function apiResponse(data, diagnostics = okDiagnostics) {
  return { data, diagnostics };
}

vi.mock('./upAheadDatasetApiClient.js', () => ({ fetchUpAheadDatasetApiResponse: mocks.fetchUpAheadDatasetApiResponse }));
vi.mock('../../runtime/runtimeCapabilities.js', () => ({ getRuntimeCapabilities: mocks.getRuntimeCapabilities }));
vi.mock('../../utils/storage.js', () => ({ getSettings: () => ({ upAhead: { categories: {}, locations: ['Chennai'] } }) }));
vi.mock('../../utils/plannerStorage.js', () => ({ default: { loadBlacklistFromApi: vi.fn(), loadPlanFromApi: vi.fn() } }));
vi.mock('../../services/upAheadEvidence.js', () => ({ getUpAheadEvidence: () => ({}) }));
vi.mock('../../services/upAheadBriefing.js', () => ({ getUpAheadBriefing: () => ({}) }));
vi.mock('../../services/upAheadService.js', () => ({
  fetchStaticUpAheadData: mocks.fetchStaticUpAheadData,
  fetchLiveUpAheadData: mocks.fetchLiveUpAheadData,
  loadFromCache: mocks.loadFromCache,
  saveToCache: mocks.saveToCache,
  isActualWeatherAlertText: () => true,
  isActualOfferText: () => true,
  mergeUpAheadData: (base, incoming) => incoming || base,
}));

function setStaticWithApiRuntime() {
  mocks.getRuntimeCapabilities.mockReturnValue({
    runtimeKind: 'static-with-dataset-api',
    isStaticFrontend: true,
    canUseDatasetApi: true,
    configuredBackendUrl: 'https://api.example.com',
    browserWideFeedFetchAllowed: false,
  });
}

describe('NW-DP-004 Up Ahead dataset provider chain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    setStaticWithApiRuntime();
    mocks.loadFromCache.mockReturnValue(null);
    mocks.fetchStaticUpAheadData.mockResolvedValue(visibleStatic);
    mocks.fetchLiveUpAheadData.mockResolvedValue(visibleApi);
  });

  it('prefers usable API result before static fallback', async () => {
    mocks.fetchUpAheadDatasetApiResponse.mockResolvedValue(apiResponse(visibleApi));
    const { load } = await import('./upAheadDataset.js');

    const envelope = await load({ policy: 'smart' });

    expect(mocks.fetchUpAheadDatasetApiResponse).toHaveBeenCalledTimes(1);
    expect(mocks.fetchStaticUpAheadData).not.toHaveBeenCalled();
    expect(mocks.fetchLiveUpAheadData).not.toHaveBeenCalled();
    expect(envelope.data.sourceMode).toBe('dataset-api');
  });

  it('falls back to static when API returns unusable data', async () => {
    mocks.fetchUpAheadDatasetApiResponse.mockResolvedValue(apiResponse(emptyData));
    const { load } = await import('./upAheadDataset.js');

    const envelope = await load({ policy: 'smart' });

    expect(mocks.fetchUpAheadDatasetApiResponse).toHaveBeenCalledTimes(1);
    expect(mocks.fetchStaticUpAheadData).toHaveBeenCalledTimes(1);
    expect(mocks.fetchLiveUpAheadData).not.toHaveBeenCalled();
    expect(envelope.data.sourceMode).toBe('snapshot');
  });

  it('records API and provider policy diagnostics', async () => {
    mocks.fetchUpAheadDatasetApiResponse.mockResolvedValue(apiResponse(visibleApi));
    const { load } = await import('./upAheadDataset.js');

    const envelope = await load({ policy: 'smart' });
    const events = envelope.diagnostics.map(item => item.event);

    expect(events).toContain('upAheadDataset.api_attempted');
    expect(events).toContain('upAheadDataset.api_loaded');
    expect(events).toContain('upAheadDataset.provider_policy');
    expect(events).toContain('upAheadDataset.live_skipped_runtime');
  });

  it('records edge API diagnostics when API is attempted', async () => {
    mocks.fetchUpAheadDatasetApiResponse.mockResolvedValue(apiResponse(visibleApi, {
      source: 'upstream',
      reason: 'ok',
      freshness: 'fresh',
      ageSeconds: '42',
    }));
    const { load } = await import('./upAheadDataset.js');

    const envelope = await load({ policy: 'smart' });
    const edgeEvent = envelope.diagnostics.find(item => item.event === 'upAheadDataset.api_edge_diagnostics');

    expect(edgeEvent).toBeTruthy();
    expect(edgeEvent.details).toEqual({
      source: 'upstream',
      reason: 'ok',
      freshness: 'fresh',
      ageSeconds: '42',
    });
  });

  it('does not reject usable API data because edge freshness is stale', async () => {
    mocks.fetchUpAheadDatasetApiResponse.mockResolvedValue(apiResponse(visibleApi, {
      source: 'upstream',
      reason: 'ok',
      freshness: 'stale',
      ageSeconds: '999999',
    }));
    const { load } = await import('./upAheadDataset.js');

    const envelope = await load({ policy: 'smart' });

    expect(envelope.data.sourceMode).toBe('dataset-api');
    expect(mocks.fetchStaticUpAheadData).not.toHaveBeenCalled();
    expect(envelope.diagnostics.find(item => item.event === 'upAheadDataset.api_edge_diagnostics')?.details.freshness).toBe('stale');
  });

  it('does not reject usable API data because edge freshness is unknown', async () => {
    mocks.fetchUpAheadDatasetApiResponse.mockResolvedValue(apiResponse(visibleApi, {
      source: 'upstream',
      reason: 'ok',
      freshness: 'unknown',
      ageSeconds: 'unknown',
    }));
    const { load } = await import('./upAheadDataset.js');

    const envelope = await load({ policy: 'smart' });

    expect(envelope.data.sourceMode).toBe('dataset-api');
    expect(mocks.fetchStaticUpAheadData).not.toHaveBeenCalled();
    expect(envelope.diagnostics.find(item => item.event === 'upAheadDataset.api_edge_diagnostics')?.details.freshness).toBe('unknown');
  });
});
