import { describe, expect, it } from 'vitest';
import {
  buildSectionHealthSummaries,
  buildSectionHealthSummary,
  getSectionHealthSummary,
  normalizeSourceHealthRows,
} from './sectionHealthSummary.js';

function sectionsEnvelope() {
  return {
    data: {
      summaries: [
        {
          section: 'india',
          ok: true,
          count: 12,
          sourceCounts: { 'The Hindu': 6, 'Times of India': 6 },
          isSingleSource: false,
        },
        {
          section: 'entertainment',
          ok: true,
          count: 8,
          sourceCounts: { 'Promo Wire': 8 },
          isSingleSource: true,
        },
        {
          section: 'business',
          ok: true,
          count: 0,
          sourceCounts: {},
        },
        {
          section: 'muscat',
          ok: true,
          count: 10,
          sourceCounts: { 'Times of Oman': 7, 'Muscat Daily': 3 },
          isSingleSource: false,
        },
      ],
      performanceSummary: {},
    },
  };
}

const sourceHealth = {
  data: {
    sources: [
      {
        id: 'the_hindu',
        section: 'india',
        source: 'The Hindu',
        sourceGroup: 'the_hindu',
        status: 'ok',
        items: 12,
        lastCheckedAt: '2026-07-13T00:00:00Z',
      },
      {
        id: 'times_of_india',
        section: 'india',
        source: 'Times of India',
        sourceGroup: 'times_of_india',
        status: 'ok',
        items: 9,
        lastCheckedAt: '2026-07-13T00:01:00Z',
      },
      {
        id: 'financial_express',
        section: 'business',
        source: 'Financial Express',
        sourceGroup: 'financial_express',
        status: 'fail',
        items: 0,
        zeroItemRuns: 12,
        feedUrl: 'https://www.financialexpress.com/feed/',
        lastError: 'HTTP 403',
      },
      {
        id: 'muscat_daily',
        section: 'muscat',
        source: 'Muscat Daily',
        sourceGroup: 'muscat_daily',
        status: 'warn',
        items: 0,
        zeroItemRuns: 4,
        feedUrl: 'https://www.muscatdaily.com/feed',
        lastError: '415 Unsupported Media Type',
      },
    ],
  },
};

describe('NW-MAIN-001 section health summary bridge', () => {
  it('normalizes array and object source-health shapes', () => {
    expect(normalizeSourceHealthRows(sourceHealth)).toHaveLength(4);
    const reduced = normalizeSourceHealthRows({
      ndtv: { status: 'fail', items: 0, zeroItemRuns: 134, section: 'india' },
      times_of_oman: { ok: true, items: 0, section: 'muscat' },
    });
    expect(reduced.map(row => row.id)).toEqual(['ndtv', 'times_of_oman']);
    expect(reduced[0]).toMatchObject({ status: 'critical', zeroItemRuns: 134 });
  });

  it('normalizes source rows with section arrays from policy reports', () => {
    const rows = normalizeSourceHealthRows({
      sources: [
        {
          id: 'google_news',
          sections: ['topStories', 'muscat'],
          status: 'ok',
          items: 15,
        },
      ],
    });
    expect(rows[0]).toMatchObject({ id: 'google_news', sections: ['muscat', 'topstories'] });
  });

  it('marks healthy multi-source sections as ok', () => {
    const india = getSectionHealthSummary('india', sectionsEnvelope(), sourceHealth);
    expect(india).toMatchObject({ sectionId: 'india', status: 'ok', storyCount: 12, sourceGroupCount: 2 });
    expect(india.reasons).toEqual([]);
  });

  it('marks single-source thin sections as warning', () => {
    const entertainment = getSectionHealthSummary('entertainment', sectionsEnvelope(), sourceHealth);
    expect(entertainment.status).toBe('warning');
    expect(entertainment.singleSource).toBe(true);
    expect(entertainment.reasons).toContain('single_source_section');
  });

  it('marks empty sections with failed sources as critical', () => {
    const business = getSectionHealthSummary('business', sectionsEnvelope(), sourceHealth);
    expect(business.status).toBe('critical');
    expect(business.deadFeeds).toHaveLength(1);
    expect(business.zeroItemFeeds).toHaveLength(1);
    expect(business.reasons).toContain('empty_section_with_failed_sources');
    expect(business.lastError).toBe('HTTP 403');
  });

  it('marks partial warning feeds as warning while preserving visible stories', () => {
    const muscat = getSectionHealthSummary('muscat', sectionsEnvelope(), sourceHealth);
    expect(muscat.status).toBe('warning');
    expect(muscat.storyCount).toBe(10);
    expect(muscat.warningFeeds).toHaveLength(1);
    expect(muscat.zeroItemFeeds[0]).toMatchObject({ id: 'muscat_daily', zeroItemRuns: 4 });
  });

  it('keeps persistent partial zero-item feeds as warning when stories remain visible', () => {
    const rows = normalizeSourceHealthRows({
      sources: [
        { id: 'times_of_oman', section: 'muscat', source: 'Times of Oman', status: 'ok', items: 12 },
        { id: 'oman_observer', section: 'muscat', source: 'Oman Observer', status: 'warn', items: 0, zeroItemRuns: 37 },
      ],
    });
    const muscat = buildSectionHealthSummary(
      { section: 'muscat', count: 12, sourceCounts: { 'Times of Oman': 12 } },
      rows,
    );
    expect(muscat.status).toBe('warning');
    expect(muscat.storyCount).toBe(12);
    expect(muscat.reasons).toContain('persistent_zero_item_feed_streak');
    expect(muscat.zeroItemFeeds).toHaveLength(1);
  });

  it('matches source-health rows to sections arrays', () => {
    const rows = normalizeSourceHealthRows({
      sources: [
        { id: 'google_news_oman', sections: ['muscat'], source: 'Google News Oman', status: 'ok', items: 8 },
      ],
    });
    const muscat = buildSectionHealthSummary(
      { section: 'muscat', count: 8, sourceCounts: { 'Google News Oman': 8 } },
      rows,
    );
    expect(muscat.topSources.map(source => source.source)).toContain('Google News Oman');
  });

  it('handles missing source-health gracefully using section summaries only', () => {
    const rows = buildSectionHealthSummaries(sectionsEnvelope(), null);
    expect(rows.find(row => row.sectionId === 'india').status).toBe('ok');
    expect(rows.find(row => row.sectionId === 'entertainment').status).toBe('warning');
  });

  it('does not mutate input envelopes or source-health rows', () => {
    const sectionInput = sectionsEnvelope();
    const sourceInput = structuredClone(sourceHealth);
    const beforeSections = JSON.stringify(sectionInput);
    const beforeSources = JSON.stringify(sourceInput);
    buildSectionHealthSummaries(sectionInput, sourceInput);
    expect(JSON.stringify(sectionInput)).toBe(beforeSections);
    expect(JSON.stringify(sourceInput)).toBe(beforeSources);
  });

  it('sorts output deterministically by section id', () => {
    expect(buildSectionHealthSummaries(sectionsEnvelope(), sourceHealth).map(row => row.sectionId))
      .toEqual(['business', 'entertainment', 'india', 'muscat']);
  });

  it('supports direct single-summary analysis', () => {
    const summary = buildSectionHealthSummary({ section: 'local', count: 1, sourceCounts: { Only: 1 } }, []);
    expect(summary).toMatchObject({ sectionId: 'local', status: 'warning', singleSource: true });
  });
});
