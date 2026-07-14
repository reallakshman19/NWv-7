import { describe, expect, it, vi } from 'vitest';

vi.mock('../utils/storage', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    isArticleRead: () => false,
    getViewCount: () => 0,
  };
});

const { __mainViewModelInternalsForTest } = await import('./useMainTabViewModel.js');
const { buildMainSectionHealthSummaryMap } = __mainViewModelInternalsForTest;

function sectionsEnvelope() {
  return {
    datasetId: 'sections',
    data: {
      summaries: [
        {
          section: 'topStories',
          ok: true,
          count: 10,
          sourceCounts: { Reuters: 5, BBC: 5 },
        },
        {
          section: 'world',
          ok: true,
          count: 8,
          sourceCounts: { Reuters: 4, BBC: 4 },
          fetchDiagnostics: { lastCheckedAt: '2026-07-14T11:58:00Z' },
        },
        {
          section: 'india',
          ok: true,
          count: 6,
          sourceCounts: { 'The Hindu': 3, NDTV: 3 },
        },
        {
          section: 'chennai',
          ok: true,
          count: 5,
          sourceCounts: { 'The Hindu': 5 },
          isSingleSource: true,
        },
        {
          section: 'muscat',
          ok: true,
          count: 4,
          sourceCounts: { 'Times of Oman': 2, 'Muscat Daily': 2 },
        },
      ],
    },
  };
}

function mainEnvelope() {
  return {
    datasetId: 'main',
    data: {
      frontPage: [{ id: 'front-1' }],
      raw: {
        sections: sectionsEnvelope(),
      },
    },
  };
}

describe('NW-MAIN-006 Main section health mapping', () => {
  it('maps nested World diagnostics to world and world-news aliases', () => {
    const map = buildMainSectionHealthSummaryMap({ datasetEnvelope: mainEnvelope() });

    expect(map.world).toMatchObject({
      sectionId: 'world',
      status: 'ok',
      storyCount: 8,
      sourceGroupCount: 2,
      lastCheckedAt: '2026-07-14T11:58:00Z',
    });
    expect(map['world-news']).toBe(map.world);
  });

  it('preserves existing Top Stories, India, Tamil Nadu, and Muscat aliases', () => {
    const map = buildMainSectionHealthSummaryMap({ datasetEnvelope: mainEnvelope() });

    expect(map.topStories).toBe(map.topstories);
    expect(map['top-stories']).toBe(map.topstories);
    expect(map['india-news']).toBe(map.india);
    expect(map.tamilNadu).toBe(map.chennai);
    expect(map.tn).toBe(map.chennai);
    expect(map.local).toBe(map.muscat);
    expect(map['local-news']).toBe(map.muscat);
    expect(map['muscat-news']).toBe(map.muscat);
  });

  it('supports a direct Sections-shaped envelope', () => {
    const map = buildMainSectionHealthSummaryMap({ datasetEnvelope: sectionsEnvelope() });
    expect(map.world).toMatchObject({ sectionId: 'world', status: 'ok', storyCount: 8 });
  });

  it('returns an empty map when Sections diagnostics are absent', () => {
    const map = buildMainSectionHealthSummaryMap({
      datasetEnvelope: { datasetId: 'main', data: { raw: {} } },
    });
    expect(map).toEqual({});
  });
});