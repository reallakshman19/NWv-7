import { describe, expect, it } from 'vitest';
import { getWeatherInsight } from './toplineGenerator.js';

describe('Topline weather insight', () => {
  it('does not call an overcast rain-prone day pleasant', () => {
    const result = getWeatherInsight({
      chennai: {
        current: { temp: 29, condition: 'Overcast' },
        next8Hours: [
          { prob: 20, precip: 0 },
          { prob: 25, precip: 0 },
          { prob: 30, precip: 0.2 },
        ],
        dailyRain: {
          peakProbability: 97,
          forecastTotalMm: 26.6,
        },
      },
    });

    expect(result.text).toContain('rain-prone');
    expect(result.text).not.toMatch(/pleasant day ahead/i);
  });

  it('uses near-term hourly rain risk before the daily aggregate', () => {
    const result = getWeatherInsight({
      chennai: {
        current: { temp: 29, condition: 'Overcast' },
        next8Hours: [
          { prob: 35, precip: 0.3 },
          { prob: 65, precip: 1.1 },
          { prob: 55, precip: 1.0 },
        ],
        dailyRain: {
          peakProbability: 90,
          forecastTotalMm: 12,
        },
      },
    });

    expect(result.text).toContain('Rain is likely in the next several hours.');
  });
});
