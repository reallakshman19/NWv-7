import { describe, expect, it } from 'vitest';
import {
  SECTION_SNAPSHOT_MAX_AGE_MS,
  getSectionsSnapshotRuntimeSummary,
  selectPrefetchedSectionItems,
} from './sectionsSnapshotFetcher';

const snapshot = {
  schemaVersion: 2,
  fetchedAt: Date.now(),
  contentHash: 'abc123',
  sectionQuality: {
    tn: {
      storyCount: 2,
      sourceGroupCount: 2,
      thin: false,
    },
  },
  sections: {
    tn: [
      {
        id: 'a',
        title: 'Chennai rain update',
        summary: 'Schools monitor weather after heavy rain.',
        url: 'https://example.com/a',
        source: 'The Hindu Chennai',
        sourceGroup: 'the_hindu',
        publishedAt: Date.now() - 1000,
      },
      {
        id: 'b',
        title: 'Tamil Nadu transport update',
        summary: 'Officials announced route changes.',
        url: 'https://example.com/b',
        source: 'DT Next',
        sourceGroup: 'dtnext',
        publishedAt: Date.now() - 2000,
      },
    ],
  },
};

describe('Sections snapshot browser ingestion certification', () => {
  it('summarizes section snapshot runtime quality', () => {
    const summary = getSectionsSnapshotRuntimeSummary(snapshot);

    expect(summary.supported).toBe(true);
    expect(summary.schemaVersion).toBe(2);
    expect(summary.hasSectionQuality).toBe(true);
    expect(summary.totalStories).toBe(2);
  });

  it('maps chennai requests to tn prefetched section', () => {
    const result = selectPrefetchedSectionItems(snapshot, 'chennai', 10);

    expect(result.sourceSection).toBe('tn');
    expect(result.items.length).toBe(2);
    expect(result.quality.sourceGroupCount).toBe(2);
    expect(result.items[0]._prefetchedSection).toBe(true);
    expect(result.items[0].section).toBe('chennai');
  });

  it('returns empty result for missing sections without throwing', () => {
    const result = selectPrefetchedSectionItems(snapshot, 'sports', 10);

    expect(result.items).toEqual([]);
    expect(result.sourceSection).toBe('sports');
  });

  it('maps social requests to technology prefetched section', () => {
    const socialSnapshot = {
      schemaVersion: 2,
      fetchedAt: Date.now(),
      sectionQuality: {
        technology: {
          storyCount: 1,
          sourceGroupCount: 1,
          thin: false,
        },
      },
      sections: {
        technology: [
          {
            title: 'Tech trend',
            summary: 'A technology story can back the social trend rail.',
            url: 'https://example.com/tech',
            source: 'Tech Source',
            publishedAt: Date.now(),
          },
        ],
      },
    };

    const result = selectPrefetchedSectionItems(socialSnapshot, 'social', 10);

    expect(result.sourceSection).toBe('technology');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].section).toBe('social');
    expect(result.items[0].title).toBe('Tech trend');
  });

  it('rejects ALL current cards from an expired generation even if items are young', () => {
    const staleSnapshot = {
      ...snapshot,
      fetchedAt: Date.now() - SECTION_SNAPSHOT_MAX_AGE_MS - 1000,
    };

    const result = selectPrefetchedSectionItems(staleSnapshot, 'chennai', 10);

    expect(result.items).toEqual([]);
    expect(result.stale).toBe(true);
    expect(result.staleFallback).toBe(false);
    expect(result.blockedBySnapshotStaleness).toBe(true);
    expect(result.staleReason).toBe('sections_snapshot_stale');
  });

  it('hard-blocks Top Stories when the topStories snapshot is stale', () => {
    const topStoriesSnapshot = {
      schemaVersion: 2,
      fetchedAt: Date.now() - SECTION_SNAPSHOT_MAX_AGE_MS - 1000,
      sections: {
        topStories: [
          {
            id: 'top-1',
            title: 'Important story',
            summary: 'Fresh item in stale snapshot should not render as Top Stories.',
            url: 'https://example.com/top-1',
            source: 'Example',
            sourceGroup: 'example',
            publishedAt: Date.now() - 1000,
          },
        ],
      },
    };

    const result = selectPrefetchedSectionItems(topStoriesSnapshot, 'topStories', 10);

    expect(result.items).toEqual([]);
    expect(result.stale).toBe(true);
    expect(result.staleReason).toBe('top_stories_snapshot_stale');
    expect(result.blockedBySnapshotStaleness).toBe(true);
  });

  it('rejects low-confidence Top Stories instead of using stale fallback', () => {
    const topStoriesSnapshot = {
      schemaVersion: 2,
      fetchedAt: Date.now(),
      sections: {
        topStories: [
          {
            id: 'fallback-ts',
            title: 'Undated story',
            url: 'https://example.com/fallback-ts',
            source: 'Example',
            sourceGroup: 'example',
            publishedAt: Date.now(),
            publishedAtSource: 'fetch_time_fallback',
            timestampConfidence: 'low',
          },
        ],
      },
    };

    const result = selectPrefetchedSectionItems(topStoriesSnapshot, 'topStories', 10);

    expect(result.items).toEqual([]);
    expect(result.stale).toBe(true);
    expect(result.staleFallback).toBe(false);
    expect(result.staleReason).toBe('section_items_stale');
    expect(result.lowConfidenceTimestampCount).toBe(1);
  });

  it('maps local requests to muscat prefetched section', () => {
    const muscatSnapshot = {
      schemaVersion: 2,
      fetchedAt: Date.now(),
      sections: {
        muscat: [
          {
            id: 'om1',
            title: 'Muscat weather update',
            summary: 'Hot and humid conditions expected.',
            url: 'https://example.com/om1',
            source: 'Times of Oman',
            sourceGroup: 'times_of_oman',
            publishedAt: Date.now() - 1000,
          },
        ],
      },
    };

    const result = selectPrefetchedSectionItems(muscatSnapshot, 'local', 10);

    expect(result.sourceSection).toBe('muscat');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].section).toBe('local');
  });

  it('rejects expired normal-section items rather than serving a labelled fallback', () => {
    const oldItemsSnapshot = {
      ...snapshot,
      fetchedAt: Date.now(),
      sections: {
        tn: [
          {
            title: 'Old workflow story',
            url: 'https://example.com/old',
            source: 'Example',
            publishedAt: Date.now() - 40 * 60 * 60 * 1000,
          },
        ],
      },
    };

    const result = selectPrefetchedSectionItems(oldItemsSnapshot, 'chennai', 10);

    expect(result.items).toEqual([]);
    expect(result.stale).toBe(true);
    expect(result.staleFallback).toBe(false);
    expect(result.staleReason).toBe('section_items_stale');
  });
  it('does not admit future-dated snapshot acquisition timestamps', () => {
    const future = { ...snapshot, fetchedAt: Date.now() + 60 * 60 * 1000 };
    const result = selectPrefetchedSectionItems(future, 'chennai', 10);

    expect(result.items).toEqual([]);
    expect(result.blockedBySnapshotStaleness).toBe(true);
    expect(result.staleReason).toBe('sections_snapshot_stale');
  });

  it('excludes low-confidence and future-dated publisher stories from ordinary sections', () => {
    const now = Date.now();
    const mixed = {
      ...snapshot,
      fetchedAt: now,
      sections: {
        tn: [
          { id: 'real', title: 'Publisher news', url: 'https://example.com/real',
            publishedAt: now - 60_000, sourceGroup: 'the_hindu' },
          { id: 'fabricated', title: 'Fetch-time fallback', url: 'https://example.com/fabricated',
            publishedAt: now - 60_000, publishedAtSource: 'fetch_time_fallback' },
          { id: 'future', title: 'Future dated', url: 'https://example.com/future',
            publishedAt: now + 3_600_000, sourceGroup: 'example' },
        ],
      },
    };
    const result = selectPrefetchedSectionItems(mixed, 'tn', 10);

    expect(result.items.map(item => item.id)).toEqual(['real']);
    expect(result.lowConfidenceTimestampCount).toBe(1);
    expect(result.staleFallback).toBe(false);
  });

  it('never re-admits the expired remainder when a section has no current stories', () => {
    const now = Date.now();
    const expired = {
      ...snapshot,
      fetchedAt: now,
      sections: { tn: [
        { id: 'old', publishedAt: now - 40 * 60 * 60 * 1000,
          url: 'https://example.com/old' },
        { id: 'undated', publishedAt: now, timestampConfidence: 'low',
          url: 'https://example.com/undated' },
      ] },
    };
    const result = selectPrefetchedSectionItems(expired, 'tn', 10);

    expect(result.items).toEqual([]);
    expect(result.staleReason).toBe('section_items_stale');
    expect(result.staleFallback).toBe(false);
  });

});
