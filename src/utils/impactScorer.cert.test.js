import { describe, expect, it } from 'vitest';
import { calculateImpactScore } from './impactScorer.js';

describe('calculateImpactScore — keyword safety', () => {
  it('does not apply a multiplier to an entertainment franchise keyword', () => {
    const score = calculateImpactScore(
      'God of War Laufey Revealed With Gameplay Trailer',
      'Revealed at State of Play',
      {},
    );
    expect(score).toBeCloseTo(1.0, 5);
  });

  it('does not apply a direct multiplier to a real conflict keyword', () => {
    const score = calculateImpactScore(
      'West Asia war: Iran missile strike kills dozens in Gulf',
      '',
      { rankingWeights: { impact: { highImpactBoost: 2.5 } } },
    );
    expect(score).toBeCloseTo(1.5, 5);
  });

  it('does not apply a direct multiplier to election or budget words', () => {
    const election = calculateImpactScore(
      'Tamil Nadu election voter turnout reaches 5.75 crore',
      '',
      {},
    );
    const budget = calculateImpactScore(
      'India budget sets fiscal spending plan',
      '',
      {},
    );
    expect(election).toBeCloseTo(1.43, 5);
    expect(budget).toBeCloseTo(1.3, 5);
  });

  it('records keyword evidence without an xN boost decision', () => {
    calculateImpactScore('Election results announced after voting', '', {});
    const decisions = calculateImpactScore._lastDecisions || [];
    expect(decisions.some(d => /keyword evidence 'election'/i.test(d))).toBe(true);
    expect(decisions.some(d => /\bx\d/i.test(d))).toBe(false);
  });

  it('records entertainment suppression and resets decisions per call', () => {
    calculateImpactScore('God of War gameplay trailer', '', {});
    expect(calculateImpactScore._lastDecisions).toHaveLength(1);
    calculateImpactScore('Community garden opens', '', {});
    expect(calculateImpactScore._lastDecisions).toEqual([]);
  });
});
