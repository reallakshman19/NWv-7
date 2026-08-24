import { describe, expect, it, vi } from 'vitest';
import {
  INDIAN_EXPRESS_DAILY_BRIEFING,
  discoverIndianExpressDailyBriefing,
  extractIndianExpressDailyBriefingLinks,
  parseIndianExpressDailyBriefing,
} from './indianExpressDailyBriefing.js';

const INDEX_SAMPLE = `
<a href="/article/live-news/daily-briefing-top-news-today-10844347/lite/?utm_source=x">
Daily Briefing: CJP on Rajasthan's schools
</a>
<a href="/article/live-news/other-story/">Other Story</a>`;

const ARTICLE_SAMPLE = `
<script type="application/ld+json">
{"@type":"NewsArticle","headline":"Daily Briefing: CJP on Rajasthan's schools","datePublished":"2026-08-24T09:32:00+05:30","dateModified":"2026-08-24T09:40:00+05:30","url":"https://indianexpress.com/article/live-news/daily-briefing-top-news-today-10844347/lite/?x=1"}
</script>`;

describe('Indian Express Daily Briefing adapter', () => {
  it('discovers only registered Daily Briefing article links and canonicalizes them', () => {
    expect(extractIndianExpressDailyBriefingLinks(INDEX_SAMPLE)).toEqual([
      'https://indianexpress.com/article/live-news/daily-briefing-top-news-today-10844347/',
    ]);
  });

  it('uses publisher structured data for edition identity and timestamps', () => {
    const candidate = parseIndianExpressDailyBriefing(
      ARTICLE_SAMPLE,
      'https://indianexpress.com/article/live-news/daily-briefing-top-news-today-10844347/',
      '2026-08-24',
      '2026-08-24T04:45:00Z',
    );
    expect(candidate.canonicalId).toBe('indian-express:daily-briefing:default:2026-08-24');
    expect(candidate.canonicalUrl.endsWith('/10844347/')).toBe(true);
    expect(candidate.publisherUpdatedAt).toBe('2026-08-24T09:40:00+05:30');
    expect(candidate.accessibilityState).toBe('UNKNOWN');
  });

  it('does not fetch on a non-scheduled Sunday', async () => {
    const fetchImpl = vi.fn();
    const result = await discoverIndianExpressDailyBriefing({
      digestDate: '2026-08-23', now: new Date('2026-08-23T05:00:00Z'), fetchImpl,
    });
    expect(result.status).toBe('NOT_SCHEDULED');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('finds the requested dated edition through the publisher index', async () => {
    const target = extractIndianExpressDailyBriefingLinks(INDEX_SAMPLE)[0];
    const fetchImpl = vi.fn(async url => ({
      ok: true,
      text: async () => url === INDIAN_EXPRESS_DAILY_BRIEFING.discoveryUrl ? INDEX_SAMPLE : ARTICLE_SAMPLE,
    }));
    const result = await discoverIndianExpressDailyBriefing({
      digestDate: '2026-08-24', now: new Date('2026-08-24T04:45:00Z'), fetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalledWith(target, expect.any(Object));
    expect(result.status).toBe('FOUND');
    expect(result.candidate.editionState).toBe('CURRENT');
  });
});
