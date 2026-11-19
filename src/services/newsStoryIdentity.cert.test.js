// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addReadArticle, getViewCount, incrementViewCount, isArticleRead } from '../utils/storage.js';
import { canonicalNewsUrl, disambiguateNewsIds } from './newsStoryIdentity.js';

describe('stable section article identity and persisted read state', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  const article = {
    id: 'legacy-collision',
    title: 'Evacuation and shelter assistance update',
    url: 'https://example.org/news?id=42',
  };
  const next = { ...article, url: 'https://example.org/news?id=43' };

  it('keeps distinct URL IDs and state across one → both → one without alias leakage', () => {
    const [first] = disambiguateNewsIds([article]);
    incrementViewCount([first]);
    expect(addReadArticle(first).ok).toBe(true);

    const [second, existing] = disambiguateNewsIds([next, article]);
    expect(existing.id).toBe(first.id);
    expect(second.id).not.toBe(first.id);
    expect(getViewCount(existing)).toBe(1);
    expect(getViewCount(second)).toBe(0);
    expect(isArticleRead(existing)).toBe(true);
    expect(isArticleRead(second)).toBe(false);

    const [alone] = disambiguateNewsIds([{ ...article, id: 'republished-id', url: article.url + '&utm_medium=rss' }]);
    expect(alone.id).toBe(first.id);
    expect(getViewCount(alone)).toBe(1);
    expect(isArticleRead(alone)).toBe(true);
  });

  it('does not apply an ambiguous URL-less historical record to either query variant', () => {
    localStorage.setItem('dailyEventAI_settings', JSON.stringify({
      readingHistory: [{ id: article.id, title: article.title }],
    }));
    const both = disambiguateNewsIds([article, next]);
    expect(both.map(isArticleRead)).toEqual([false, false]);
    expect(isArticleRead(article.id)).toBe(true);
  });

  it('retains an unambiguous historical reading record without changing its current ID', () => {
    const old = { id: 'simple-article', title: 'Shelter updates', url: 'https://example.org/news' };
    localStorage.setItem('dailyEventAI_settings', JSON.stringify({
      readingHistory: [{ id: old.id, title: old.title }],
    }));
    expect(disambiguateNewsIds([old])[0].id).toBe(old.id);
    expect(isArticleRead(old)).toBe(true);
    expect(isArticleRead({ ...old, title: 'A different article' })).toBe(false);
  });

  it('moves old view counts once when stored URL evidence identifies the old row', () => {
    const old = { id: 'legacy-story', title: 'Shelter updates', url: 'https://example.org/shelter' };
    const current = { ...old, id: 'current-story', legacyId: old.id };
    localStorage.setItem('dailyEventAI_settings', JSON.stringify({ readingHistory: [old] }));
    localStorage.setItem('dailyEventAI_articleViews', JSON.stringify({ [old.id]: 3 }));
    expect(getViewCount(current)).toBe(3);
    incrementViewCount([current, current]);
    expect(getViewCount(current)).toBe(5);
    expect(getViewCount(old.id)).toBe(0);
  });

  it('canonicalizes raw and escaped Tamil path spellings without merging query values', () => {
    const tamil = 'https://example.org/தமிழ்';
    expect(canonicalNewsUrl(tamil)).toBe(new URL(tamil).href);
    expect(canonicalNewsUrl(article.url)).not.toBe(canonicalNewsUrl(next.url));
  });
});
