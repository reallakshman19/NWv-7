import { describe, expect, it } from 'vitest';
import { __techSocialPageViewModelInternalsForTest } from './useTechSocialPageViewModel.js';

const {
  mergeBuzzDisplayData,
  projectBuzzDatasetToNewsData,
  projectTechnologyStories,
  projectAiInnovationStories,
  classifyEntertainmentRegion,
  projectEntertainmentStories,
  filterOldNews,
  normalizeBuzzCachePayload,
  mergeRetainedBuzzStories,
  getStoryExpirationMs,
} = __techSocialPageViewModelInternalsForTest;

describe('TechSocial page Buzz dataset fallback', () => {
  it('projects Buzz dataset tech and AI cards into legacy page news shape', () => {
    const result = projectBuzzDatasetToNewsData({
      techCards: [{ id: 'tech-1', title: 'Startup funding round' }],
      aiCards: [{ id: 'ai-1', title: 'OpenAI model update' }],
      sourceSections: {
        technology: [{ id: 'tech-2', title: 'Chip startup ships accelerator' }],
      },
    });

    expect(result.technology.map(item => item.id)).toEqual(['tech-1', 'ai-1', 'tech-2']);
  });

  it('uses adapter technology only when legacy NewsContext technology is empty', () => {
    const result = mergeBuzzDisplayData(
      { technology: [], entertainment: [{ id: 'legacy-ent' }] },
      { technology: [{ id: 'adapter-tech' }], entertainment: [{ id: 'adapter-ent' }] }
    );

    expect(result.technology.map(item => item.id)).toEqual(['adapter-tech']);
    expect(result.entertainment.map(item => item.id)).toEqual(['legacy-ent']);
  });

  it('renders adapter AI-heavy technology in both Tech and AI projections', () => {
    const displayData = {
      technology: [
        { id: '1', title: 'OpenAI releases startup tools', publishedAt: Date.now() },
      ],
    };

    expect(projectTechnologyStories(displayData, 72)).toHaveLength(1);
    expect(projectAiInnovationStories(displayData, 72)).toHaveLength(1);
  });

  it('does not route generic India or city stories into entertainment language tabs', () => {
    expect(classifyEntertainmentRegion({
      title: 'Siddaramaiah meets Congress high command',
      source: 'India News',
    })).toBeNull();

    expect(classifyEntertainmentRegion({
      title: 'Chennai traffic diversion announced',
      source: 'Local Desk',
    })).toBeNull();
  });

  it('does not let explicit feed regions override story text signals', () => {
    expect(classifyEntertainmentRegion({
      title: 'Bollywood title inside a Tamil entertainment feed',
      region: 'tamil',
    })).toBe('hindi');
  });

  it('filters unclassified entertainment rows out of visible tab data', () => {
    const stories = projectEntertainmentStories({
      entertainment: [
        { id: 'politics', title: 'UN-honoured TN farmer story', source: 'India News', publishedAt: Date.now() },
        { id: 'ott', title: 'Netflix releases new limited series', publishedAt: Date.now() },
      ],
    });

    expect(stories.map(item => item.id)).toEqual(['ott']);
  });
});

describe('Buzz Hub per-story retention policy', () => {
  const hour = 60 * 60 * 1000;
  const now = Date.parse('2026-11-21T08:00:00.000Z');

  it('retains a story past eight hours if its publication window has not expired', () => {
    const story = { id: 'yesterday', title: 'Tamil cinema update', publishedAt: now - 20 * hour };
    const payload = {
      savedAt: now - 10 * hour,
      newsData: { entertainment: [story] },
    };
    const restored = normalizeBuzzCachePayload(payload, 72, now);
    expect(restored?.data.entertainment.map(item => item.id)).toEqual(['yesterday']);
  });

  it('prunes expired stories individually, even in an otherwise valid recent cache', () => {
    const payload = {
      savedAt: now - hour,
      newsData: { entertainment: [
        { id: 'expired', title: 'Old update', publishedAt: now - 73 * hour },
        { id: 'alive', title: 'Recent update', publishedAt: now - 12 * hour },
      ] },
    };
    expect(normalizeBuzzCachePayload(payload, 72, now)?.data.entertainment.map(item => item.id))
      .toEqual(['alive']);
    expect(normalizeBuzzCachePayload({
      savedAt: now - hour,
      newsData: { entertainment: [payload.newsData.entertainment[0]] },
    }, 72, now)).toBeNull();
  });

  it('keeps surviving cached stories alongside a newer fetch without duplicating stories', () => {
    const cached = [
      { id: 'still-valid', title: 'Yesterday', publishedAt: now - 20 * hour },
      { id: 'expired', title: 'Earlier', publishedAt: now - 73 * hour },
    ];
    const incoming = [
      { id: 'today', title: 'Today', publishedAt: now - hour },
      { id: 'still-valid', title: 'Updated description', publishedAt: now - 20 * hour },
    ];
    const merged = mergeRetainedBuzzStories(incoming, cached, 72, now - 20 * hour, now);
    expect(merged.map(item => item.id)).toEqual(['today', 'still-valid']);
    expect(merged[1].title).toBe('Updated description');
  });

  it('uses original cache timestamp for undated legacy stories, not each refresh', () => {
    const story = { id: 'no-date', title: 'Undated story' };
    const restored = normalizeBuzzCachePayload({
      timestamp: now - 48 * hour, data: { entertainment: [story] },
    }, 72, now);
    expect(restored?.data.entertainment[0]._buzzFirstSeenAt).toBe(now - 48 * hour);

    const refreshed = mergeRetainedBuzzStories(
      [story], restored.data.entertainment, 72, restored.savedAt, now + 25 * hour
    );
    expect(refreshed).toEqual([]);
  });

  it('honors explicit article expiry and never revives an expired-only feed', () => {
    const expired = {
      id: 'ended', title: 'Old show',
      publishedAt: now - 5 * hour, expiresAt: now - hour,
    };
    expect(getStoryExpirationMs(expired, 72)).toBe(now - hour);
    expect(mergeRetainedBuzzStories([expired], [], 72, 0, now)).toEqual([]);
    expect(filterOldNews([{
      id: 'old', title: 'Movie article', publishedAt: Date.now() - 73 * hour,
    }], 72)).toEqual([]);
  });
});
