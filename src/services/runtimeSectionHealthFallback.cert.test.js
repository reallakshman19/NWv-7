import { describe, expect, it } from 'vitest';
import {
  buildRuntimeSectionHealthSummary,
  hasConcreteSectionHealth,
  normalizeRuntimeSectionId,
  resolveSectionHealthSummary,
} from './runtimeSectionHealthFallback.js';

describe('NW-MAIN-007 runtime section health fallback', () => {
  const stories = [
    { id: 'world-1', source: 'BBC', sourceGroup: 'bbc', fetchedAt: 1784040000000 },
    { id: 'world-2', source: 'The Hindu', sourceGroup: 'the_hindu', fetchedAt: 1784040060000 },
    { id: 'world-3', source: 'BBC', sourceGroup: 'bbc', fetchedAt: 1784040030000 },
  ];

  it('derives a conservative warning summary from rendered stories', () => {
    const summary = buildRuntimeSectionHealthSummary({
      sectionId: 'world-news',
      stories,
    });

    expect(summary).toMatchObject({
      sectionId: 'world',
      status: 'warning',
      storyCount: 3,
      sourceGroupCount: 2,
      singleSource: false,
      evidenceSource: 'rendered-stories',
    });
    expect(summary.topSources).toEqual([
      { source: 'BBC', count: 2 },
      { source: 'The Hindu', count: 1 },
    ]);
    expect(summary.reasons).toEqual([
      'runtime_story_evidence_only',
      'source_health_unavailable',
    ]);
    expect(summary.lastCheckedAt).toBe('2026-07-14T14:41:00.000Z');
  });

  it('never fabricates health when there are no visible stories and no health evidence', () => {
    expect(buildRuntimeSectionHealthSummary({ sectionId: 'world-news', stories: [] })).toBeNull();
    expect(resolveSectionHealthSummary({ healthSummary: null, sectionId: 'world-news', stories: [] })).toBeNull();
  });

  it('preserves authoritative summaries when rendered stories agree', () => {
    const authoritative = { sectionId: 'world', status: 'critical', storyCount: 4 };
    expect(resolveSectionHealthSummary({
      healthSummary: authoritative,
      sectionId: 'world-news',
      stories,
    })).toBe(authoritative);
    expect(hasConcreteSectionHealth(authoritative)).toBe(true);
  });

  it('never leaves an empty rendered section green', () => {
    const authoritative = {
      sectionId: 'india',
      status: 'ok',
      storyCount: 8,
      reasons: ['source_health_ok'],
    };
    const resolved = resolveSectionHealthSummary({
      healthSummary: authoritative,
      sectionId: 'india-news',
      stories: [],
    });

    expect(resolved).toMatchObject({
      sectionId: 'india',
      status: 'warning',
      storyCount: 0,
      evidenceSource: 'health-summary+rendered-stories',
    });
    expect(resolved.reasons).toEqual([
      'source_health_ok',
      'rendered_section_empty',
      'health_story_count_mismatch',
    ]);
  });

  it('preserves critical severity while reconciling an empty rendered section', () => {
    const authoritative = {
      sectionId: 'local',
      status: 'critical',
      storyCount: 4,
      reasons: ['all_known_sources_failed'],
    };
    const resolved = resolveSectionHealthSummary({
      healthSummary: authoritative,
      sectionId: 'muscat-news',
      stories: [],
    });

    expect(resolved).toMatchObject({
      sectionId: 'local',
      status: 'critical',
      storyCount: 0,
      evidenceSource: 'health-summary+rendered-stories',
    });
    expect(resolved.reasons).toEqual([
      'all_known_sources_failed',
      'rendered_section_empty',
      'health_story_count_mismatch',
    ]);
  });

  it('replaces non-concrete unknown summaries only when story evidence exists', () => {
    const summary = resolveSectionHealthSummary({
      healthSummary: { sectionId: 'world', status: 'unknown' },
      sectionId: 'world-news',
      stories,
    });
    expect(summary.status).toBe('warning');
    expect(summary.reasons).toContain('source_health_unavailable');
  });

  it('normalizes all Main section aliases', () => {
    expect(normalizeRuntimeSectionId('top-stories')).toBe('topStories');
    expect(normalizeRuntimeSectionId('frontPage')).toBe('topStories');
    expect(normalizeRuntimeSectionId('india-news')).toBe('india');
    expect(normalizeRuntimeSectionId('tamilNadu')).toBe('chennai');
    expect(normalizeRuntimeSectionId('muscat-news')).toBe('local');
    expect(normalizeRuntimeSectionId('world-news')).toBe('world');
  });
});
