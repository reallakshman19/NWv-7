// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  getConditionText,
  getHourInTimezone,
} from './DetailedWeatherCard.jsx';

describe('DetailedWeatherCard precipitation semantics', () => {
  it('uses the selected city timezone for daypart selection', () => {
    const instant = new Date('2026-10-18T08:30:00Z');

    expect(getHourInTimezone('Asia/Kolkata', instant)).toBe(14);
    expect(getHourInTimezone('Asia/Muscat', instant)).toBe(12);
  });

  it('does not reduce a rainy period to plain Cloudy', () => {
    const text = getConditionText({
      rainMmValue: 1.5,
      rainProb: { peak: 35, mean: 30 },
      cloudCover: 90,
      windSpeed: 11,
      uvIndex: 4.6,
      hourly: [],
    });

    expect(text).toContain('Showers possible.');
    expect(text).not.toBe('Cloudy.');
  });

  it('prefers stronger rain wording when probability or accumulation is material', () => {
    expect(getConditionText({
      rainMmValue: 3.4,
      rainProb: { peak: 48 },
      cloudCover: 95,
      windSpeed: 10,
      uvIndex: 3,
    })).toContain('Rain likely.');

    expect(getConditionText({
      rainMmValue: 0.8,
      rainProb: { peak: 45 },
      condition: 'Thunderstorm',
      cloudCover: 95,
      windSpeed: 12,
      uvIndex: 2,
    })).toContain('Thunderstorms possible.');
  });
});
