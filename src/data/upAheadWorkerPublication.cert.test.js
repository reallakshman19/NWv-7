import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildFreshnessDiagnostics,
  fetchUpAheadPayloadResult,
  isValidUpAheadPayload,
} from '../../cloudflare/upahead-dataset-api/src/index.js';

const published = JSON.parse(fs.readFileSync('public/data/up_ahead.json', 'utf8'));

describe('A06 actual Python publication -> Cloudflare Worker contract', () => {
  it('accepts the real published raw items without flattening source or lifecycle evidence', async () => {
    expect(published.items?.length).toBeGreaterThan(0);
    expect(isValidUpAheadPayload(published)).toBe(true);
    const result = await fetchUpAheadPayloadResult(
      { UP_AHEAD_DATASET_URL: 'https://publication.example/up_ahead.json' },
      async () => ({ ok: true, json: async () => published }),
    );
    expect(result).toMatchObject({ source: 'upstream', reason: 'ok' });
    expect(result.payload).toBe(published);
    expect(result.payload.items[0].lifecycle).toEqual(published.items[0].lifecycle);
    expect(result.payload.items[0].source).toBe(published.items[0].source);
  });

  it('classifies the raw fetchedAt timestamp with an explicit reference clock', () => {
    expect(buildFreshnessDiagnostics(published, published.fetchedAt + 5_000))
      .toMatchObject({ freshness: 'fresh', ageSeconds: '5' });
    expect(buildFreshnessDiagnostics(published, published.fetchedAt + 13 * 60 * 60_000).freshness)
      .toBe('stale');
  });

  it('fails closed on empty or malformed raw items', () => {
    expect(isValidUpAheadPayload({ ...published, items: [] })).toBe(false);
    expect(isValidUpAheadPayload({ ...published, items: [{ title: 'missing-id' }] })).toBe(false);
  });

  it('returns explicit upstream-timeout even when fetch ignores AbortSignal', async () => {
    const result = await fetchUpAheadPayloadResult(
      { UP_AHEAD_DATASET_URL: 'https://publication.example/up_ahead.json',
        UP_AHEAD_UPSTREAM_TIMEOUT_MS: '20' },
      () => new Promise(() => {}),
    );
    expect(result).toMatchObject({ source: 'fallback', reason: 'upstream-timeout' });
    expect(result.payload.items).toBeUndefined();
    expect(result.payload.sections).toEqual({});
  });
});
