// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import WeeklyWeatherForecast from './WeeklyWeatherForecast.jsx';

afterEach(cleanup);
const forecast = Array.from({length:7},(_,i)=>({
  date:'2026-11-'+String(22+i).padStart(2,'0'),
  dayLabel:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][i],
  high:30,low:24,condition:'Partly cloudy',weatherCode:2,
  precipProb:40,precipSum:1.4,realFeelDay:33,humidityDay:65,uvIndex:6,windKph:20,
}));
describe('Weekly weather compact presentation',()=>{
  it('renders one compact day row per date and starts with hidden secondary metrics',()=>{
    const {container}=render(<WeeklyWeatherForecast forecast={forecast} cityName="Muscat"/>);
    const days=container.querySelectorAll('.wwf-row');
    expect(days).toHaveLength(7);
    expect(container.querySelectorAll('.wwf-row-primary')).toHaveLength(7);
    expect(container.querySelectorAll('.wwf-row-mobile-details')).toHaveLength(7);
    expect(container.querySelectorAll('.wwf-row-mobile-details[open]')).toHaveLength(0);
    expect(container.querySelector('.wwf-city')).toBeNull();
    expect(days[0].textContent).toContain('Rain');
    expect(days[0].textContent).toContain('Humidity');
  });
  it('reveals additional metrics through accessible native disclosure and supports collapsing',()=>{
    render(<WeeklyWeatherForecast forecast={forecast} />);
    const details=screen.getByLabelText('Additional forecast details for Sun');
    expect(details.closest('details').open).toBe(false);
    fireEvent.click(details);
    expect(details.closest('details').open).toBe(true);
    fireEvent.click(details);
    expect(details.closest('details').open).toBe(false);
  });
});
