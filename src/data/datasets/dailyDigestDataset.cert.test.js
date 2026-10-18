import { describe, expect, it, vi } from 'vitest';

vi.mock('../../runtime/runtimeCapabilities.js', () => ({
  getRuntimeCapabilities: () => ({ configuredBackendUrl: 'https://api.example.test' }),
}));

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

  it('uses fresh Sections authority cards in Live mode when the curated backend is not configured', async () => {
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
      liveMode: true,
      liveFallbackLoader,
      fetchImpl: vi.fn(),
    });

    expect(envelope.ok).toBe(true);
    expect(envelope.source).toBe('live');
    expect(envelope.data.deliveryMode).toBe('LIVE');
    expect(envelope.data.availability).toBe('READY');
    expect(envelope.data.cards).toHaveLength(3);
    expect(envelope.data.liveFallbackReason).toBe('BACKEND_NOT_CONFIGURED');
    expect(envelope.validation.warnings).toContain('daily_digest_live_fallback');
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
