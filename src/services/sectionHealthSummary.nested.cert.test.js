import { describe, expect, it } from 'vitest';
import {
  buildSectionHealthSummaries,
  getSectionHealthSummary,
  resolveSectionsHealthEnvelope,
} from './sectionHealthSummary.js';

function sectionsEnvelope() {
  return {
    datasetId: 'sections',
    data: {
      summaries: [
        {
          section: 'world',
          ok: true,
          count: 6,
          sourceCounts: { BBC: 3, Reuters: 3 },
          fetchDiagnostics: { lastCheckedAt: '2026-07-14T11:55:00Z' },
        },
        {
          section: 'india',
          ok: true,
          count: 3,
          sourceCounts: { 'The Hindu': 3 },
          isSingleSource: true,
        },
      ],
      sourceHealth: {
        sources: [
          {
            id: 'bbc_world',
            section: 'world',
            source: 'BBC',
            sourceGroup: 'bbc',
            status: 'warn',
            items: 3,
            lastCheckedAt: '2026-07-14T11:56:00Z',
            lastError: 'slow response',
          },
          {
            id: 'reuters_world',
            section: 'world',
            source: 'Reuters',
            sourceGroup: 'reuters',
            status: 'ok',
            items: 3,
            lastCheckedAt: '2026-07-14T11:57:00Z',
          },
        ],
      },
    },
  };
}

function mainEnvelope() {
  const sections = sectionsEnvelope();
  return {
    datasetId: 'main',
    data: {
      frontPage: [{ id: 'front-1' }],
      raw: { sections },
    },
  };
}

describe('NW-MAIN-006 nested Sections health bridge', () => {
  it('resolves data.raw.sections from the Main envelope', () => {
    const main = mainEnvelope();
    expect(resolveSectionsHealthEnvelope(main)).toBe(main.data.raw.sections);
  });

  it('builds World health with embedded source diagnostics', () => {
    const world = getSectionHealthSummary('world', mainEnvelope());
    expect(world).toMatchObject({
      sectionId: 'world',
      status: 'warning',
      storyCount: 6,
      sourceGroupCount: 2,
      lastCheckedAt: '2026-07-14T11:55:00Z',
    });
    expect(world.warningFeeds).toEqual([
      expect.objectContaining({ id: 'bbc_world', lastError: 'slow response' }),
    ]);
    expect(world.reasons).toContain('source_warning_status');
  });

  it('keeps direct Sections envelopes compatible', () => {
    const rows = buildSectionHealthSummaries(sectionsEnvelope());
    expect(rows.map(row => row.sectionId)).toEqual(['india', 'world']);
    expect(rows.find(row => row.sectionId === 'india')).toMatchObject({
      status: 'warning',
      singleSource: true,
    });
  });

  it('does not fabricate health when nested diagnostics are absent', () => {
    expect(buildSectionHealthSummaries({ datasetId: 'main', data: { raw: {} } })).toEqual([]);
  });
});