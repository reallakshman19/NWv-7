import { describe, expect, it, vi } from 'vitest';
import {
  THE_HINDU_MORNING_DIGEST,
  canonicalizeTheHinduUrl,
  discoverTheHinduMorningDigest,
  parseTheHinduMorningDigestFeed,
} from './theHinduMorningDigest.js';

function rssItem({ title = 'Morning digest: Current stories', date = 'august-24-2026', article = '71382371', pubDate = 'Mon, 24 Aug 2026 06:42:00 +0530' } = {}) {
  return `<item><title><![CDATA[${title}]]></title><link><![CDATA[https://www.thehindu.com/news/morning-digest-${date}/article${article}.ece/amp/?utm_source=x#frag]]></link><pubDate>${pubDate}</pubDate><description>Here is a select list of stories to start the day.</description></item>`;
}

function feed(...items) {
  return `<?xml version="1.0"?><rss><channel>${items.join('')}</channel></rss>`;
}

describe('The Hindu Morning Digest adapter', () => {
  it('canonicalizes AMP and tracking variants to one direct publisher URL', () => {
    const result = canonicalizeTheHinduUrl('https://thehindu.com/news/morning-digest-august-24-2026/article71382371.ece/amp/?a=1#b');
    expect(result).toEqual({
      url: 'https://www.thehindu.com/news/morning-digest-august-24-2026/article71382371.ece',
      digestDate: '2026-08-24',
    });
  });

  it('rejects foreign hosts and ordinary Hindu articles', () => {
    expect(canonicalizeTheHinduUrl('https://example.com/news/morning-digest-august-24-2026/article1.ece')).toBeNull();
    expect(canonicalizeTheHinduUrl('https://www.thehindu.com/news/national/story/article71382371.ece')).toBeNull();
  });

  it('prefers the exact current edition even when a stale item appears first', () => {
    const xml = feed(
      rssItem({ date: 'august-23-2026', article: '71380000', pubDate: 'Sun, 23 Aug 2026 08:53:00 +0530' }),
      rssItem(),
    );
    const result = parseTheHinduMorningDigestFeed(xml, '2026-08-24', '2026-08-24T03:00:00Z');
    expect(result.editionState).toBe('CURRENT');
    expect(result.canonicalId).toBe('the-hindu:morning-digest:default:2026-08-24');
    expect(result.accessibilityState).toBe('UNKNOWN');
    expect(result.publisherPublishedAt).toBe('2026-08-24T01:12:00.000Z');
  });

  it('marks a prior valid edition stale and a URL/pubDate mismatch invalid', () => {
    const stale = parseTheHinduMorningDigestFeed(
      feed(rssItem({ date: 'august-23-2026', pubDate: 'Sun, 23 Aug 2026 08:53:00 +0530' })),
      '2026-08-24', '2026-08-24T03:00:00Z',
    );
    expect(stale.editionState).toBe('STALE');
    const invalid = parseTheHinduMorningDigestFeed(
      feed(rssItem({ pubDate: 'Sun, 23 Aug 2026 08:53:00 +0530' })),
      '2026-08-24', '2026-08-24T03:00:00Z',
    );
    expect(invalid.editionState).toBe('INVALID');
  });

  it('does not fetch before the publication window', async () => {
    const fetchImpl = vi.fn();
    const result = await discoverTheHinduMorningDigest({
      digestDate: '2026-08-24', fetchImpl, now: new Date('2026-08-24T00:00:00Z'),
    });
    expect(result.status).toBe('BEFORE_WINDOW');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('discovers the current edition only through the registered publisher RSS', async () => {
    const fetchImpl = vi.fn(async url => ({
      ok: url === THE_HINDU_MORNING_DIGEST.discoveryUrl,
      text: async () => feed(rssItem()),
    }));
    const result = await discoverTheHinduMorningDigest({
      digestDate: '2026-08-24', fetchImpl, now: new Date('2026-08-24T03:00:00Z'),
    });
    expect(result.status).toBe('FOUND');
    expect(result.candidate.canonicalUrl).toContain('www.thehindu.com/news/morning-digest-august-24-2026');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
