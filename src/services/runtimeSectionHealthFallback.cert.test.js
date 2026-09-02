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

  it('fails closed when the served section has no visible stories', () => {
    const summary = buildRuntimeSectionHealthSummary({ sectionId: 'world-news', stories: [] });
    expect(summary).toMatchObject({
      sectionId: 'world',
      status: 'critical',
      storyCount: 0,
      evidenceSource: 'served-stories',
    });
    expect(summary.reasons).toEqual([
      'served_section_empty',
      'source_health_unavailable',
    ]);
  });

  it('downgrades stored OK health when served data is empty', () => {
    const stored = {
      sectionId: 'india',
      status: 'ok',
      storyCount: 30,
      sourceGroupCount: 3,
      reasons: ['stored_snapshot_healthy'],
    };
    const summary = resolveSectionHealthSummary({
      healthSummary: stored,
      sectionId: 'india-news',
      stories: [],
    });
    expect(summary).toMatchObject({
      sectionId: 'india',
      status: 'critical',
      storyCount: 0,
      sourceGroupCount: 3,
      evidenceSource: 'served-stories+stored-health',
    });
    expect(summary.reasons).toEqual([
      'stored_snapshot_healthy',
      'served_section_empty',
      'stored_health_disagrees_with_served_data',
    ]);
  });

  it('preserves authoritative summaries when served stories exist', () => {
    const authoritative = { sectionId: 'world', status: 'critical', storyCount: 4 };
    expect(resolveSectionHealthSummary({
      healthSummary: authoritative,
      sectionId: 'world-news',
      stories,
    })).toBe(authoritative);
    expect(hasConcreteSectionHealth(authoritative)).toBe(true);
  });

  it('replaces non-concrete unknown summaries when story evidence exists', () => {
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
