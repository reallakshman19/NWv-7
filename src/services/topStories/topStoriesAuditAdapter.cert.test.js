import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { rankTopStories } from './topStoriesRanker.js';
import {
  getTopStoriesAuditComparisonPayload,
  getTopStoriesAuditPayload,
  getTopStoriesGoldenAuditPayload,
  serializeTopStoriesAuditPayload,
} from './topStoriesAuditAdapter.js';
import { TOP_STORIES_REGRESSION_INPUT } from './fixtures/topStoriesRegressionFixtures.js';

describe('NW-RANK-005 Top Stories audit adapter shadow mode', () => {
  it('generates deterministic comparison payloads', () => {
    expect(getTopStoriesAuditComparisonPayload()).toEqual(getTopStoriesAuditComparisonPayload());
  });

  it('returns ok=true when actual fixture snapshot matches golden snapshot', () => {
    const payload = getTopStoriesAuditComparisonPayload();
    expect(payload.ok).toBe(true);
    expect(payload.comparison.ok).toBe(true);
    expect(payload.comparison.errors).toEqual([]);
  });

  it('uses shadow-audit mode and deterministic generatedAt by default', () => {
    const payload = getTopStoriesAuditComparisonPayload();
    expect(payload.mode).toBe('shadow-audit');
    expect(payload.generatedAt).toBe(1783584000000);
  });

  it('allows explicit generatedAt override without changing actual or expected snapshots', () => {
    const payload = getTopStoriesAuditComparisonPayload({ generatedAt: 'owner-review-fixed' });
    expect(payload.generatedAt).toBe('owner-review-fixed');
    expect(payload.mode).toBe('shadow-audit');
    expect(payload.ok).toBe(true);
  });

  it('includes actual, expected, comparison, and hardened summary', () => {
    const payload = getTopStoriesAuditComparisonPayload();
    expect(payload.actual).toBeTruthy();
    expect(payload.expected).toBeTruthy();
    expect(payload.comparison).toBeTruthy();
    expect(payload.summary).toMatchObject({
      ok: true,
      mode: 'shadow-audit',
      rankedCount: 6,
      expectedRankedCount: 6,
      rankedIdsInOrder: expect.any(Array),
      topFeedBoostedIds: expect.any(Array),
      penalizedIds: expect.any(Array),
      rejectedExpiredIds: expect.any(Array),
    });
    expect(payload.summary.rankedIdsInOrder).not.toContain('god-of-war-promo');
    expect(payload.summary.rankedIdsInOrder).not.toContain('same-source-top-feed-spam');
    expect(payload.summary.rejectedExpiredIds).toContain('god-of-war-promo');
    expect(payload.summary.rejectedExpiredIds).toContain('same-source-top-feed-spam');
  });

  it('produces deterministic stable serialization', () => {
    const payload = getTopStoriesAuditComparisonPayload();
    expect(serializeTopStoriesAuditPayload(payload)).toBe(serializeTopStoriesAuditPayload(payload));
    expect(serializeTopStoriesAuditPayload({ b: 1, a: { d: 2, c: 3 } }))
      .toBe('{\n  "a": {\n    "c": 3,\n    "d": 2\n  },\n  "b": 1\n}');
  });

  it('serialization removes functions and undefined values without mutating input', () => {
    const payload = { z: undefined, b: 2, a: { fn: () => true, c: 3 } };
    const beforeKeys = Object.keys(payload);
    const serialized = serializeTopStoriesAuditPayload(payload);
    expect(JSON.parse(serialized)).toEqual({ a: { c: 3 }, b: 2 });
    expect(Object.keys(payload)).toEqual(beforeKeys);
    expect(typeof payload.a.fn).toBe('function');
  });

  it('exposes standalone actual and golden payload helpers', () => {
    expect(getTopStoriesAuditPayload()).toMatchObject({ ok: true, mode: 'shadow-audit', actual: expect.any(Object) });
    expect(getTopStoriesGoldenAuditPayload()).toMatchObject({ ok: true, mode: 'shadow-audit', expected: expect.any(Object) });
  });

  it('does not mutate regression fixtures', () => {
    const before = JSON.stringify(TOP_STORIES_REGRESSION_INPUT);
    getTopStoriesAuditComparisonPayload();
    getTopStoriesAuditPayload();
    expect(JSON.stringify(TOP_STORIES_REGRESSION_INPUT)).toBe(before);
  });

  it('does not change ranker behavior while building adapter payloads', () => {
    const before = rankTopStories(TOP_STORIES_REGRESSION_INPUT).map(item => item.id);
    getTopStoriesAuditComparisonPayload();
    const after = rankTopStories(TOP_STORIES_REGRESSION_INPUT).map(item => item.id);
    expect(after).toEqual(before);
  });

  it('keeps adapter local and avoids forbidden runtime/browser imports', () => {
    const source = readFileSync(new URL('./topStoriesAuditAdapter.js', import.meta.url), 'utf8');
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/XMLHttpRequest|WebSocket/);
    expect(source).not.toMatch(/rssAggregator|NewsContext|useMainTabViewModel|sectionsDataset|diagnosticsStore/);
    expect(source).not.toMatch(/frontPageComposer|breakingNewsService|entertainmentService|sectionClassifier/);
  });
});
