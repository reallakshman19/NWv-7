import { describe, expect, it, vi } from 'vitest';
import {
  buildUpAheadDatasetApiUrl,
  fetchUpAheadDatasetApiData,
} from './upAheadDatasetApiClient.js';

describe('NW-DP-004 Up Ahead dataset API client', () => {
  it('builds stable dataset API URL', () => {
    expect(buildUpAheadDatasetApiUrl('https://api.example.com')).toBe(
      'https://api.example.com/api/datasets/upAhead'
    );
    expect(buildUpAheadDatasetApiUrl('https://api.example.com/')).toBe(
      'https://api.example.com/api/datasets/upAhead'
    );
  });

  it('returns parsed JSON on HTTP OK', async () => {
    const payload = { sections: { events: [{ title: 'A' }] } };
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => payload }));

    const result = await fetchUpAheadDatasetApiData({
      baseUrl: 'https://api.example.com',
      fetchImpl,
    });

    expect(result).toBe(payload);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.com/api/datasets/upAhead',
      { cache: 'no-cache', signal: undefined }
    );
  });

  it('returns null on non-OK response', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, json: async () => ({}) }));
    await expect(fetchUpAheadDatasetApiData({ baseUrl: 'https://api.example.com', fetchImpl })).resolves.toBeNull();
  });

  it('returns null on missing base URL or fetch implementation', async () => {
    await expect(fetchUpAheadDatasetApiData({ baseUrl: '', fetchImpl: vi.fn() })).resolves.toBeNull();
    await expect(fetchUpAheadDatasetApiData({ baseUrl: 'https://api.example.com', fetchImpl: null })).resolves.toBeNull();
  });

  it('returns null on invalid JSON or network failure', async () => {
    const badJson = vi.fn(async () => ({ ok: true, json: async () => { throw new Error('bad json'); } }));
    const failing = vi.fn(async () => { throw new Error('network'); });

    await expect(fetchUpAheadDatasetApiData({ baseUrl: 'https://api.example.com', fetchImpl: badJson })).resolves.toBeNull();
    await expect(fetchUpAheadDatasetApiData({ baseUrl: 'https://api.example.com', fetchImpl: failing })).resolves.toBeNull();
  });
});
