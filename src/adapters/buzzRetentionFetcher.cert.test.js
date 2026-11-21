import { describe, expect, it, vi } from 'vitest';
import {
  qualifyBuzzRetainedSnapshot, loadBuzzRetainedSnapshot,
} from './buzzRetentionFetcher.js';

const H = 3_600_000;
const NOW = Date.parse('2026-11-21T06:00:00Z');
const article = (more = {}) => ({
  id: 'tamil-story',
  title: 'Vijay Tamil cinema update',
  url: 'https://publisher.example/tamil',
  publishedAt: NOW - 5 * H,
  firstSeenAt: NOW,
  lastVerifiedAt: NOW,
  buzzSection: 'entertainment',
  sourceSection: 'entertainment',
  timestampConfidence: 'high',
  publishedAtSource: 'feed_timestamp',
  retention: { freshUntil: NOW + 31 * H, displayUntil: NOW + 36 * H },
  ...more,
});
const snapshot = (items = [article()], more = {}) => ({
  schemaVersion: 1, kind: 'buzz_rolling_retention',
  policyVersion: 'buzz-retention-v1', generatedAt: NOW,
  maxItems: 400, maxBytes: 3_000_000, items,
  ...more,
});

describe('Buzz rolling JSON browser fail-closed admission', () => {
  it('renders qualified Entertainment stories with provenance', () => {
    const qualified = qualifyBuzzRetainedSnapshot(snapshot(), NOW);
    expect(qualified.ok).toBe(true);
    expect(qualified.sections.entertainment).toHaveLength(1);
    expect(qualified.sections.entertainment[0]._buzzRetained).toBe(true);
  });

  it('rejects 7d overflow, expired or cancelled stories', () => {
    const old = article({ publishedAt: NOW - 8 * 24 * H });
    expect(qualifyBuzzRetainedSnapshot(snapshot([old]), NOW).ok).toBe(false);
    expect(qualifyBuzzRetainedSnapshot(snapshot([article({
      retention: { displayUntil: NOW - 1 },
    })]), NOW).ok).toBe(false);
    expect(qualifyBuzzRetainedSnapshot(snapshot([article({ status: 'withdrawn' })]), NOW).ok).toBe(false);
  });

  it('rejects stale generation and over-cap artifacts', () => {
    expect(qualifyBuzzRetainedSnapshot(snapshot([article()], { generatedAt: NOW - 13 * H }), NOW).ok).toBe(false);
    expect(qualifyBuzzRetainedSnapshot(snapshot([article()], { maxBytes: 10_000_000 }), NOW).ok).toBe(false);
  });

  it('does not accept clockless or low-confidence stories', () => {
    expect(qualifyBuzzRetainedSnapshot(snapshot([article({ publishedAt: null })]), NOW).ok).toBe(false);
    expect(qualifyBuzzRetainedSnapshot(snapshot([article({ timestampConfidence: 'low' })]), NOW).ok).toBe(false);
    expect(qualifyBuzzRetainedSnapshot(snapshot([article({ url: 'javascript:evil()' })]), NOW).ok).toBe(false);
  });

  it('uses safe fallback when GitHub sidecar is missing', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    const result = await loadBuzzRetainedSnapshot({ now: NOW, fetcher, url: 'https://example.com/snapshot' });
    expect(result.ok).toBe(false);
    expect(result.sections).toEqual({});
  });

  it('fetches a real serialized JSON contract without claiming fresh source authority', async () => {
    const text = JSON.stringify(snapshot());
    const fetcher = vi.fn().mockResolvedValue({ ok: true, headers: { get: () => String(text.length) },
      text: async () => text });
    const result = await loadBuzzRetainedSnapshot({ now: NOW, fetcher, url: 'https://example.com/snapshot' });
    expect(result.ok).toBe(true);
    expect(result.items[0]._buzzRetentionSource).toBe('github_rss_rolling');
  });
});
