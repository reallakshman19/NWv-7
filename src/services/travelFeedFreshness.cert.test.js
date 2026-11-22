import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { getTravelLocationProfile } from './travelLocationProfile.js';
import {
  TRAVEL_NEWS_RETENTION_HOURS,
  TRAVEL_FEED_MAX_AGE_HOURS,
  getTravelStoryPublishedMs,
  isFreshTravelStory,
  isFreshTravelPayload,
  filterFreshTravelStories,
} from './travelNewsFreshness.js';
import { parseTravelRssItems, stripTravelPublisherSuffix } from './travelRssParser.js';
import { hasCityEvidence, scoreStoryForLocation } from './storyLocationPriority.js';
import { rankStoriesForLocation } from './storyLocationPriority.js';
import { fetchTravelNewsPayload } from './travelNewsIngestion.js';

const now = Date.parse('2026-11-22T04:00:00.000Z');
const hoursAgo = h => new Date(now - h * 3600000).toISOString();
const muscat = getTravelLocationProfile({ travelLocation: { city: 'muscat' } });
afterEach(() => vi.unstubAllGlobals());

describe('Travel Local news freshness, retention and source custody', () => {
  it('retains stories within 36h, excludes old, undated, future and invalid timestamps', () => {
    expect(TRAVEL_NEWS_RETENTION_HOURS).toBe(36);
    expect(isFreshTravelStory({ publishedAt: hoursAgo(35) }, { now })).toBe(true);
    expect(isFreshTravelStory({ publishedAt: hoursAgo(37) }, { now })).toBe(false);
    expect(isFreshTravelStory({ title: 'Muscat new road' }, { now })).toBe(false);
    expect(isFreshTravelStory({ publishedAt: 'invalid' }, { now })).toBe(false);
    expect(isFreshTravelStory({ publishedAt: new Date(now + 6 * 60000).toISOString() }, { now })).toBe(false);
    expect(getTravelStoryPublishedMs({ publishedAt: now })).toBe(now);
    expect(getTravelStoryPublishedMs({ publishedAt: now / 1000 })).toBe(now);
    expect(filterFreshTravelStories([
      { publishedAt: hoursAgo(4) }, { publishedAt: hoursAgo(49) }, {},
    ], { now })).toHaveLength(1);
  });

  it('rejects an old JSON receipt even when its article publication time looks fresh', () => {
    expect(TRAVEL_FEED_MAX_AGE_HOURS).toBe(12);
    expect(isFreshTravelPayload({ generatedAt: hoursAgo(11) }, { now })).toBe(true);
    expect(isFreshTravelPayload({ generatedAt: hoursAgo(13) }, { now })).toBe(false);
    expect(isFreshTravelPayload({ generatedAt: new Date(now + 6 * 60000).toISOString() }, { now })).toBe(false);
    expect(isFreshTravelPayload({ stories: [] }, { now })).toBe(false);
  });

  it('correctly parses multiline Google RSS and preserves publisher/date without manufacturing city', () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel>
      <item>
        <title><![CDATA[Muscat &amp; airport updates]]></title>
        <link>https://news.google.com/rss/articles/abc</link>
        <guid>item-1</guid>
        <source url="https://example.com">Oman Observer</source>
        <pubDate>Sat, 21 Nov 2026 21:00:00 GMT</pubDate>
      </item>
      <item><title>Incomplete item</title><link>https://example.com/x</link></item>
    </channel></rss>`;
    const articles = parseTravelRssItems(xml);
    expect(articles).toHaveLength(1);
    expect(articles[0].title).toBe('Muscat & airport updates');
    expect(articles[0].source).toBe('Oman Observer');
    expect(articles[0].publishedAt).toBe('Sat, 21 Nov 2026 21:00:00 GMT');
    expect(articles[0].city).toBeUndefined();
    expect(articles[0].country).toBeUndefined();
    expect(() => parseTravelRssItems('<html>Not an RSS feed</html>')).toThrow('Invalid RSS');
  });

  it('does not mistake publisher names or Muscat grapes for event geography', () => {
    const publisherTitle = 'OCCI members to vote through app for first time - Muscat Daily';
    expect(stripTravelPublisherSuffix(publisherTitle, 'Muscat Daily'))
      .toBe('OCCI members to vote through app for first time');
    expect(hasCityEvidence({ title: publisherTitle, source: 'Muscat Daily' }, muscat)).toBe(false);
    expect(hasCityEvidence({
      title: 'From murtabak to Muscat grapes: Malaysian trips to Singapore',
      source: 'The Straits Times',
    }, muscat)).toBe(false);
    expect(scoreStoryForLocation({
      title: 'From murtabak to Muscat grapes: Malaysian trips to Singapore',
      source: 'The Straits Times',
    }, muscat)).toBe(0);
    expect(hasCityEvidence({
      title: 'Muscat Municipality announces new Qurum road works',
      source: 'Times of Oman',
    }, muscat)).toBe(true);
    const xml = `<rss><channel>
      <item><title>OCCI members to vote through app for first time - Muscat Daily</title>
        <link>https://example.test/publisher</link><source>Muscat Daily</source>
        <pubDate>Sun, 22 Nov 2026 01:00:00 GMT</pubDate></item>
      <item><title>Colombo Bandaranaike International Airport Arrivals - Flightradar24</title>
        <link>https://example.test/flight</link><source>Flightradar24</source>
        <pubDate>Sun, 22 Nov 2026 01:00:00 GMT</pubDate></item>
    </channel></rss>`;
    const items = parseTravelRssItems(xml);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('OCCI members to vote through app for first time');
    expect(hasCityEvidence(items[0], muscat)).toBe(false);
  });

  it('requires true publication age and actual city evidence in UI ranking', () => {
    const sorted = rankStoriesForLocation({
      local: [
        { title: 'Muscat officials announce road repair', publishedAt: hoursAgo(4) },
        { title: 'Muscat road project from last month', publishedAt: hoursAgo(100) },
        { title: 'Muscat city story with missing publication date' },
        { title: 'Chennai road update', publishedAt: hoursAgo(1), source: 'Muscat News' },
      ],
    }, muscat, { requireCityEvidence: true, requireFreshPublication: true, now });
    expect(sorted).toHaveLength(1);
    expect(sorted[0].title).toContain('Muscat officials');
  });

  it('fetches GitHub Pages relative city data and filters expired stories', async () => {
    const current = Date.now();
    const payload = {
      schemaVersion: 2,
      sourceMode: 'github-rss-prefetch',
      sourceAuthority: 'Google News RSS, publisher identified per story',
      retentionHours: 36,
      successfulQueries: 5,
      storyCount: 3,
      locationKey: 'muscat',
      generatedAt: new Date(current).toISOString(),
      stories: [
        { title: 'Muscat traffic restrictions today', publishedAt: new Date(current - 2 * 3600000).toISOString() },
        { title: 'Muscat traffic restrictions months ago', publishedAt: new Date(current - 60 * 3600000).toISOString() },
        { title: 'Muscat unverified article' },
      ],
    };
    const spy = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
    vi.stubGlobal('fetch', spy);
    const feed = await fetchTravelNewsPayload({ profile: muscat });
    expect(spy.mock.calls[0][0]).toBe('./data/travel-local-muscat.json');
    expect(spy.mock.calls[0][1].cache).toBe('no-store');
    expect(feed.stories.map(x => x.title)).toEqual(['Muscat traffic restrictions today']);
  });

  it('rejects stale/wrong-location GitHub JSON instead of passing it off as current', async () => {
    const spy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        schemaVersion: 2,
        sourceMode: 'github-rss-prefetch',
        sourceAuthority: 'Google News RSS, publisher identified per story',
        retentionHours: 36,
        successfulQueries: 5,
        storyCount: 1,
        locationKey: 'chennai',
        generatedAt: new Date().toISOString(),
        stories: [{ title: 'Chennai city roadwork', publishedAt: new Date().toISOString() }],
      }),
    });
    vi.stubGlobal('fetch', spy);
    const feed = await fetchTravelNewsPayload({ profile: muscat });
    expect(feed.stories).toHaveLength(0);
    expect(feed.sourceMode).toBe('stale-json');
  });

  it('requires a real recurring collector workflow and pre-publication validator', () => {
    const workflow = fs.readFileSync('.github/workflows/travel-local-news.yml', 'utf8');
    const collector = fs.readFileSync('scripts/collect_travel_local_news.mjs', 'utf8');
    expect(workflow).toContain("cron: '13 */3 * * *'");
    expect(workflow).toContain('validate_travel_local_news.mjs');
    expect(workflow).toContain('TRAVEL_LOCATION_KEY');
    expect(workflow).toContain('git push origin HEAD:main');
    expect(collector).toContain('hasCityEvidence');
    expect(collector).toContain('isFreshTravelStory');
    expect(collector).toContain('parseTravelRssItems');
    expect(collector).not.toContain('[sS]*?');
  });
});
