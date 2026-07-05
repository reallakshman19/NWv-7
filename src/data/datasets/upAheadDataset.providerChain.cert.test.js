import { beforeEach, describe, expect, it, vi } from 'vitest';

const visibleApi = { sections: { events: [{ title: 'API event' }] }, timeline: [], weekly_plan: [] };
const visibleStatic = { sections: { events: [{ title: 'Static event' }] }, timeline: [], weekly_plan: [] };
const emptyData = { sections: {}, timeline: [], weekly_plan: [] };

const fetchStaticUpAheadData = vi.fn();
const fetchLiveUpAheadData = vi.fn();
const loadFromCache = vi.fn();
const saveToCache = vi.fn();
const fetchUpAheadDatasetApiData = vi.fn();
const getRuntimeCapabilities = vi.fn();

vi.mock('./upAheadDatasetApiClient.js', () => ({ fetchUpAheadDatasetApiData }));
vi.mock('../../runtime/runtimeCapabilities.js', () => ({ getRuntimeCapabilities }));
vi.mock('../../utils/storage.js', () => ({ getSettings: () => ({ upAhead: { categories: {}, locations: ['Chennai'] } }) }));
vi.mock('../../utils/plannerStorage.js', () => ({ default: { loadBlacklistFromApi: vi.fn(), loadPlanFromApi: vi.fn() } }));
vi.mock('../../services/upAheadEvidence.js', () => ({ getUpAheadEvidence: () => ({}) }));
vi.mock('../../services/upAheadBriefing.js', () => ({ getUpAheadBriefing: () => ({}) }));
vi.mock('../../services/upAheadService.js', () => ({
  fetchStaticUpAheadData,
  fetchLiveUpAheadData,
  loadFromCache,
  saveToCache,
  isActualWeatherAlertText: () => true,
  isActualOfferText: () => true,
  mergeUpAheadData: (base, incoming) => incoming || base,
}));

function setStaticWithApiRuntime() {
  getRuntimeCapabilities.mockReturnValue({
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
    setStaticWithApiRuntime();
    loadFromCache.mockReturnValue(null);
    fetchStaticUpAheadData.mockResolvedValue(visibleStatic);
    fetchLiveUpAheadData.mockResolvedValue(visibleApi);
  });

  it('prefers usable API result before static fallback', async () => {
    fetchUpAheadDatasetApiData.mockResolvedValue(visibleApi);
    const { load } = await import('./upAheadDataset.js');

    const envelope = await load({ policy: 'smart' });

    expect(fetchUpAheadDatasetApiData).toHaveBeenCalledTimes(1);
    expect(fetchStaticUpAheadData).not.toHaveBeenCalled();
    expect(fetchLiveUpAheadData).not.toHaveBeenCalled();
    expect(envelope.data.sourceMode).toBe('dataset-api');
  });

  it('falls back to static when API returns unusable data', async () => {
    fetchUpAheadDatasetApiData.mockResolvedValue(emptyData);
    const { load } = await import('./upAheadDataset.js');

    const envelope = await load({ policy: 'smart' });

    expect(fetchUpAheadDatasetApiData).toHaveBeenCalledTimes(1);
    expect(fetchStaticUpAheadData).toHaveBeenCalledTimes(1);
    expect(fetchLiveUpAheadData).not.toHaveBeenCalled();
    expect(envelope.data.sourceMode).toBe('snapshot');
  });

  it('records API and provider policy diagnostics', async () => {
    fetchUpAheadDatasetApiData.mockResolvedValue(visibleApi);
    const { load } = await import('./upAheadDataset.js');

    const envelope = await load({ policy: 'smart' });
    const events = envelope.diagnostics.map(item => item.event);

    expect(events).toContain('upAheadDataset.api_attempted');
    expect(events).toContain('upAheadDataset.api_loaded');
    expect(events).toContain('upAheadDataset.provider_policy');
    expect(events).toContain('upAheadDataset.live_skipped_runtime');
  });
});
