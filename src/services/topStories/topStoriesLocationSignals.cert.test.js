import { describe, expect, it } from 'vitest';
import {
  getLocationRelevanceScore,
  getLocationRelevanceSignal,
} from './topStoriesLocationSignals.js';

describe('Top Stories geography evidence provenance', () => {
  it('ignores acquisition section fields for a Seattle story', () => {
    const story = {
      title: 'Seattle food festival shooting leaves two dead',
      section: 'india',
      sourceSection: 'india',
    };

    const signal = getLocationRelevanceSignal(story);

    expect(signal.score).toBe(0.42);
    expect(signal.target).toBe('generic');
    expect(signal.evidence.map(item => item.field)).not.toContain('section');
    expect(signal.evidence.map(item => item.field)).not.toContain('sourceSection');
  });

  it('is invariant when only acquisition provenance changes', () => {
    const story = { title: 'Seattle food festival shooting update' };
    const indiaLane = getLocationRelevanceScore({
      ...story,
      section: 'india',
      sourceSection: 'india',
    });
    const worldLane = getLocationRelevanceScore({
      ...story,
      section: 'world',
      sourceSection: 'world',
    });

    expect(indiaLane).toBe(0.42);
    expect(worldLane).toBe(indiaLane);
  });

  it.each([
    [{ title: 'India election commission issues an update' }, 0.82],
    [{ region: 'Oman', title: 'Airport traffic update' }, 0.82],
    [{ countryCode: 'IN', title: 'National policy update' }, 0.82],
    [{ location: { city: 'Muscat' }, title: 'Municipal update' }, 0.82],
  ])('retains explicit local story evidence', (story, expected) => {
    expect(getLocationRelevanceScore(story)).toBe(expected);
  });

  it('retains explicit world evidence despite an India acquisition lane', () => {
    const score = getLocationRelevanceScore({
      title: 'Diplomats discuss an international ceasefire',
      sourceSection: 'india',
    });

    expect(score).toBe(0.66);
  });
});
