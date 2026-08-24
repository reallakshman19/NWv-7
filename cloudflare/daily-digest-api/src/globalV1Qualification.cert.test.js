import { describe, expect, it } from 'vitest';
import { DAILY_DIGEST_REGISTRY, findRegistryEntry } from './registry.js';
import { G1_ROLE, globalV1Candidates, resolveGlobalV1Availability } from './globalV1Qualification.js';

describe('Daily Digest global v1 qualification', () => {
  it('keeps the current G1 role unchanged', () => {
    expect(G1_ROLE).toBe('GLOBAL_BUSINESS_AND_WORLD');
  });

  it('reports global unavailable when no qualified exact-role source exists', () => {
    const result = resolveGlobalV1Availability();
    expect(result.state).toBe('GLOBAL_UNAVAILABLE');
    expect(result.eligiblePublisherFamilies).toEqual([]);
  });

  it('keeps FirstFT Asia excluded until current-edition discovery is qualified', () => {
    const ft = findRegistryEntry('FINANCIAL_TIMES', 'FIRSTFT', 'ASIA');
    expect(ft.qualificationState).toBe('HOLD');
    expect(ft.editionResolverQualification).toBe('QUALIFIED');
    expect(ft.acquisitionQualification).toBe('HOLD');
    expect(ft.v1Eligibility).toBe('EXCLUDED');
  });

  it('records AP and BBC as valid products without pretending public edition discovery exists', () => {
    const ap = findRegistryEntry('ASSOCIATED_PRESS', 'MORNING_WIRE', 'DEFAULT');
    const bbc = findRegistryEntry('BBC', 'NEWS_BRIEFING', 'INTERNATIONAL');
    for (const item of [ap, bbc]) {
      expect(item.productQualification).toBe('QUALIFIED');
      expect(item.qualificationState).toBe('HOLD');
      expect(item.acquisitionQualification).toBe('HOLD');
      expect(item.role).toBe('GLOBAL_GENERAL');
    }
  });

  it('does not treat Reuters or Guardian as compatible G1 candidates', () => {
    const reuters = findRegistryEntry('REUTERS', 'TRADING_DAY', 'ASIA_MARKETS');
    const guardian = findRegistryEntry('GUARDIAN', 'FIRST_EDITION', 'UK');
    expect(reuters.role).not.toBe(G1_ROLE);
    expect(guardian.role).not.toBe(G1_ROLE);
    expect(reuters.v1Eligibility).toBe('EXCLUDED');
    expect(guardian.v1Eligibility).toBe('EXCLUDED');
  });

  it('only considers global registry entries in the qualification trace', () => {
    const candidates = globalV1Candidates(DAILY_DIGEST_REGISTRY);
    expect(candidates.length).toBeGreaterThanOrEqual(5);
    expect(candidates.every(item => item.role.startsWith('GLOBAL_'))).toBe(true);
  });
});
