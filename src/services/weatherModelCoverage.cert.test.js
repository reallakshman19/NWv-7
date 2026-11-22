import { describe, it, expect } from 'vitest';
import { __processMultiModelDataForTest } from './weatherService.js';
function fixture(rain, probability) {
  const day = '2026-11-22';
  const time=Array.from({length:24},(_,i)=>day+'T'+String(i).padStart(2,'0')+':00');
  return {
    timezone:'Asia/Muscat',
    current:{time:time[6],temperature_2m:30,apparent_temperature:31,weather_code:0,relative_humidity_2m:60,wind_speed_10m:10},
    hourly:{time,temperature_2m:time.map(()=>30),apparent_temperature:time.map(()=>31),weather_code:time.map(()=>0),
      precipitation:time.map(()=>rain),precipitation_probability:time.map(()=>probability),
      relative_humidity_2m:time.map(()=>60),wind_speed_10m:time.map(()=>10)},
    daily:{time:[day],temperature_2m_max:[33],temperature_2m_min:[24],precipitation_sum:[rain],
      precipitation_probability_max:[probability],weather_code:[0]},
  };
}
describe('Metric-specific model availability',()=>{
  it('labels a 3/3 HTTP success with only one valid rain provider as degraded',()=>{
    const m={ecmwf:fixture(null,null),gfs:fixture(2.4,65),icon:fixture(null,null)};
    const v=__processMultiModelDataForTest(m,'muscat');
    expect(v.models.count).toBe(3);
    expect(v.models.metricCoverage.rain).toBe(1);
    expect(v.models.metricCoverage.rainProbability).toBe(1);
    expect(v.hourly24[0].precip).toBe(2.4);
    expect(v.hourly24[0].prob).toBe(65);
  });
  it('does not turn three missing rain values into a dry forecast',()=>{
    const m={ecmwf:fixture(null,null),gfs:fixture(null,null),icon:fixture(null,null)};
    const v=__processMultiModelDataForTest(m,'muscat');
    expect(v.models.metricCoverage.rain).toBe(0);
    expect(v.hourly24[0].precip).toBeNull();
    expect(v.hourly24[0].prob).toBeNull();
  });
  it('continues with one live model after two provider failures',()=>{
    const v=__processMultiModelDataForTest({ecmwf:null,gfs:fixture(1.2,40),icon:null},'muscat');
    expect(v.models.count).toBe(1);
    expect(v.models.metricCoverage.rain).toBe(1);
    expect(v.hourly24[0].precip).toBe(1.2);
  });
});
