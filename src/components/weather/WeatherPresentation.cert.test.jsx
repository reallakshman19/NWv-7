// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import WeatherSourceStatus from './WeatherSourceStatus.jsx';
import { classifyWeatherSource, getWeatherSourceCoverage } from './weatherSourceHealth.js';
import WeatherCityStrip from './WeatherCityStrip.jsx';
import WeatherHourIntervals from './WeatherHourIntervals.jsx';

afterEach(cleanup);
const now = Date.now();
const makeCity = (patch = {}) => ({
  name:'Muscat', timezone:'Asia/Muscat', sourceMode:'live', fetchedAt:now-60000,
  current:{temp:31,iconId:'day_clear',condition:'Clear'},
  models:{successful:['ecmwf','gfs'],count:2,metricCoverage:{temperature:2,rain:1,rainProbability:2,humidity:2,wind:2}},
  hourly24:Array.from({length:24},()=>({modelCoverage:{temperature:2,rain:1,rainProbability:2,humidity:2,wind:2}})),
  ...patch,
});
describe('Weather UI presentation trust and compactness',()=>{
  it('classifies partial rainfall and cache without assuming all feeds contribute',()=>{
    expect(classifyWeatherSource(makeCity(),now)).toBe('limited');
    expect(classifyWeatherSource(makeCity({sourceMode:'cache'}),now)).toBe('cached');
    expect(classifyWeatherSource(makeCity({fetchedAt:now-5*3600000}),now)).toBe('stale');
    expect(classifyWeatherSource(makeCity({current:{temp:null}}),now)).toBe('unavailable');
    const complete={temperature:3,rain:3,rainProbability:3,humidity:3,wind:3};
    const allValid=makeCity({models:{successful:['ecmwf','gfs','icon'],metricCoverage:complete},
      hourly24:Array.from({length:24},()=>({modelCoverage:complete}))});
    expect(classifyWeatherSource(allValid,now)).toBe('healthy');
    expect(classifyWeatherSource({...allValid,models:{...allValid.models,metricCoverage:{...complete,humidity:0}}},now)).toBe('limited');
    expect(classifyWeatherSource({...allValid,hourly24:allValid.hourly24.map((s,i)=>i===23?{modelCoverage:{...complete,rain:0}}:s)},now)).toBe('limited');
    expect(classifyWeatherSource({...allValid,hourly24:allValid.hourly24.slice(0,4)},now)).toBe('limited');
    expect(getWeatherSourceCoverage(allValid).metrics.wind).toBe(3);
  });
  it('exposes provenance only after tapping the SVG health icon',()=>{
    render(<WeatherSourceStatus cityData={makeCity()} />);
    const button=screen.getByRole('button',{name:/Forecast source coverage incomplete/});
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(/Next 24h coverage/)).toBeNull();
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Rainfall')).toBeTruthy();
    expect(screen.getByText('Next 24h coverage: 24 hourly slots')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Close data source details'}));
    expect(screen.queryByText(/Next 24h coverage/)).toBeNull();
  });
  it('shows name, SVG weather symbol and temperature, not model counts or cache labels, on city chips',()=>{
    render(<WeatherCityStrip cities={['chennai','muscat']} activeCity="muscat"
      weatherData={{chennai:makeCity({current:{temp:29}}),muscat:makeCity({sourceMode:'cache'})}} />);
    const nav=screen.getByRole('navigation',{name:'Weather cities'});
    expect(nav.textContent).toContain('Muscat');
    expect(nav.textContent).toContain('31°');
    expect(nav.textContent).not.toMatch(/cached|snapshot|source unverified|2\/3|model feeds/i);
    expect(nav.querySelectorAll('svg').length).toBeGreaterThanOrEqual(2);
    expect(nav.querySelector('[aria-current="true"]')?.textContent).toContain('Muscat');
  });
  it('uses a neutral unavailable SVG instead of showing cloudy weather for a city with no forecast',()=>{
    const {container}=render(<WeatherCityStrip cities={['muscat']} activeCity="muscat"
      weatherData={{muscat:{current:{temp:null}}}}/>);
    expect(container.querySelector('[data-weather-unavailable-icon]')).not.toBeNull();
    expect(container.querySelector('.wcs-chip__reading strong')?.textContent).toBe('—');
  });
  it('keeps only 2h/4h controls and no technical diagnostics in the forecast',()=>{
    render(<WeatherHourIntervals cityData={makeCity()} compact />);
    expect(screen.getByRole('button',{name:'2h'}).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button',{name:'4h'}));
    expect(screen.getByRole('button',{name:'4h'}).getAttribute('aria-pressed')).toBe('true');
    const section=document.querySelector('[data-weather-hour-intervals]');
    expect(section.textContent).not.toMatch(/cached|snapshot|source unverified|2\/3|model feeds/i);
    expect(section.textContent).toContain('peak hourly rain chance');
  });
});
