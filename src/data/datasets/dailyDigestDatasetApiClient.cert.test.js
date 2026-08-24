import { describe, expect, it, vi } from 'vitest';
import {
  buildDailyDigestDatasetApiUrl,
  fetchDailyDigestDatasetApi,
} from './dailyDigestDatasetApiClient.js';

describe('Daily Digest dataset API client', () => {
  it('builds an explicit same-day read URL', () => {
    expect(buildDailyDigestDatasetApiUrl('https://api.example.test/', '2026-08-24'))
      .toBe('https://api.example.test/api/datasets/dailyDigest?date=2026-08-24');
  });

  it('never emits a URL without a valid backend and digest date', () => {
    expect(buildDailyDigestDatasetApiUrl('', '2026-08-24')).toBeNull();
    expect(buildDailyDigestDatasetApiUrl('https://api.example.test', 'bad-date')).toBeNull();
  });

  it('uses GET only and classifies a missing daily snapshot as not frozen', async () => {
    const fetchImpl = vi.fn(async (_url, options) => ({
      ok: false,
      status: 404,
      json: async () => ({ error: 'snapshot_not_found' }),
      options,
    }));
    const result = await fetchDailyDigestDatasetApi({
      baseUrl: 'https://api.example.test', digestDate: '2026-08-24', fetchImpl,
    });
    expect(result.status).toBe('NOT_FROZEN');
    expect(fetchImpl.mock.calls[0][1].method).toBe('GET');
  });
});
