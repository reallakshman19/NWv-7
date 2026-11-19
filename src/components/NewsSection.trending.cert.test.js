import { describe, expect, it } from 'vitest';
import { computeTrending } from '../utils/trendingUtils.js';
import { DEFAULT_RANKING_POLICY } from '../config/rankingPolicy.js';

const policy = DEFAULT_RANKING_POLICY;
const now = Date.now();
const primary = {
  title: 'Supreme Court orders national pension reforms',
  source: 'BBC', url: 'https://bbc.com/news/pension',
  publishedAt: now - 30 * 60_000,
};
const secondary = {
  ...primary, source: 'Reuters', url: 'https://reuters.com/world/india/pension',
};

describe('computeTrending — RC-7 consensus gate', () => {
  it('single-source high-score item is NOT trending', () => {
    const item = {
      impactScore: 20,
      publishedAt: now - 30 * 60_000, // 30 min old (very fresh)
      sourceCount: 1,
      isBreaking: false,
    };
    expect(computeTrending(item, policy, now)).toBe(false);
  });

  it('two-source fresh high-score item IS trending', () => {
    const item = {
      ...primary,
      newsEvidenceRows: [primary, secondary],
      impactScore: 20,
      publishedAt: now - 30 * 60_000, // 30 min old
      sourceCount: 2,
      isBreaking: false,
    };
    expect(computeTrending(item, policy, now)).toBe(true);
    expect(computeTrending({ ...item, impactScore: 0, sourceCount: 99 }, policy, now)).toBe(true);
    expect(computeTrending({ ...item, newsEvidenceRows: [primary] }, policy, now)).toBe(false);
    expect(computeTrending({
      ...item, newsEvidenceRows: [primary, { ...secondary, publishedAt: now - 48 * 3_600_000 }],
    }, policy, now)).toBe(false);
  });

  it('breaking story is never trending (it has its own badge)', () => {
    const item = {
      impactScore: 50,
      publishedAt: now - 30 * 60_000,
      sourceCount: 5,
      isBreaking: true,
    };
    expect(computeTrending(item, policy, now)).toBe(false);
  });

  it('stale two-source item is NOT trending (decayed score too low)', () => {
    const item = {
      impactScore: 15,
      publishedAt: now - 48 * 3_600_000, // 2 days old
      sourceCount: 5,
      isBreaking: false,
    };
    expect(computeTrending(item, policy, now)).toBe(false);
  });
});
