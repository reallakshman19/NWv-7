// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mock=vi.hoisted(()=>({settings:{},version:0,save:vi.fn(),trigger:null}));
vi.mock('../utils/storage',()=>({getSettings:()=>mock.settings}));
vi.mock('../context/SettingsContext',()=>({
  useSettings:()=>({
    settings:mock.settings,settingsVersion:mock.version,
    updateSettings:next=>{
      mock.settings=next;mock.version+=1;mock.save(next);mock.trigger?.();return true;
    },
  }),
}));
vi.mock('../services/weatherService',()=>({
  fetchWeather:vi.fn(async(city)=>({
    name:city,sourceMode:'live',fetchedAt:Date.now(),timezone:'Asia/Muscat',
    models:{successful:['ecmwf','gfs','icon'],count:3,metricCoverage:{rain:3,rainProbability:3}},
    current:{temp:29,condition:'Clear',iconId:'day_clear',feelsLike:30},
  })),
}));
import { WeatherProvider, useWeather } from '../context/WeatherContext.jsx';
import QuickWeather from './QuickWeather.jsx';

function Probe(){const {activeCity}=useWeather();return <output data-testid="selected-city">{activeCity}</output>;}
function Harness(){
  const [,tick]=useState(0);
  mock.trigger=()=>tick(v=>v+1);
  return <WeatherProvider lazy><QuickWeather/><Probe/></WeatherProvider>;
}
beforeEach(()=>{
  window.localStorage.clear();
  mock.settings={weather:{cities:['chennai','trichy','muscat'],activeCity:'chennai'},
    travelLocation:{city:'colombo',enabled:true,prioritizeStories:true}};
  mock.version=0;mock.save.mockClear();mock.trigger=null;
});
afterEach(()=>{cleanup();mock.trigger=null;});
describe('Quick Weather → shared city selection and saved Local News authority',()=>{
  it('click changes reactive weather city and saved news city but preserves manual travel city',async()=>{
    render(<Harness/>);
    fireEvent.click(screen.getByRole('button',{name:/Muscat/}));
    await waitFor(()=>expect(mock.settings.weather.activeCity).toBe('muscat'));
    expect(screen.getByTestId('selected-city').textContent).toBe('muscat');
    expect(mock.settings.travelLocation.city).toBe('colombo');
    expect(window.localStorage.getItem('weather_active_city')).toBe('muscat');
  });
  it('uses native accessible buttons for city selection',async()=>{
    render(<Harness/>);
    const city=screen.getByRole('button',{name:/Trichy/});
    expect(city.tagName).toBe('BUTTON');
    fireEvent.click(city);
    await waitFor(()=>expect(mock.settings.weather.activeCity).toBe('trichy'));
    expect(city.getAttribute('aria-current')).toBe('true');
  });
  it('migrates the previous saved weather selection into settings',async()=>{
    mock.settings.weather.activeCity=undefined;
    window.localStorage.setItem('weather_active_city','muscat');
    render(<Harness/>);
    await waitFor(()=>expect(mock.settings.weather.activeCity).toBe('muscat'));
    expect(screen.getByTestId('selected-city').textContent).toBe('muscat');
    expect(mock.settings.travelLocation.city).toBe('colombo');
  });
});
