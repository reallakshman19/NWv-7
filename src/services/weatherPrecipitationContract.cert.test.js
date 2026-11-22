import { describe, expect, it } from 'vitest';
import {
  averagePrecipitation,
  averagePrecipitationProbability,
  weightedAverageMetric,
} from '../utils/multiModelUtils.js';
import {
  buildPrecipitationReconciliation,
  summarizePeriodRain,
} from './weatherService.js';

describe('Weather precipitation contract', () => {
  it('preserves model identity so ECMWF/ICON/GFS weights actually apply', () => {
    const models = [
      { modelName: 'ecmwf', precipitation_probability: 100, precipitation: 3 },
      { modelName: 'icon', precipitation_probability: 50, precipitation: 1 },
      { modelName: 'gfs', precipitation_probability: 0, precipitation: 0 },
    ];

    expect(averagePrecipitationProbability(models)).toBe(57);
    expect(averagePrecipitation(models)).toBe(1.5);
    expect(weightedAverageMetric(models, 'precipitation_probability', { round: true })).toBe(57);
  });

  it('uses peak hourly consensus as the displayed period rain chance', () => {
    const summary = summarizePeriodRain([
      { prob: 20, precip: 0.2 },
      { prob: 35, precip: 0.3 },
      { prob: 30, precip: 1.0 },
    ]);

    expect(summary.peak).toBe(35);
    expect(summary.mean).toBe(28);
    expect(summary.totalMm).toBe(1.5);
    expect(summary.semantics).toBe('period_peak_hourly_consensus');
  });

  it('does not fabricate dry weather from unknown or incomplete hourly readings', () => {
    expect(summarizePeriodRain([{prob:null,precip:null},{prob:45,precip:2}])).toMatchObject({peak:null,totalMm:null});
    expect(summarizePeriodRain([],2)).toMatchObject({peak:null,totalMm:null});
    expect(summarizePeriodRain([{prob:20,precip:0.2}],2)).toMatchObject({peak:null,totalMm:null});
    expect(buildPrecipitationReconciliation(null,0)).toBeNull();
    expect(buildPrecipitationReconciliation(0,null)).toBeNull();
  });

  it('flags large daily-vs-hourly precipitation mismatches without hiding them', () => {
    const mismatch = buildPrecipitationReconciliation(26.6, 2.1);
    expect(mismatch.withinTolerance).toBe(false);
    expect(mismatch.deltaMm).toBe(24.5);

    const reconciled = buildPrecipitationReconciliation(26.6, 25.1);
    expect(reconciled.withinTolerance).toBe(true);
  });
});
