import { describe, expect, it } from 'vitest';
import { getSourceContentDomain, getSourceDistributionType, getSourceTier } from './normalize';
import { canonicalPublisherFamily } from './publisherIdentity';

describe('Qualified direct publisher semantics', () => {
  it.each([
    ['dw', 'A', 'general'],
    ['ars_technica', 'B', 'tech'],
    ['the_arabian_stories', 'B', 'regional'],
  ] as const)('retains publisher authority and domain for %s across snapshot and Sections intake', (source, tier, domain) => {
    expect(getSourceTier(source)).toBe(tier);
    expect(getSourceDistributionType(source)).toBe('publisher');
    expect(getSourceContentDomain(source)).toBe(domain);
  });

  it('maps display aliases to one publisher, without changing the aggregator family', () => {
    expect(canonicalPublisherFamily('DW English')).toBe('dw');
    expect(canonicalPublisherFamily('ArsTechnica')).toBe('ars_technica');
    expect(canonicalPublisherFamily('The Arabian Stories Oman')).toBe('the_arabian_stories');
    expect(canonicalPublisherFamily('Google News Oman')).toBe('google_news');
  });
});
