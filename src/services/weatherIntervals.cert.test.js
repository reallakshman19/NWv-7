import { describe, expect, it } from 'vitest';
import { buildWeatherIntervals } from './weatherIntervals.js';
// UTC 15:30 is Muscat 19:30. Slots span local midnight.
const NOW = Date.parse('2026-11-21T15:30:00Z');
const slots = Array.from({ length: 12 }, (_, i) => ({
  localTime: '2026-11-' + (i < 5 ? '21T' + String(19 + i).padStart(2,'0') : '22T' + String(i - 5).padStart(2,'0')) + ':00',
  temp: 30-i, precip: i===0 ? .2 : .1, prob: 5+i, iconId: 'day_clear',
}));
const city = patch => ({ fetchedAt: NOW - 20*60*1000, timezone:'Asia/Muscat', hourly24:slots, ...patch });
describe('Weather next 2h/4h interval fidelity', () => {
  it('aggregates ONLY the next 2 or 4 city-local hours', () => {
    expect(buildWeatherIntervals(city(),2,4,NOW)[0]).toMatchObject({rainMm:.3,rainProbability:6,localTime:'2026-11-21T19:00'});
    expect(buildWeatherIntervals(city(),4,4,NOW)[0]).toMatchObject({rainMm:.5,rainProbability:8});
    expect(() => buildWeatherIntervals(city(),3,4,NOW)).toThrow();
  });
  it('retains missing rainfall as unknown, not dry weather', () => {
    const weather=city({hourly24:[{...slots[0],precip:null,prob:null},slots[1]]});
    expect(buildWeatherIntervals(weather,2,4,NOW)[0]).toMatchObject({rainMm:null,rainProbability:null});
  });
  it('rejects gaps and incomplete windows', () => {
    expect(buildWeatherIntervals(city({hourly24:[slots[0],{...slots[1],localTime:'2026-11-21T23:00'}]}),2,4,NOW)[0].complete).toBe(false);
    expect(buildWeatherIntervals(city({hourly24:[slots[0]]}),2,4,NOW)).toEqual([]);
  });
  it('rejects old/historical and future-dated data even when consecutive', () => {
    const oldNow=NOW+30*60*60*1000;
    expect(buildWeatherIntervals(city(),2,4,oldNow)).toEqual([]);
    expect(buildWeatherIntervals(city({fetchedAt:NOW-5*60*60*1000}),2,4,NOW)).toEqual([]);
    expect(buildWeatherIntervals(city({fetchedAt:NOW+10*60*1000}),2,4,NOW)).toEqual([]);
    expect(buildWeatherIntervals(city({timezone:'Invalid/Timezone'}),2,4,NOW)).toEqual([]);
  });
  it('skips expired hours within an otherwise recent cached payload', () => {
    const threeHoursLater=NOW+3*60*60*1000;
    const forecast=city({fetchedAt:NOW});
    expect(buildWeatherIntervals(forecast,2,4,threeHoursLater)[0].localTime).toBe('2026-11-21T22:00');
  });
});
