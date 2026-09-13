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
});
