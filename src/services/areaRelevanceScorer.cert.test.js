import { describe, expect, it } from 'vitest';
import {
  applyAreaRelevance,
  scoreAreaRelevance,
} from './areaRelevanceScorer.js';

describe('area relevance scorer', () => {
  it('scores Chennai exact-area story higher than Tamil Nadu backfill', () => {
    const exact = scoreAreaRelevance({
      id: 'chennai-1',
      title: 'CMRL starts new OMR metro trial near T Nagar and Adyar',
      source: 'The Hindu Chennai',
      section: 'chennai',
    }, 'chennai');

    const backfill = scoreAreaRelevance({
      id: 'tn-1',
      title: 'Tamil Nadu announces new education policy across districts',
      source: 'Google News Tamil Nadu',
      section: 'tn',
    }, 'chennai');

    expect(exact.label).toBe('exact-area');
    expect(exact.score).toBeGreaterThan(backfill.score);
    expect(backfill.label).toBe('state-region');
    expect(backfill.reasons).toContain('state_region_backfill');
  });

  it('scores Muscat exact-area story higher than Oman-wide backfill', () => {
    const exact = scoreAreaRelevance({
      id: 'muscat-1',
      title: 'Ruwi and Muttrah traffic diversions announced by Muscat Municipality',
      source: 'Muscat Daily',
      section: 'local',
    }, 'muscat');

    const backfill = scoreAreaRelevance({
      id: 'oman-1',
      title: 'Oman announces national tourism targets for 2026',
      source: 'Times of Oman',
      section: 'local',
    }, 'muscat');

    expect(exact.label).toBe('exact-area');
    expect(exact.score).toBeGreaterThan(backfill.score);
    expect(backfill.label).toBe('country');
    expect(backfill.reasons).toContain('country_backfill');
  });

  it('labels broad Oman story as country or backfill rather than exact-area', () => {
    const result = scoreAreaRelevance({
      title: 'Oman cabinet reviews national economic plan',
      country: 'Oman',
    }, 'muscat');

    expect(['country', 'backfill']).toContain(result.label);
    expect(result.label).not.toBe('exact-area');
    expect(result.reasons).toContain('country_backfill');
  });

  it('keeps Gulf and Hormuz regional stories weak unless Oman or Muscat impact is explicit', () => {
    const weak = scoreAreaRelevance({
      title: 'Hormuz shipping alert follows Gulf regional tensions near Iran',
      source: 'Regional Wire',
    }, 'muscat');

    const explicit = scoreAreaRelevance({
      title: 'Oman monitors Hormuz shipping alert for Muscat port operations',
      source: 'Oman Observer',
    }, 'muscat');

    expect(weak.label).toBe('backfill');
    expect(weak.score).toBeLessThan(explicit.score);
    expect(explicit.label).not.toBe('weak');
    expect(explicit.matchedTerms).toEqual(expect.arrayContaining(['oman', 'muscat']));
  });

  it('recognizes Chennai aliases and civic/transport terms', () => {
    const result = scoreAreaRelevance({
      title: 'GCC and CMRL review Tambaram and OMR traffic plan',
      description: 'Velachery and Pallavaram commuters may see changes.',
    }, 'chennai');

    expect(result.label).toBe('exact-area');
    expect(result.matchedTerms).toEqual(expect.arrayContaining(['gcc', 'cmrl', 'omr', 'tambaram']));
    expect(result.reasons).toContain('exact_area_match');
  });

  it('recognizes Muscat aliases and area terms', () => {
    const result = scoreAreaRelevance({
      title: 'Ruwi, Muttrah, Seeb and Qurum road changes announced',
      description: 'Al Khuwair and Bausher routes will be affected.',
    }, 'muscat');

    expect(result.label).toBe('exact-area');
    expect(result.matchedTerms).toEqual(expect.arrayContaining(['ruwi', 'muttrah', 'seeb', 'qurum', 'al khuwair']));
  });

  it('does not mutate stories when scoring directly', () => {
    const story = Object.freeze({ title: 'Chennai airport delays reported', source: 'The Hindu Chennai' });
    const result = scoreAreaRelevance(story, 'chennai');

    expect(result.label).toBe('exact-area');
    expect(story._areaRelevance).toBeUndefined();
  });

  it('enriches and sorts deterministically through applyAreaRelevance', () => {
    const stories = [
      { id: 'weak', title: 'Global markets update' },
      { id: 'country', title: 'Oman national budget update' },
      { id: 'exact', title: 'Muttrah waterfront road closure in Muscat' },
      { id: 'city', title: 'Muscat schools announce new schedule' },
    ];

    const first = applyAreaRelevance(stories, 'muscat');
    const second = applyAreaRelevance(stories, 'muscat');

    expect(first.map(story => story.id)).toEqual(['exact', 'city', 'country', 'weak']);
    expect(second.map(story => story.id)).toEqual(first.map(story => story.id));
    expect(first[0]._areaRelevance.label).toBe('exact-area');
    expect(stories[0]._areaRelevance).toBeUndefined();
  });

  it('marks weak relevance without false local evidence', () => {
    const result = scoreAreaRelevance({
      title: 'Global technology stocks rally after US earnings',
      source: 'Market Wire',
    }, 'chennai');

    expect(result.label).toBe('weak');
    expect(result.score).toBe(0);
    expect(result.reasons).toContain('no_area_evidence');
  });
});
