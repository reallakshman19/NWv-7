import { describe, expect, it } from 'vitest';
import { runScheduledDispatch } from './index.js';
import { freezeDailyDigestPilot, resolvePilotFreezeState } from './pilotFreeze.js';

const AKASHVANI_URL = 'https://newsonair.gov.in/bulletins-detail-category/morning-news/';
const EXPRESS_INDEX = 'https://indianexpress.com/section/live-news/';
const EXPRESS_ARTICLE = 'https://indianexpress.com/article/live-news/daily-briefing-top-news-today-10844347/';
const HINDU_RSS = 'https://www.thehindu.com/news/national/feeder/default.rss';

const FIXTURES = Object.freeze({
  [AKASHVANI_URL]: '<div>August 24, 2026 8:15 AM Morning News</div>',
  [EXPRESS_INDEX]: `<a href="${EXPRESS_ARTICLE}">Daily Briefing: top news today</a>`,
  [EXPRESS_ARTICLE]: `<script type="application/ld+json">{
    "@type":"NewsArticle","headline":"Daily Briefing: top news today",
    "datePublished":"2026-08-24T09:20:00+05:30","dateModified":"2026-08-24T09:40:00+05:30"
  }</script>`,
  [HINDU_RSS]: `<rss><channel><item>
    <title>Morning Digest August 24, 2026</title>
    <link>https://www.thehindu.com/news/morning-digest-august-24-2026/article71382371.ece/amp/?utm_source=x</link>
    <pubDate>Mon, 24 Aug 2026 01:12:00 GMT</pubDate>
  </item></channel></rss>`,
});

const RICH_EXPRESS_ARTICLE = `${FIXTURES[EXPRESS_ARTICLE]}
  <a href="/article/india/court-1/">Supreme Court issues a major constitutional verdict</a>
  <a href="/article/business/rbi-2/">RBI reviews inflation and banking conditions</a>
  <a href="/article/india/cabinet-3/">Cabinet approves a national infrastructure policy</a>
  <a href="/article/india/army-4/">Army reviews border security after ceasefire talks</a>
  <a href="/article/world/china-5/">China and India hold a bilateral foreign ministers summit</a>
  <a href="/article/technology/isro-6/">ISRO launches a new earth observation satellite</a>`;

function fixtureFetch(counter = { count: 0 }, overrides = {}) {
  return async url => {
    counter.count += 1;
    const body = { ...FIXTURES, ...overrides }[String(url)];
    return body === undefined
      ? { ok: false, status: 404, text: async () => '' }
      : { ok: true, status: 200, text: async () => body };
  };
}

function memoryStore() {
  let stored = null;
  return {
    async readSnapshot(_db, digestDate) {
      return stored?.digestDate === digestDate ? stored : null;
    },
    async writeSnapshot(_db, snapshot) {
      stored = snapshot;
      return { statementCount: 1, results: [{ success: true }] };
    },
  };
}

function recordingD1() {
  const batches = [];
  return {
    batches,
    prepare(sql) {
      return {
        bind(...values) {
          return { sql, values, first: async () => null, all: async () => ({ results: [] }) };
        },
        first: async () => null,
        all: async () => ({ results: [] }),
      };
    },
    async batch(statements) {
      batches.push(statements);
      return statements.map(() => ({ success: true }));
    },
  };
}

const FREEZE = new Date('2026-08-24T10:15:00+05:30');

describe('Daily Digest pilot freeze', () => {
  it('does not discover or write before the 10:15 IST freeze boundary', async () => {
    const counter = { count: 0 };
    const result = await freezeDailyDigestPilot({
      digestDate: '2026-08-24', now: new Date('2026-08-24T10:14:00+05:30'),
      fetchImpl: fixtureFetch(counter), writeEnabled: true, db: {}, store: memoryStore(),
    });
    expect(result.state).toBe('BEFORE_FREEZE');
    expect(result.snapshotWritten).toBe(false);
    expect(counter.count).toBe(0);
  });

  it('freezes three India slots with explicit global degradation', async () => {
    const result = await freezeDailyDigestPilot({
      digestDate: '2026-08-24', now: FREEZE, fetchImpl: fixtureFetch(),
      writeEnabled: true, db: {}, store: memoryStore(),
    });
    expect(result.status).toBe('FROZEN');
    expect(result.snapshot.compositionState).toBe('DEGRADED_GLOBAL_UNAVAILABLE');
    expect(Object.keys(result.snapshot.selections)).toEqual(['I1', 'I2', 'I3']);
    expect(result.globalDecision.state).toBe('GLOBAL_UNAVAILABLE');
  });

  it('automatically changes precedence from publisher-derived current-day quality evidence', async () => {
    const result = await freezeDailyDigestPilot({
      digestDate: '2026-08-24', now: FREEZE,
      fetchImpl: fixtureFetch({ count: 0 }, { [EXPRESS_ARTICLE]: RICH_EXPRESS_ARTICLE }),
      writeEnabled: false,
    });
    expect(result.snapshot.selections.I1.canonicalId).toContain('indian-express:daily-briefing');
    const express = result.snapshot.candidates.find(row => row.publisherFamily === 'INDIAN_EXPRESS');
    expect(express.significanceClass).toBe('HIGH');
    expect(express.breadthClass).toBe('BROAD');
    expect(express.diversityClass).toBe('DIVERSE');
    expect(express.qualityEvidenceState).toBe('OBSERVED');
    expect(JSON.stringify(result.snapshot)).not.toContain('constitutional verdict');
  });

  it('keeps The Hindu quality neutral when its article-body surface is unqualified', async () => {
    const result = await freezeDailyDigestPilot({
      digestDate: '2026-08-24', now: FREEZE, fetchImpl: fixtureFetch(), writeEnabled: false,
    });
    const hindu = result.snapshot.candidates.find(row => row.publisherFamily === 'THE_HINDU');
    expect(hindu.qualityEvidenceState).toBe('UNAVAILABLE');
    expect(hindu.significanceClass).toBe('ADEQUATE');
    expect(hindu.breadthClass).toBe('ADEQUATE');
    expect(hindu.diversityClass).toBe('MODERATE');
  });

  it('emits one D1 batch for snapshot plus three selections and three candidate traces', async () => {
    const db = recordingD1();
    const result = await freezeDailyDigestPilot({
      digestDate: '2026-08-24', now: FREEZE, fetchImpl: fixtureFetch(),
      writeEnabled: true, db,
    });
    expect(result.status).toBe('FROZEN');
    expect(result.write.statementCount).toBe(7);
    expect(db.batches).toHaveLength(1);
    expect(db.batches[0]).toHaveLength(7);
  });

  it('allows explicit diagnostic overrides without bypassing evidence audit', async () => {
    const result = await freezeDailyDigestPilot({
      digestDate: '2026-08-24', now: FREEZE, fetchImpl: fixtureFetch(),
      writeEnabled: false,
      qualityOverrides: { THE_HINDU: { significanceClass: 'HIGH' } },
    });
    const hindu = result.snapshot.candidates.find(row => row.publisherFamily === 'THE_HINDU');
    expect(result.snapshot.selections.I1.canonicalId).toContain('the-hindu:morning-digest');
    expect(hindu.qualityEvidenceState).toBe('UNAVAILABLE');
  });

  it('is idempotent by digest date and does not rediscover after freeze', async () => {
    const counter = { count: 0 };
    const store = memoryStore();
    const first = await freezeDailyDigestPilot({
      digestDate: '2026-08-24', now: FREEZE, fetchImpl: fixtureFetch(counter),
      writeEnabled: true, db: {}, store,
    });
    const countAfterFirst = counter.count;
    const second = await freezeDailyDigestPilot({
      digestDate: '2026-08-24', now: FREEZE, fetchImpl: fixtureFetch(counter),
      writeEnabled: true, db: {}, store,
    });
    expect(first.status).toBe('FROZEN');
    expect(second.status).toBe('ALREADY_FROZEN');
    expect(counter.count).toBe(countAfterFirst);
  });

  it('preserves combined India/global degradation when one India source is absent', async () => {
    const result = await freezeDailyDigestPilot({
      digestDate: '2026-08-24', now: FREEZE,
      fetchImpl: fixtureFetch({ count: 0 }, { [HINDU_RSS]: undefined }),
      writeEnabled: false,
    });
    expect(result.snapshot.compositionState).toBe('DEGRADED_INDIA_AND_GLOBAL_SHORTFALL');
    expect(Object.keys(result.snapshot.selections)).toEqual(['I1', 'I2']);
  });

  it('keeps scheduled writes disabled by default', async () => {
    const result = await runScheduledDispatch({ scheduledTime: FREEZE.getTime() }, {});
    expect(result.status).toBe('SOURCE_ADAPTERS_NOT_AUTHORIZED');
    expect(result.snapshotWritten).toBe(false);
  });

  it('treats the exact boundary as ready to freeze', () => {
    expect(resolvePilotFreezeState('2026-08-24', FREEZE).state).toBe('READY_TO_FREEZE');
  });
});
