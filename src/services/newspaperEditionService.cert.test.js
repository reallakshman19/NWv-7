import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import {readPublishedSnapshot} from '../utils/publishedSnapshotFetch.js';
import { fetchCurrentNewspaperPublication, isPublisherArticle, normalizeNewspaperEdition, newspaperFromSections, newspaperPublicationUrls } from './newspaperEditionService';

const now = Date.parse('2026-11-16T12:00:00Z');
const article = (overrides = {}) => ({ title: 'Chennai public transport update', link: 'https://www.thehindu.com/news/article123.ece', publishedAt: now - 3600000, ...overrides });
const edition = (articles = [article()]) => ({ lastUpdated: now, sources: { THE_HINDU: [{ page: 'Front Page', articles }] } });

afterEach(() => vi.unstubAllGlobals());

describe('Newspaper publication freshness and publisher identity', () => {
  it('rejects the actual archived July edition rather than treating HTTP 200 as current', () => {
    const old = JSON.parse(fs.readFileSync('src/services/fixtures/newspaperJulyEdition.json', 'utf8'));
    // The historical production payload, including undated category links.
    expect(() => normalizeNewspaperEdition(old, now)).toThrow(/48 hours/);
  });
  it('rejects stale, undated, future, foreign publisher and category-only articles even under a newly fetched edition', () => {
    const rejected = [article({ publishedAt: now - 49 * 3600000 }), article({ publishedAt: null }),
      article({ publishedAt: now + 3600000 }), article({ link: 'https://timesofindia.indiatimes.com/story/1' })];
    expect(() => normalizeNewspaperEdition(edition(rejected), now)).toThrow(/No verified/);
  });
  it('keeps publisher identity, deduplicates within a source and clears unrelated old summaries', () => {
    const payload = edition([article(), article()]);
    payload.sources.THE_HINDU[0].summary = 'Old July summary';
    const result = normalizeNewspaperEdition(payload, now);
    expect(result.sources.THE_HINDU[0].articles).toHaveLength(1);
    expect(result.sources.THE_HINDU[0].summary).not.toContain('July');
    expect(result.sources.INDIAN_EXPRESS).toEqual([]);
    expect(result.sourceStatus.INDIAN_EXPRESS.status).toBe('unavailable');
    expect(result.lastUpdated).toBe(now);
  });
  it('accepts Google discovery only with a matching publisher URL', () => {
    const row = article({ link: 'https://news.google.com/rss/articles/ABC' });
    expect(isPublisherArticle(row, 'THE_HINDU')).toBe(false);
    expect(isPublisherArticle({ ...row, publisherUrl: 'https://www.thehindu.com' }, 'THE_HINDU')).toBe(true);
    expect(isPublisherArticle({ ...row, publisherUrl: 'https://thehindu.com.evil.example' }, 'THE_HINDU')).toBe(false);
  });
  it('projects a current Sections fallback by real publisher and retains acquisition time', () => {
    const result = newspaperFromSections({ fetchedAt: now - 3600000, sections: {
      india: [article(), article({ title: 'Another publisher', link: 'https://www.ndtv.com/story' })],
      tn: [article({ title: 'தமிழ் தலைப்பு', link: 'https://www.dinamani.com/tamilnadu/story', publishedAt: now - 1000 })],
    } }, now);
    expect(result.sources.THE_HINDU[0].articles).toHaveLength(1);
    expect(result.sources.DINAMANI[0].articles[0].title).toBe('தமிழ் தலைப்பு');
    expect(result.sources.DAILY_THANTHI).toEqual([]);
    expect(result.lastUpdated).toBe(now - 3600000);
  });
  it('does not make an old Sections snapshot current by re-fetching it', () => {
    expect(() => newspaperFromSections({ fetchedAt: now - 60 * 3600000, sections: { india: [article()] } }, now)).toThrow(/48 hours/);
  });
  it('rejects fetch-time fallback timestamps even in a fresh Sections envelope', () => {
    expect(() => newspaperFromSections({ fetchedAt: now, sections: { india: [article({
      timestampConfidence: 'low', publishedAtSource: 'fetch_time_fallback',
    })] } }, now)).toThrow(/No verified/);
  });
  it('does not deduplicate undisplayed overflow rows out of a later section', () => {
    const rows = Array.from({ length: 20 }, (_, index) => article({
      title: `Story ${index}`, link: `https://www.thehindu.com/news/story-${index}.ece`,
    }));
    const payload = edition(rows);
    payload.sources.THE_HINDU.push({ page: 'Tamil Nadu', articles: rows.slice(10) });
    const result = normalizeNewspaperEdition(payload, now);
    expect(result.sources.THE_HINDU.map(section => section.articles.length)).toEqual([10, 10]);
  });
  it('refreshes official Pages from raw main and validates deployed fallback after failure', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://reallakshman19.github.io', pathname: '/NWv-7/' } });
    expect(newspaperPublicationUrls()[0]).toContain('/main/public/data/epaper_data.json');
    const fetchImpl = vi.fn().mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ok: true, json: async () => edition() });
    expect((await fetchCurrentNewspaperPublication({ fetchImpl, now })).sourceStatus.THE_HINDU.count).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][1].cache).toBe('no-store');
  });
  it('recovers a stale localhost build from current main without changing article timestamps or publisher identity',async()=>{
    vi.stubGlobal('window',{location:new URL('http://127.0.0.1:4173/#/newspaper')});
    const fetchImpl=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({...edition(),lastUpdated:now-50*3600000})})
      .mockResolvedValueOnce({ok:true,json:async()=>edition()});
    const result=await fetchCurrentNewspaperPublication({fetchImpl,now});
    expect(fetchImpl).toHaveBeenCalledTimes(2);expect(fetchImpl.mock.calls[1][0]).toContain('/main/public/data/epaper_data.json');
    expect(result.lastUpdated).toBe(now);expect(result.sources.THE_HINDU[0].articles[0].publishedAt).toBe(article().publishedAt);
    expect(result.sources.INDIAN_EXPRESS).toEqual([]);
  });
  it('keeps a fresh local edition usable offline and never fetches production data on an unrelated app host',async()=>{
    vi.stubGlobal('window',{location:new URL('http://localhost:4173/')});
    const fetchImpl=vi.fn().mockResolvedValue({ok:true,json:async()=>edition()});
    await fetchCurrentNewspaperPublication({fetchImpl,now});expect(fetchImpl).toHaveBeenCalledTimes(1);
    vi.stubGlobal('window',{location:new URL('https://another-app.test/')});
    expect(newspaperPublicationUrls()).toHaveLength(1);
  });
  it('bounds published JSON responses, including chunked Unicode data without content-length',async()=>{
    const response=new Response(JSON.stringify({text:'தமிழ்'.repeat(100)}));
    await expect(readPublishedSnapshot(response,100)).rejects.toThrow('size limit');
    await expect(readPublishedSnapshot(new Response('{}',{headers:{'content-length':'9999999'}}),100)).rejects.toThrow('size limit');
  });
});
