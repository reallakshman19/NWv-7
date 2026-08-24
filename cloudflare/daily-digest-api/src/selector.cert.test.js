import { describe, expect, it } from 'vitest';
import {
  isChallengerMateriallySuperior,
  selectDailyDigest,
} from './selector.js';

function quality(overrides = {}) {
  return {
    roleFitClass: 'EXACT', significanceClass: 'HIGH', breadthClass: 'BROAD',
    diversityClass: 'DIVERSE', provenanceClass: 'ORIGINAL_EDITORIAL', accessibilityClass: 'OPEN',
    ...overrides,
  };
}

function candidate(id, publisherFamily, role, precedence, overrides = {}) {
  return {
    canonicalId: id,
    publisherFamily,
    role,
    registryPrecedence: precedence,
    qualificationState: 'QUALIFIED', scheduleState: 'EXPECTED',
    acquisitionState: 'OK', editionState: 'CURRENT',
    ...quality(),
    ...overrides,
  };
}

describe('daily digest selector', () => {
  it('is deterministic and publisher-family unique', () => {
    const rows = [
      candidate('a', 'AKASHVANI', 'INDIA_GENERAL', 10),
      candidate('b', 'INDIAN_EXPRESS', 'INDIA_GENERAL', 20),
      candidate('c', 'THIRD_INDIA', 'INDIA_BROAD', 30),
      candidate('g', 'GLOBAL_ONE', 'GLOBAL_BUSINESS_AND_WORLD', 40),
    ];
    const first = selectDailyDigest(rows);
    const second = selectDailyDigest([...rows].reverse());
    expect(Object.keys(first.selection)).toEqual(['I1', 'I2', 'I3', 'G1']);
    expect(first).toEqual(second);
    expect(first.compositionState).toBe('NORMAL');
  });

  it('does not create a second global slot for India shortfall', () => {
    const result = selectDailyDigest([
      candidate('a', 'A', 'INDIA_GENERAL', 10),
      candidate('b', 'B', 'INDIA_GENERAL', 20),
      candidate('g1', 'G1', 'GLOBAL_BUSINESS_AND_WORLD', 30),
      candidate('g2', 'G2', 'GLOBAL_BUSINESS_AND_WORLD', 40),
    ]);
    expect(Object.keys(result.selection)).toEqual(['I1', 'I2', 'G1']);
    expect(result.compositionState).toBe('DEGRADED_INDIA_SHORTFALL');
  });

  it('requires material quality improvement for hysteresis', () => {
    const incumbent = { ...quality(), registryPrecedence: 20 };
    const tieBreakOnly = { ...quality(), registryPrecedence: 10 };
    const broader = { ...quality({ significanceClass: 'HIGH' }), breadthClass: 'BROAD' };
    const narrowIncumbent = { ...incumbent, breadthClass: 'ADEQUATE' };
    expect(isChallengerMateriallySuperior(incumbent, tieBreakOnly)).toBe(false);
    expect(isChallengerMateriallySuperior(narrowIncumbent, broader)).toBe(true);
  });
});
