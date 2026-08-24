import { describe, expect, it } from 'vitest';
import {
  classifyDigestQuality,
  observedQualityEvidence,
  unavailableQualityEvidence,
} from './qualityClassifier.js';

describe('Daily Digest quality classifier', () => {
  it('classifies a broad public-affairs digest as high, broad and diverse', () => {
    const quality = classifyDigestQuality(observedQualityEvidence([
      'Supreme Court issues verdict on a constitutional petition',
      'RBI reviews inflation and banking conditions',
      'Cabinet approves a new national infrastructure policy',
      'Army reviews border security after ceasefire talks',
      'China and India hold a bilateral foreign ministers summit',
      'ISRO launches a new earth observation satellite',
    ], 'TEST'));
    expect(quality.significanceClass).toBe('HIGH');
    expect(quality.breadthClass).toBe('BROAD');
    expect(quality.diversityClass).toBe('DIVERSE');
    expect(quality.qualityIntegrityClass).toBe('SUFFICIENT');
  });

  it('classifies a concentrated sports digest as low, narrow and concentrated', () => {
    const quality = classifyDigestQuality(observedQualityEvidence([
      'India wins the cricket series opener',
      'Cricket captain discusses the next test match',
      'Domestic cricket league announces the final fixtures',
      'Cricket selectors name a revised squad',
      'Cricket board confirms a new tournament venue',
      'Young cricket bowler takes five wickets',
    ], 'TEST'));
    expect(quality.significanceClass).toBe('LOW');
    expect(quality.breadthClass).toBe('NARROW');
    expect(quality.diversityClass).toBe('CONCENTRATED');
    expect(quality.qualityDominantTopicShareBps).toBe(10000);
  });

  it('fails neutral when the publisher content surface is unavailable or too limited', () => {
    const unavailable = classifyDigestQuality(unavailableQualityEvidence('NOT_QUALIFIED'));
    const limited = classifyDigestQuality(observedQualityEvidence([
      'RBI reviews inflation',
      'Supreme Court hears a petition',
    ], 'TEST'));
    for (const quality of [unavailable, limited]) {
      expect(quality.significanceClass).toBe('ADEQUATE');
      expect(quality.breadthClass).toBe('ADEQUATE');
      expect(quality.diversityClass).toBe('MODERATE');
    }
    expect(unavailable.qualityIntegrityClass).toBe('UNAVAILABLE');
    expect(limited.qualityIntegrityClass).toBe('LIMITED');
  });
});
