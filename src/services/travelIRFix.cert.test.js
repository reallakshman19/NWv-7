import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { getTravelLocationProfile } from './travelLocationProfile.js';
import { buildTravelNewsQueries } from './travelNewsQueries.js';
import { rankStoriesForLocation, hasCityEvidence } from './storyLocationPriority.js';
import { reconcileTravelFeed } from './travelFeedRetention.js';
import { dedupeTravelStories } from './travelStoryIdentity.js';
import { fetchTravelNewsPayload } from './travelNewsIngestion.js';

const muscat = getTravelLocationProfile({ travelLocation: { city: 'muscat' } });
const trichy = getTravelLocationProfile({ travelLocation: { city: 'trichy' } });
const hoursAgo = (h, now) => new Date(now - h * 3600000).toISOString();
const story = (title, hours, now, url = 'https://news.google.com/rss/articles/' + hours) => ({
  title, publishedAt: hoursAgo(hours, now), source: 'Oman Observer', url,
});
const receipt = (stories, now, locationKey = 'muscat') => ({
  schemaVersion: 2, locationKey, display: 'Muscat',
  generatedAt: new Date(now - 3600000).toISOString(),
  sourceMode: 'github-rss-prefetch',
  sourceAuthority: 'Google News RSS, publisher identified per story',
  retentionHours: 36, successfulQueries: 5,
  storyCount: stories.length, stories,
});
afterEach(() => vi.unstubAllGlobals());

describe('Travel Local independent-review negative controls', () => {
  it('keeps previously vetted stories when an upstream RSS response drops them, until expiry', () => {
    const now = Date.parse('2026-11-22T06:00:00Z');
    const old = story('Muscat port road repairs begin', 8, now, 'https://news.google.com/rss/articles/old');
    const current = story('Muscat municipality opens new park', 1, now, 'https://news.google.com/rss/articles/new');
    const reconciled = reconcileTravelFeed({
      previous: receipt([old], now), fetched: [current], profile: muscat, now,
    });
    expect(reconciled.stories.map(s => s.title)).toEqual([current.title, old.title]);
    expect(reconciled.retainedFromPrevious).toBe(1);
    const next = reconcileTravelFeed({
      previous: receipt(reconciled.stories, now + 2 * 3600000),
      fetched: [], profile: muscat, now: now + 2 * 3600000,
    });
    expect(next.stories).toHaveLength(2);
    const expired = reconcileTravelFeed({
      previous: receipt(reconciled.stories, now + 29 * 3600000),
      fetched: [], profile: muscat, now: now + 29 * 3600000,
    });
    expect(expired.stories.map(s => s.title)).toEqual([current.title]);
  });

  it('enforces 30 newest without resurrecting wrong-city or fake previous receipts', () => {
    const now = Date.parse('2026-11-22T06:00:00Z');
    const fetched = Array.from({ length: 35 }, (_, i) =>
      story('Muscat park development update number ' + i, i + 1, now, 'https://news.google.com/rss/articles/' + i));
    const first = reconcileTravelFeed({ fetched, profile: muscat, now });
    expect(first.stories).toHaveLength(30);
    expect(first.capEvictions).toBe(5);
    expect(first.stories[0].title).toContain('number 0');
    expect(first.stories.at(-1).title).toContain('number 29');
    const bad = reconcileTravelFeed({
      previous: receipt([story('Muscat fake imported story', 3, now)], now, 'chennai'),
      fetched: [], profile: muscat, now,
    });
    expect(bad.stories).toHaveLength(0);
    expect(bad.previousTrusted).toBe(false);
  });

  it('deduplicates same publisher/event even when Google RSS URLs are different', () => {
    const now = Date.now();
    const a = story('Chennai to move garbage in sealed capsules', 2, now, 'https://news.google.com/rss/articles/1');
    const b = { ...a, url: 'https://news.google.com/rss/articles/2' };
    const c = { ...a, title: 'Chennai council approves new park', url: 'https://news.google.com/rss/articles/3' };
    expect(dedupeTravelStories([a, b, c])).toHaveLength(2);
  });

  it('shows newer city story ahead of equally relevant 35-hour-old front-page story', () => {
    const now = Date.parse('2026-11-22T06:00:00Z');
    const items = rankStoriesForLocation({
      frontPage: [story('Muscat council approves road upgrade', 35, now, 'https://example.com/old')],
      travelLocal: [story('Muscat council opens new terminal', 1, now, 'https://example.com/new')],
    }, muscat, { now, limit: 1, requireCityEvidence: true, requireFreshPublication: true });
    expect(items).toHaveLength(1);
    expect(items[0].url).toBe('https://example.com/new');
  });

  it('rejects foreign event with Muscat as topic without losing genuine Muscat events', () => {
    const now = Date.now();
    const abroad = story('London gallery opens exhibition about Muscat architecture', 1, now);
    const foreignExplicit = { ...story('Muscat cultural artwork featured at London gallery', 1, now), city: 'London' };
    const real = story('London architecture firm opens new gallery in Muscat', 1, now);
    expect(hasCityEvidence(abroad, muscat)).toBe(false);
    expect(hasCityEvidence(foreignExplicit, muscat)).toBe(false);
    expect(hasCityEvidence(real, muscat)).toBe(true);
  });

  it('Trichy RSS queries include alternate city names within actual collector query cap', () => {
    const queries = buildTravelNewsQueries(trichy).slice(0, 5).map(q => q.query);
    expect(queries.some(q => q.includes('Tiruchi'))).toBe(true);
    expect(queries.some(q => q.includes('Tiruchirappalli'))).toBe(true);
    expect(queries.slice(0, 2)).toEqual(['Trichy news', 'Trichy local news']);
  });

  it('rejects fresh but unverified sourceMode while preserving trusted v2 metadata', async () => {
    const now = Date.now();
    const items = [story('Muscat roadworks announced', 2, now)];
    const good = { ...receipt(items, now), generatedAt: new Date(now).toISOString(), retainedFromPrevious: 2, newlyObserved: 1, duplicatesRemoved: 3, capEvictions: 4, rejectedWrongCity: 5 };
    const fake = { ...good, sourceMode: 'runtime-json' };
    const spy = vi.fn().mockResolvedValue({ ok: true, json: async () => fake });
    vi.stubGlobal('fetch', spy);
    const denied = await fetchTravelNewsPayload({ profile: muscat });
    expect(denied.stories).toEqual([]);
    expect(denied.sourceMode).toBe('stale-json');

    spy.mockResolvedValue({ ok: true, json: async () => good });
    const accepted = await fetchTravelNewsPayload({ profile: muscat });
    expect(accepted.stories).toHaveLength(1);
    expect(accepted.schemaVersion).toBe(2);
    expect(accepted.sourceAuthority).toBe(good.sourceAuthority);
    expect(accepted.successfulQueries).toBe(5);
    expect(accepted.retentionHours).toBe(36);
    expect(accepted.retainedFromPrevious).toBe(2);
    expect(accepted.duplicatesRemoved).toBe(3);
    expect(accepted.capEvictions).toBe(4);
    expect(accepted.rejectedWrongCity).toBe(5);
  });

  it('actually executes collector twice: withdrawn but unexpired source story remains in emitted JSON', () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'nw-travel-rss-ir-'));
    try {
      const data = path.join(folder, 'public', 'data');
      fs.mkdirSync(data, { recursive: true });
      const old = story('Muscat harbour maintenance underway', 9, Date.now(), 'https://news.google.com/rss/articles/old');
      const saved = path.join(data, 'travel-local-muscat.json');
      fs.writeFileSync(saved, JSON.stringify(receipt([old], Date.now())));
      const loader = path.join(folder, 'mock-fetch.mjs');
      fs.writeFileSync(loader, 'globalThis.fetch = async () => ({ ok: true, text: async () => process.env.TRAVEL_TEST_XML });');
      const script = path.resolve('scripts/collect_travel_local_news.mjs');
      const run = xml => {
        const result = spawnSync(process.execPath,
          ['--import', pathToFileURL(loader).href, script], {
            cwd: folder, encoding: 'utf8', timeout: 30000,
            env: { ...process.env, TRAVEL_LOCATION_KEY: 'muscat', TRAVEL_TEST_XML: xml },
          });
        expect(result.status, result.stderr || result.stdout).toBe(0);
        return JSON.parse(fs.readFileSync(saved, 'utf8'));
      };
      const newer = hoursAgo(1, Date.now());
      const xml = '<rss><channel><item><title>Muscat municipality announces new bridge - Oman Observer</title>' +
        '<link>https://news.google.com/rss/articles/bridge</link><source>Oman Observer</source>' +
        '<pubDate>' + new Date(newer).toUTCString() + '</pubDate></item></channel></rss>';
      const first = run(xml);
      expect(first.stories.map(s => s.title)).toEqual([
        'Muscat municipality announces new bridge', old.title,
      ]);
      const second = run('<rss><channel></channel></rss>');
      expect(second.stories.map(s => s.title)).toEqual([
        'Muscat municipality announces new bridge', old.title,
      ]);
      expect(second.retainedFromPrevious).toBe(2);
      expect(second.capPolicy).toBe('newest-30-eligible-distinct-stories');
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });
});
