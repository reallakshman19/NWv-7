import { describe, expect, it, vi } from 'vitest';
import { fetchPersonalMarketPulse } from './personalQuoteOverride.js';

const NOW = Date.parse('2026-11-23T08:00:00.000Z');
const meta = (price, timestamp = NOW / 1000) => ({
  regularMarketPrice: price,
  chartPreviousClose: price - 10,
  regularMarketTime: timestamp,
});

function providerReply(m) {
  return { ok: true, json: async () => ({ chart: { result: [{ meta: m }] } }) };
}

describe('opt-in browser-local quote override', () => {
  it('fetches only the four original provider URLs with dated positive prices', async () => {
    const fetchImpl = vi.fn(async (_url, opts) => {
      expect(opts.cache).toBe('no-store');
      expect(opts.credentials).toBe('omit');
      expect(opts.mode).toBe('cors');
      return providerReply(meta(22000));
    });
    const rows = await fetchPersonalMarketPulse({ fetchImpl, now: NOW });
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.name)).toEqual(['NIFTY 50', 'SENSEX', 'BANK NIFTY', 'BSE 500']);
    expect(rows.every((r) => r.value === 22000 && r.quoteAt === '2026-11-23T08:00:00.000Z')).toBe(true);
    expect(rows.every((r) => r.sourceMode === 'personal-browser-lookup')).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    for (const [url] of fetchImpl.mock.calls) {
      expect(url).toMatch(/^https:\/\/query1\.finance\.yahoo\.com\/v8\/finance\/chart\//);
      expect(url).not.toMatch(/corsproxy|allorigins|worker|relay/i);
    }
  });

  it('fails closed for missing, negative, future or expired provider timestamps', async () => {
    for (const observed of [null, 0, NOW / 1000 + 600, (NOW - 6 * 86400000) / 1000]) {
      const fetchImpl = vi.fn(async () => providerReply(meta(21000, observed)));
      await expect(fetchPersonalMarketPulse({ fetchImpl, now: NOW })).rejects.toThrow(/blocked or returned no current/);
    }
    const invalidPrice = vi.fn(async () => providerReply(meta(-100)));
    await expect(fetchPersonalMarketPulse({ fetchImpl: invalidPrice, now: NOW })).rejects.toThrow();
  });

  it('keeps partial qualified data without claiming every market is available', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls++;
      if (calls === 1) return providerReply(meta(22000));
      throw new Error('CORS blocked');
    });
    const rows = await fetchPersonalMarketPulse({ fetchImpl, now: NOW });
    expect(rows).toHaveLength(1);
    expect(rows[0].symbol).toBe('^NSEI');
  });

  it('reports unavailable when the browser cannot contact the provider', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('cross-origin failure'); });
    await expect(fetchPersonalMarketPulse({ fetchImpl, now: NOW })).rejects.toThrow(/original provider links/);
  });
});
