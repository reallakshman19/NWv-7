import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchStaticUpAheadData: vi.fn(),
  fetchLiveUpAheadData: vi.fn(),
  loadFromCache: vi.fn(),
  fetchUpAheadDatasetApiResponse: vi.fn(),
  getRuntimeCapabilities: vi.fn(),
}));

// A Worker response header alone cannot qualify freshness; preserve the source epoch.
const visibleApi = { fetchedAt: Date.now(), sections: { events: [{ title: 'API event' }] }, timeline: [], weekly_plan: [] };
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
vi.mock('../../services/upAheadService.js', async importOriginal => ({
  ...await importOriginal(),
  fetchStaticUpAheadData: mocks.fetchStaticUpAheadData,
  fetchLiveUpAheadData: mocks.fetchLiveUpAheadData,
  loadFromCache: mocks.loadFromCache,
  isActualWeatherAlertText: () => true,
  isActualOfferText: () => true,
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

  afterEach(() => vi.unstubAllGlobals());

  it('prefers usable API result before static fallback', async () => {
    mocks.fetchUpAheadDatasetApiResponse.mockResolvedValue(apiResponse(visibleApi));
    const { load } = await import('./upAheadDataset.js');

    const envelope = await load({ policy: 'smart' });

    expect(mocks.fetchUpAheadDatasetApiResponse).toHaveBeenCalledTimes(1);
    expect(mocks.fetchStaticUpAheadData).not.toHaveBeenCalled();
    expect(mocks.fetchLiveUpAheadData).not.toHaveBeenCalled();
    expect(envelope.data.sourceMode).toBe('dataset-api');
    expect(envelope.freshness).toBe('fresh');
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

  it('retains active stale API items and checks for a newer published snapshot', async () => {
    mocks.fetchUpAheadDatasetApiResponse.mockResolvedValue(apiResponse(visibleApi, {
      source: 'upstream',
      reason: 'ok',
      freshness: 'stale',
      ageSeconds: '999999',
    }));
    const { load } = await import('./upAheadDataset.js');

    const envelope = await load({ policy: 'smart' });

    expect(mocks.fetchStaticUpAheadData).toHaveBeenCalledTimes(1);
    expect(envelope.data.events.map(item => item.title)).toEqual(['API event', 'Static event']);
    expect(envelope.diagnostics.find(item => item.event === 'upAheadDataset.api_edge_diagnostics')?.details.freshness).toBe('stale');
  });

  it.each(['stale', 'unknown'])('keeps API items with a %s header degraded through cache', async (freshness) => {
    const cache = new Map();
    vi.stubGlobal('localStorage', {
      getItem: key => cache.get(key) || null,
      setItem: (key, value) => cache.set(key, value),
    });
    const recentByDeviceClock = { ...visibleApi, fetchedAt: Date.now() - 43_140_000 };
    mocks.fetchStaticUpAheadData.mockResolvedValue(null);
    mocks.fetchUpAheadDatasetApiResponse.mockResolvedValue(apiResponse(recentByDeviceClock, {
      source: 'upstream',
      reason: 'ok',
      freshness,
      ageSeconds: freshness === 'stale' ? '43260' : 'unknown',
    }));
    const { load } = await import('./upAheadDataset.js');

    const envelope = await load({ policy: 'smart' });

    expect(envelope.data.sourceMode).toBe('dataset-api');
    expect(mocks.fetchStaticUpAheadData).toHaveBeenCalledTimes(1);
    expect(envelope.data.events.map(item => item.title)).toEqual(['API event']);
    expect(envelope.freshness).toBe('stale');
    expect(envelope.error).toContain('retained active items');
    expect(envelope.diagnostics.find(item => item.event === 'upAheadDataset.api_edge_diagnostics')?.details.freshness).toBe(freshness);

    const retained = JSON.parse(cache.get('upAhead_cache'));
    expect(retained).toMatchObject({ sourceMode: 'dataset-api', datasetApiFreshness: freshness });
    mocks.loadFromCache.mockReturnValue(retained);
    mocks.getRuntimeCapabilities.mockReturnValue({ runtimeKind: 'static-only', isStaticHost: true });
    const cachedEnvelope = await load({ policy: 'smart' });
    expect(cachedEnvelope).toMatchObject({ ok: true, freshness: 'stale' });
    expect(mocks.fetchUpAheadDatasetApiResponse).toHaveBeenCalledTimes(1);
  });

  it('attributes fresh static coverage to the static epoch, even beside a newer stale API timestamp', async () => {
    mocks.fetchUpAheadDatasetApiResponse.mockResolvedValue(apiResponse(visibleApi, { freshness: 'stale' }));
    const staticEpoch = Date.now() - 60_000;
    mocks.fetchStaticUpAheadData.mockResolvedValue({ ...visibleStatic, fetchedAt: staticEpoch });
    const { load } = await import('./upAheadDataset.js');
    const envelope = await load({ policy: 'smart' });
    expect(envelope).toMatchObject({ freshness: 'fresh', fetchedAt: staticEpoch });
    expect(envelope.data).toMatchObject({ sourceMode: 'snapshot', raw: { fetchedAt: staticEpoch, datasetApiFreshness: null } });
    expect(envelope.data.events.map(item => item.title)).toEqual(['API event', 'Static event']);
  });

  it('merges raw snapshot items from the API during a forced refresh without clearing the retained feed', async () => {
    mocks.loadFromCache.mockReturnValue(visibleStatic);
    const now = Date.now();
    mocks.fetchUpAheadDatasetApiResponse.mockResolvedValue(apiResponse({
      fetchedAt: now,
      items: [{
        id: 'raw-event',
        title: 'Raw API event',
        category: 'events',
        eventStartAt: now + 86_400_000,
        plannerEligible: true,
      }],
    }));
    const { load } = await import('./upAheadDataset.js');
    const envelope = await load({ policy: 'refresh-now', forceRefresh: true });

    expect(envelope.data.events.map(item => item.title)).toEqual(['Static event', 'Raw API event']);
    expect(mocks.fetchStaticUpAheadData).not.toHaveBeenCalled();
    expect(mocks.fetchLiveUpAheadData).not.toHaveBeenCalled();
  });
});
