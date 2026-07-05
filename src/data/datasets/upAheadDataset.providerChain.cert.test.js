import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchStaticUpAheadData: vi.fn(),
  fetchLiveUpAheadData: vi.fn(),
  loadFromCache: vi.fn(),
  saveToCache: vi.fn(),
  fetchUpAheadDatasetApiData: vi.fn(),
  getRuntimeCapabilities: vi.fn(),
}));

const visibleApi = { sections: { events: [{ title: 'API event' }] }, timeline: [], weekly_plan: [] };
const visibleStatic = { sections: { events: [{ title: 'Static event' }] }, timeline: [], weekly_plan: [] };
const emptyData = { sections: {}, timeline: [], weekly_plan: [] };

vi.mock('./upAheadDatasetApiClient.js', () => ({ fetchUpAheadDatasetApiData: mocks.fetchUpAheadDatasetApiData }));
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
    mocks.fetchUpAheadDatasetApiData.mockResolvedValue(visibleApi);
    const { load } = await import('./upAheadDataset.js');

    const envelope = await load({ policy: 'smart' });

    expect(mocks.fetchUpAheadDatasetApiData).toHaveBeenCalledTimes(1);
    expect(mocks.fetchStaticUpAheadData).not.toHaveBeenCalled();
    expect(mocks.fetchLiveUpAheadData).not.toHaveBeenCalled();
    expect(envelope.data.sourceMode).toBe('dataset-api');
  });

  it('falls back to static when API returns unusable data', async () => {
    mocks.fetchUpAheadDatasetApiData.mockResolvedValue(emptyData);
    const { load } = await import('./upAheadDataset.js');

    const envelope = await load({ policy: 'smart' });

    expect(mocks.fetchUpAheadDatasetApiData).toHaveBeenCalledTimes(1);
    expect(mocks.fetchStaticUpAheadData).toHaveBeenCalledTimes(1);
    expect(mocks.fetchLiveUpAheadData).not.toHaveBeenCalled();
    expect(envelope.data.sourceMode).toBe('snapshot');
  });

  it('records API and provider policy diagnostics', async () => {
    mocks.fetchUpAheadDatasetApiData.mockResolvedValue(visibleApi);
    const { load } = await import('./upAheadDataset.js');

    const envelope = await load({ policy: 'smart' });
    const events = envelope.diagnostics.map(item => item.event);

    expect(events).toContain('upAheadDataset.api_attempted');
    expect(events).toContain('upAheadDataset.api_loaded');
    expect(events).toContain('upAheadDataset.provider_policy');
    expect(events).toContain('upAheadDataset.live_skipped_runtime');
  });
});
