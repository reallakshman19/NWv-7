import { describe, expect, it, vi } from 'vitest';

vi.mock('../../runtime/runtimeCapabilities.js', async importOriginal => ({
  ...await importOriginal(),
  getRuntimeCapabilities: vi.fn(() => ({ configuredBackendUrl: 'https://api.example.test' })),
}));

import { getRuntimeCapabilities, resolveRuntimeCapabilities } from '../../runtime/runtimeCapabilities.js';
import { load, __dailyDigestDatasetInternalsForTest } from './dailyDigestDataset.js';

const SNAPSHOT = {
  schemaVersion: 'daily-digest-snapshot/v1',
  snapshotId: 'daily-digest:2026-08-24:v1',
  digestDate: '2026-08-24',
  frozenAt: '2026-08-24T04:45:00Z',
  snapshotRevision: 1,
  compositionState: 'DEGRADED_GLOBAL_UNAVAILABLE',
  cards: [{
    slot: 'I1', canonicalId: 'indian-express:daily-briefing:default:2026-08-24',
    publisherFamily: 'INDIAN_EXPRESS', product: 'DAILY_BRIEFING', edition: 'DEFAULT',
    role: 'INDIA_GENERAL', title: 'Daily Briefing: top news today',
    canonicalUrl: 'https://indianexpress.com/article/live-news/daily-briefing-top-news-today-10844347/',
  }],
};

describe('Daily Digest dataset', () => {
  it('loads only the requested same-day shared snapshot', async () => {
    const fetchImpl = vi.fn(async url => ({ ok: true, status: 200, json: async () => SNAPSHOT, url }));
    const envelope = await load({ asOfDate: '2026-08-24', fetchImpl });
    expect(envelope.ok).toBe(true);
    expect(envelope.data.availability).toBe('READY');
    expect(envelope.data.cards).toHaveLength(1);
    expect(fetchImpl.mock.calls[0][0]).toContain('date=2026-08-24');
  });

  it('treats a same-day missing snapshot before 10:15 IST as expected scheduled state', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }));
    const envelope = await load({
      asOfDate: '2026-08-24',
      now: new Date('2026-08-24T04:30:00.000Z'),
      fetchImpl,
    });
    expect(envelope.ok).toBe(true);
    expect(envelope.data.availability).toBe('NOT_FROZEN');
    expect(envelope.data.cards).toEqual([]);
  });

  it('fails closed when the scheduled snapshot is still missing after 10:15 IST', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }));
    const envelope = await load({
      asOfDate: '2026-08-24',
      now: new Date('2026-08-24T05:00:00.000Z'),
      fetchImpl,
    });
    expect(envelope.ok).toBe(false);
    expect(envelope.data.availability).toBe('MISSED_FREEZE');
    expect(envelope.data.cards).toEqual([]);
    expect(envelope.validation.errors).toContain('daily_digest_missed_freeze');
  });

  it('rejects a card URL that does not belong to the registered publisher family', () => {
    const card = __dailyDigestDatasetInternalsForTest.normalizeCard({
      ...SNAPSHOT.cards[0], canonicalUrl: 'https://example.com/not-authorized',
    });
    expect(card).toBeNull();
  });

  it('preserves publisher publication metadata and summaries through curated normalization', () => {
    const card = __dailyDigestDatasetInternalsForTest.normalizeCard({
      ...SNAPSHOT.cards[0],pubDate:'2026-08-24T03:10:00Z',description:'<p>Today’s briefing covers public transport &amp; the economy.</p>',
    });
    expect(card).toMatchObject({publishedAt:Date.parse('2026-08-24T03:10:00Z'),snippet:'Today’s briefing covers public transport & the economy.'});
    expect(__dailyDigestDatasetInternalsForTest.normalizeCard({...SNAPSHOT.cards[0],fetchedAt:1795008000000}).publishedAt).toBeNull();
  });

  it.each([
    { mode: 'Live mode', liveMode: true, hostname: 'example.test' },
    { mode: 'local Hybrid mode', liveMode: false, hostname: '127.0.0.1' },
    { mode: 'deployed Hybrid mode', liveMode: false, hostname: 'example.github.io' },
  ])('uses fresh Sections authority cards in $mode when the backend is missing', async ({ liveMode, hostname }) => {
    getRuntimeCapabilities.mockReturnValueOnce(resolveRuntimeCapabilities({ isBrowser: true, hostname }));
    const liveFallbackLoader = vi.fn(async () => ({
      status: 'READY',
      generatedAt: Date.parse('2026-08-24T06:00:00Z'),
      cards: [
        {
          slot: 'L1',
          canonicalId: 'live-1',
          title: 'Live story one',
          canonicalUrl: 'https://example.com/live-1',
          source: 'Example One',
          sourceGroup: 'example_one',
          section: 'india',
          publishedAt: Date.parse('2026-08-24T05:30:00Z'),
          deliveryMode: 'LIVE',
        },
        {
          slot: 'L2',
          canonicalId: 'live-2',
          title: 'Live story two',
          canonicalUrl: 'https://example.org/live-2',
          source: 'Example Two',
          sourceGroup: 'example_two',
          section: 'world',
          publishedAt: Date.parse('2026-08-24T05:20:00Z'),
          deliveryMode: 'LIVE',
        },
        {
          slot: 'L3',
          canonicalId: 'live-3',
          title: 'Live story three',
          canonicalUrl: 'https://example.net/live-3',
          source: 'Example Three',
          sourceGroup: 'example_three',
          section: 'business',
          publishedAt: Date.parse('2026-08-24T05:10:00Z'),
          deliveryMode: 'LIVE',
        },
      ],
      summary: { dataSource: { effective: 'cloudflare_preview' } },
      selection: { sourceGroupCount: 3 },
    }));

    const envelope = await load({
      asOfDate: '2026-08-24',
      now: new Date('2026-08-24T06:00:00Z'),
      liveMode,
      liveFallbackLoader,
      fetchImpl: vi.fn(),
    });

    expect(envelope.ok).toBe(true);
    expect(envelope.source).toBe('live');
    expect(envelope.data.deliveryMode).toBe('LIVE');
    expect(envelope.data.availability).toBe('READY');
    expect(envelope.data.cards).toHaveLength(3);
    expect(envelope.data.liveFallbackReason).toBe('BACKEND_NOT_CONFIGURED');
    expect(envelope.data.authoritySummary.dataSource.effective).toBe('cloudflare_preview');
    expect(envelope.validation.warnings).toContain('daily_digest_live_fallback');
  });

  it.each([
    { scenario: 'a past Hybrid edition', digestDate: '2026-08-23', liveMode: false },
    { scenario: 'a past Live edition', digestDate: '2026-08-23', liveMode: true },
    { scenario: 'a future Live edition', digestDate: '2026-08-25', liveMode: true },
  ])('preserves the missing backend state for $scenario', async ({ digestDate, liveMode, forceSnapshots }) => {
    getRuntimeCapabilities.mockReturnValueOnce(resolveRuntimeCapabilities({
      isBrowser: true,
      hostname: 'example.github.io',
      forceSnapshots,
    }));
    const liveFallbackLoader = vi.fn();
    const envelope = await load({
      asOfDate: digestDate,
      now: new Date('2026-08-24T06:00:00Z'),
      liveMode,
      liveFallbackLoader,
    });

    expect(envelope.data.availability).toBe('BACKEND_NOT_CONFIGURED');
    expect(liveFallbackLoader).not.toHaveBeenCalled();
  });

  it.each(['empty', 'network'])('reports the actual Sections recovery failure (%s), rather than a missing backend', async scenario => {
    getRuntimeCapabilities.mockReturnValueOnce(resolveRuntimeCapabilities({ isBrowser: true, hostname: '127.0.0.1' }));
    const liveFallbackLoader = vi.fn(async () => {
      if (scenario === 'network') throw new Error('Network unavailable');
      return { status: 'UNAVAILABLE', cards: [], reason: 'sections_snapshot_stale' };
    });
    const result = await load({ now: new Date('2026-08-24T06:00:00Z'), liveMode: false, liveFallbackLoader });
    expect(result).toMatchObject({ ok: false, source: 'failed', data: {
      availability: 'SECTIONS_UNAVAILABLE', cards: [], liveFallbackReason: 'BACKEND_NOT_CONFIGURED',
      fallbackFailureReason: scenario === 'network' ? 'Network unavailable' : 'sections_snapshot_stale',
    } });
    expect(liveFallbackLoader).toHaveBeenCalledTimes(1);
  });

  it.each([false,true])('uses published Sections in snapshot-only mode (Live pill %s), without calling APIs or live acquisition', async liveMode=>{
    getRuntimeCapabilities.mockReturnValueOnce(resolveRuntimeCapabilities({isBrowser:true,hostname:'127.0.0.1',forceSnapshots:true,configuredBackendUrl:'https://api.example.test'}));
    const fetchImpl=vi.fn();const liveFallbackLoader=vi.fn();
    const publishedFallbackLoader=vi.fn(async()=>({status:'READY',deliveryMode:'SNAPSHOT',generatedAt:Date.parse('2026-08-24T05:00:00Z'),
      cards:[{canonicalId:'published-story',title:'Current published story',source:'Publisher',deliveryMode:'SNAPSHOT'}]}));
    const result=await load({now:new Date('2026-08-24T06:00:00Z'),liveMode,fetchImpl,liveFallbackLoader,publishedFallbackLoader});
    expect(result).toMatchObject({ok:true,source:'snapshot',data:{availability:'READY',deliveryMode:'SNAPSHOT',compositionState:'PUBLISHED_SECTIONS_AUTHORITY',frozenAt:null}});
    expect(publishedFallbackLoader).toHaveBeenCalledTimes(1);expect(liveFallbackLoader).not.toHaveBeenCalled();expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports unavailable published data when snapshot-only recovery fails, rather than a backend configuration error',async()=>{
    getRuntimeCapabilities.mockReturnValueOnce(resolveRuntimeCapabilities({isBrowser:true,hostname:'127.0.0.1',forceSnapshots:true}));
    const publishedFallbackLoader=vi.fn(async()=>{throw Error('network failed');});
    const result=await load({now:new Date('2026-08-24T06:00:00Z'),publishedFallbackLoader});
    expect(result.data.availability).toBe('PUBLISHED_UNAVAILABLE');expect(result.ok).toBe(false);
  });

  it('keeps curated snapshot precedence in Live mode when a valid frozen edition exists', async () => {
    const liveFallbackLoader = vi.fn(async () => {
      throw new Error('live fallback should not run');
    });
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => SNAPSHOT,
    }));

    const envelope = await load({
      asOfDate: '2026-08-24',
      now: new Date('2026-08-24T06:00:00Z'),
      liveMode: true,
      liveFallbackLoader,
      fetchImpl,
    });

    expect(envelope.ok).toBe(true);
    expect(envelope.data.deliveryMode).toBe('CURATED');
    expect(envelope.data.cards).toHaveLength(1);
    expect(liveFallbackLoader).not.toHaveBeenCalled();
  });

  it('preserves the scheduled pre-freeze state in Hybrid mode', async () => {
    const liveFallbackLoader = vi.fn(async () => ({ status: 'READY', cards: [{ title: 'Should not be used' }] }));
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }));

    const envelope = await load({
      asOfDate: '2026-08-24',
      now: new Date('2026-08-24T04:30:00.000Z'),
      liveMode: false,
      liveFallbackLoader,
      fetchImpl,
    });

    expect(envelope.data.availability).toBe('NOT_FROZEN');
    expect(liveFallbackLoader).not.toHaveBeenCalled();
  });
});
