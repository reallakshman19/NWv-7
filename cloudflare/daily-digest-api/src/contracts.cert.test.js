import { describe, expect, it } from 'vitest';
import {
  buildCanonicalId,
  isSelectableCandidate,
} from './contracts.js';

function candidate(overrides = {}) {
  return {
    role: 'INDIA_GENERAL',
    qualificationState: 'QUALIFIED',
    scheduleState: 'EXPECTED',
    acquisitionState: 'OK',
    editionState: 'CURRENT',
    ...overrides,
  };
}

describe('daily digest contracts', () => {
  it('includes edition in canonical identity', () => {
    const base = { publisherFamily: 'Financial Times', product: 'FirstFT', digestDate: '2026-08-24' };
    expect(buildCanonicalId({ ...base, edition: 'Asia' }))
      .not.toBe(buildCanonicalId({ ...base, edition: 'Americas' }));
  });

  it.each([
    ['HOLD', 'EXPECTED', 'OK', 'CURRENT'],
    ['QUALIFIED', 'NOT_SCHEDULED', 'OK', 'CURRENT'],
    ['QUALIFIED', 'NOT_YET_EXPECTED', 'OK', 'CURRENT'],
    ['QUALIFIED', 'EXPECTED', 'CRITICAL', 'CURRENT'],
    ['QUALIFIED', 'EXPECTED', 'OK', 'STALE'],
  ])('rejects ineligible state combinations', (qualificationState, scheduleState, acquisitionState, editionState) => {
    expect(isSelectableCandidate(candidate({
      qualificationState, scheduleState, acquisitionState, editionState,
    }), 'I1')).toBe(false);
  });

  it('enforces slot role compatibility', () => {
    expect(isSelectableCandidate(candidate({ role: 'GLOBAL_BUSINESS_AND_WORLD' }), 'I1')).toBe(false);
    expect(isSelectableCandidate(candidate({ role: 'INDIA_GENERAL' }), 'G1')).toBe(false);
    expect(isSelectableCandidate(candidate({ role: 'INDIA_BROAD' }), 'I3')).toBe(true);
  });
});
