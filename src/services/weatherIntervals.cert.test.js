import { describe, expect, it } from 'vitest';
import { buildWeatherIntervals } from './weatherIntervals.js';
const slots = Array.from({length:12},(_,i)=>({
  localTime:'2026-11-'+(i<5?'21T'+String(19+i).padStart(2,'0'):'22T'+String(i-5).padStart(2,'0'))+':00',
  temp:30-i, precip:i===0?.2:.1, prob:5+i, iconId:'day_clear'
}));
describe('Weather 2h/4h interval data fidelity',()=>{
  it('only accepts 2h or 4h and sums matching hourly rain',()=>{
    expect(buildWeatherIntervals({hourly24:slots},2)[0]).toMatchObject({rainMm:0.3,rainProbability:6});
    expect(buildWeatherIntervals({hourly24:slots},4)[0]).toMatchObject({rainMm:0.5,rainProbability:8});
    expect(()=>buildWeatherIntervals({hourly24:slots},3)).toThrow();
  });
  it('does not turn missing rain and probability into zero',()=>{
    const p={hourly24:[{...slots[0],precip:null,prob:null},slots[1]]};
    expect(buildWeatherIntervals(p,2)[0]).toMatchObject({rainMm:null,rainProbability:null});
  });
  it('rejects gaps, missing times and incomplete periods',()=>{
    expect(buildWeatherIntervals({hourly24:[slots[0],{...slots[1],localTime:'2026-11-21T23:00'}]},2)[0].complete).toBe(false);
    expect(buildWeatherIntervals({hourly24:[{temp:28},{temp:27}]},2)[0].rainMm).toBe(null);
    expect(buildWeatherIntervals({hourly24:[slots[0]]},2)).toEqual([]);
  });
});
