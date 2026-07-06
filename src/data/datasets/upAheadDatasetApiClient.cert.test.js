import { describe, expect, it, vi } from 'vitest';
import {
  buildUpAheadDatasetApiUrl,
  fetchUpAheadDatasetApiData,
  fetchUpAheadDatasetApiResponse,
  normalizeUpAheadEdgeDiagnostics,
} from './upAheadDatasetApiClient.js';

function responseWithHeaders(payload, headers = {}) {
  return {
    ok: true,
    headers: new Headers(headers),
    json: async () => payload,
  };
}

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
    const fetchImpl = vi.fn(async () => ({ ok: true, headers: new Headers(), json: async () => payload }));

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
    const fetchImpl = vi.fn(async () => ({ ok: false, headers: new Headers(), json: async () => ({}) }));
    await expect(fetchUpAheadDatasetApiData({ baseUrl: 'https://api.example.com', fetchImpl })).resolves.toBeNull();
  });

  it('returns null on missing base URL or fetch implementation', async () => {
    await expect(fetchUpAheadDatasetApiData({ baseUrl: '', fetchImpl: vi.fn() })).resolves.toBeNull();
    await expect(fetchUpAheadDatasetApiData({ baseUrl: 'https://api.example.com', fetchImpl: null })).resolves.toBeNull();
  });

  it('returns null on invalid JSON or network failure', async () => {
    const badJson = vi.fn(async () => ({ ok: true, headers: new Headers(), json: async () => { throw new Error('bad json'); } }));
    const failing = vi.fn(async () => { throw new Error('network'); });

    await expect(fetchUpAheadDatasetApiData({ baseUrl: 'https://api.example.com', fetchImpl: badJson })).resolves.toBeNull();
    await expect(fetchUpAheadDatasetApiData({ baseUrl: 'https://api.example.com', fetchImpl: failing })).resolves.toBeNull();
  });
});

describe('NW-DP-017 Up Ahead dataset API edge diagnostics', () => {
  it('captures edge metadata headers when present', async () => {
    const payload = { sections: { events: [{ title: 'A' }] }, timeline: [], weekly_plan: [] };
    const fetchImpl = vi.fn(async () => responseWithHeaders(payload, {
      'X-NW-UpAhead-Source': 'upstream',
      'X-NW-UpAhead-Reason': 'ok',
      'X-NW-UpAhead-Freshness': 'fresh',
      'X-NW-UpAhead-Age-Seconds': '42',
    }));

    const result = await fetchUpAheadDatasetApiResponse({
      baseUrl: 'https://api.example.com',
      fetchImpl,
    });

    expect(result.data).toBe(payload);
    expect(result.diagnostics).toEqual({
      source: 'upstream',
      reason: 'ok',
      freshness: 'fresh',
      ageSeconds: '42',
    });
  });

  it('normalizes absent edge metadata headers to unknown', async () => {
    const payload = { sections: { events: [{ title: 'A' }] }, timeline: [], weekly_plan: [] };
    const fetchImpl = vi.fn(async () => responseWithHeaders(payload));

    const result = await fetchUpAheadDatasetApiResponse({
      baseUrl: 'https://api.example.com',
      fetchImpl,
    });

    expect(result.data).toBe(payload);
    expect(result.diagnostics).toEqual({
      source: 'unknown',
      reason: 'unknown',
      freshness: 'unknown',
      ageSeconds: 'unknown',
    });
  });

  it('keeps plain JSON helper backward compatible', async () => {
    const payload = { sections: { events: [{ title: 'A' }] }, timeline: [], weekly_plan: [] };
    const fetchImpl = vi.fn(async () => responseWithHeaders(payload, {
      'X-NW-UpAhead-Source': 'fallback',
      'X-NW-UpAhead-Reason': 'invalid-shape',
      'X-NW-UpAhead-Freshness': 'unknown',
      'X-NW-UpAhead-Age-Seconds': 'unknown',
    }));

    await expect(fetchUpAheadDatasetApiData({ baseUrl: 'https://api.example.com', fetchImpl })).resolves.toBe(payload);
  });

  it('can normalize diagnostics directly from a response object', () => {
    const diagnostics = normalizeUpAheadEdgeDiagnostics(responseWithHeaders({}, {
      'X-NW-UpAhead-Source': 'fallback',
      'X-NW-UpAhead-Reason': 'missing-url',
      'X-NW-UpAhead-Freshness': 'unknown',
      'X-NW-UpAhead-Age-Seconds': 'unknown',
    }));

    expect(diagnostics).toEqual({
      source: 'fallback',
      reason: 'missing-url',
      freshness: 'unknown',
      ageSeconds: 'unknown',
    });
  });
});
