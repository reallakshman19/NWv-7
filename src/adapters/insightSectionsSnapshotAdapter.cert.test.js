import { describe, expect, it } from 'vitest';
import { SECTIONS_DATA_SOURCES } from '../utils/sectionsDataSource.js';
import {
  buildInsightSnapshotFromSectionsSnapshot,
  flattenSectionsForInsight,
} from './insightSectionsSnapshotAdapter.js';

function previewSnapshot() {
  return {
    schemaVersion: 2,
    fetchedAt: Date.parse('2026-09-02T06:00:00Z'),
    contentHash: 'abc123',
    runtimeDataSource: {
      requested: SECTIONS_DATA_SOURCES.CLOUDFLARE_PREVIEW,
      effective: SECTIONS_DATA_SOURCES.CLOUDFLARE_PREVIEW,
      fallback: false,
    },
    preview: {
      evidenceVerified: true,
      epochId: 'live-1788328800000',
      sourceRegistryVersion: 'sections-registry/v1',
    },
    sections: {
      india: [
        {
          id: 'india-1',
          title: 'India story',
          summary: 'India summary',
          source: 'Publisher A',
          sourceGroup: 'publisher_a',
          url: 'https://example.com/india-1',
          publishedAt: Date.parse('2026-09-02T05:00:00Z'),
        },
      ],
      topStories: [
        {
          id: 'top-duplicate',
          title: 'India story duplicate',
          summary: 'Duplicate summary',
          source: 'Publisher A',
          sourceGroup: 'publisher_a',
          url: 'https://example.com/india-1',
          publishedAt: Date.parse('2026-09-02T05:00:00Z'),
          topFeedRank: 1,
          topFeedSource: 'topStories:01',
        },
        {
          id: 'bad-time',
          title: 'Missing timestamp',
          url: 'https://example.com/bad-time',
          publishedAt: 0,
        },
      ],
    },
  };
}

describe('NW-INSIGHT-CF-001 Sections preview adapter', () => {
  it('deduplicates publisher stories, retains Top Stories signals, and rejects unproven timestamps', () => {
    const stories = flattenSectionsForInsight(previewSnapshot());
    expect(stories).toHaveLength(1);
    expect(stories[0].url).toBe('https://example.com/india-1');
    expect(stories[0].category).toBe('topStories');
    expect(stories[0].topFeedRank).toBe(1);
  });

  it('projects only verified Cloudflare Preview authority', () => {
    const projected = buildInsightSnapshotFromSectionsSnapshot(previewSnapshot());
    expect(projected?.stories).toHaveLength(1);
    expect(projected?.fetchedAt).toBe(Date.parse('2026-09-02T06:00:00Z'));
    expect(projected?.sourceAuthority.effective)
      .toBe(SECTIONS_DATA_SOURCES.CLOUDFLARE_PREVIEW);
    expect(projected?.sourceAuthority.evidenceVerified).toBe(true);
  });

  it('fails closed for GitHub fallback or unverified preview evidence', () => {
    const fallback = previewSnapshot();
    fallback.runtimeDataSource.effective = SECTIONS_DATA_SOURCES.GITHUB;
    expect(buildInsightSnapshotFromSectionsSnapshot(fallback)).toBeNull();

    const unverified = previewSnapshot();
    unverified.preview.evidenceVerified = false;
    expect(buildInsightSnapshotFromSectionsSnapshot(unverified)).toBeNull();
  });
});
