import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveArticlePublishedAt } from './newsFetcher.js';
import { parseNewsPublishedAt } from '../services/newsService.js';

describe('NW-INSIGHT-CF-001 live timestamp provenance', () => {
  it('preserves publisher timestamps as epoch milliseconds', () => {
    const expected = Date.parse('2026-08-30T04:30:00Z');
    expect(parseNewsPublishedAt('2026-08-30T04:30:00Z')).toBe(expected);
    expect(resolveArticlePublishedAt({ publishedAt: expected })).toBe(expected);
  });

  it('prefers Schema.org publication time when present', () => {
    const schemaTime = Date.parse('2026-09-02T05:00:00Z');
    const feedTime = Date.parse('2026-09-02T04:00:00Z');
    expect(resolveArticlePublishedAt(
      { publishedAt: feedTime },
      { datePublished: '2026-09-02T05:00:00Z' },
    )).toBe(schemaTime);
  });

  it('fails closed instead of fabricating Date.now for missing timestamps', () => {
    expect(parseNewsPublishedAt('not-a-date')).toBe(0);
    expect(resolveArticlePublishedAt({})).toBe(0);

    const fetcherSource = fs.readFileSync('src/adapters/newsFetcher.js', 'utf8');
    expect(fetcherSource).not.toContain('publishedAt = Date.now()');
    expect(fetcherSource).not.toContain('if (isNaN(publishedAt)) publishedAt = Date.now()');
  });
});
