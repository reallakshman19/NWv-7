// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import WeatherSourceStatus from './WeatherSourceStatus.jsx';
import { classifyWeatherSource } from './weatherSourceHealth.js';
import WeatherCityStrip from './WeatherCityStrip.jsx';
import WeatherHourIntervals from './WeatherHourIntervals.jsx';

afterEach(cleanup);
const now = Date.now();
const makeCity = (patch = {}) => ({
  name:'Muscat', timezone:'Asia/Muscat', sourceMode:'live', fetchedAt:now-60000,
  current:{temp:31,iconId:'day_clear',condition:'Clear'},
  models:{successful:['ecmwf','gfs'],count:2,metricCoverage:{rain:1,rainProbability:2}},
  ...patch,
});
describe('Weather UI presentation trust and compactness',()=>{
  it('classifies partial rainfall and cache without assuming all feeds contribute',()=>{
    expect(classifyWeatherSource(makeCity(),now)).toBe('limited');
    expect(classifyWeatherSource(makeCity({sourceMode:'cache'}),now)).toBe('cached');
    expect(classifyWeatherSource(makeCity({fetchedAt:now-5*3600000}),now)).toBe('stale');
    expect(classifyWeatherSource(makeCity({current:{temp:null}}),now)).toBe('unavailable');
    expect(classifyWeatherSource(makeCity({models:{successful:['ecmwf','gfs','icon'],metricCoverage:{rain:3,rainProbability:3}}}),now)).toBe('healthy');
  });
  it('exposes provenance only after tapping the SVG health icon',()=>{
    render(<WeatherSourceStatus cityData={makeCity()} />);
    const button=screen.getByRole('button',{name:/Weather sources partially available/});
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(/Rain contributors/)).toBeNull();
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(/Rain contributors: 1 of 3/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Close data source details'}));
    expect(screen.queryByText(/Rain contributors/)).toBeNull();
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
