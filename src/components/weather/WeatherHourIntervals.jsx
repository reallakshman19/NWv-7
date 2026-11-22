import React, { useMemo, useState } from 'react';
import WeatherIcon from '../WeatherIcons.jsx';
import { buildWeatherIntervals } from '../../services/weatherIntervals.js';
import './WeatherHourIntervals.css';

/** Dense city-local short-range timeline, with provenance accessible separately on demand. */
export default function WeatherHourIntervals({ cityData, compact = false }) {
  const [hours, setHours] = useState(2);
  const periods = useMemo(() => buildWeatherIntervals(cityData, hours, compact ? 4 : 6), [cityData, hours, compact]);
  return <section className={'weather-hour-intervals' + (compact ? ' weather-hour-intervals--compact' : '')} data-weather-hour-intervals>
    <header className="whi-header">
      <div className="whi-title"><strong>Next hours</strong><span>City time</span></div>
      <div className="whi-switch" role="group" aria-label="Forecast interval">
        {[2,4].map(n => <button type="button" key={n} aria-pressed={hours === n} onClick={() => setHours(n)}>{n}h</button>)}
      </div>
    </header>
    {periods.length ? <div className="whi-rows">
      {periods.map(period => {
        const chance = period.rainProbability == null ? '—' : period.rainProbability + '%';
        const rain = period.rainMm == null ? '—' : period.rainMm.toFixed(1);
        const clock = period.localTime?.slice(11,16) || '';
        return <div key={period.key} className="whi-period"
          aria-label={period.label + (clock ? ' at ' + clock : '') + ', ' +
            (period.temp == null ? 'temperature unknown' : period.temp + ' degrees') +
            ', ' + hours + 'h rain ' + rain + ' mm, peak hourly rain chance ' + chance}>
          <span className="whi-period__time">{period.label}</span>
          <span className="whi-period__clock">{clock || '—'}</span>
          <WeatherIcon id={period.iconId} size={compact ? 20 : 23}/>
          <strong>{period.temp == null ? '—' : period.temp + '°'}</strong>
          <span className="whi-period__rain">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 3C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-12Z"/></svg>
            {rain}<small>mm</small><span className="whi-period__chance">{chance}</span>
          </span>
        </div>;
      })}
    </div> : <p className="whi-empty">Hourly timing unavailable. Refresh for a current forecast.</p>}
    <p className="whi-legend">Rainfall per {hours}h · % = peak hourly rain chance</p>
  </section>;
}
