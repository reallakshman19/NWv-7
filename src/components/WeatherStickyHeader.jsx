import React from 'react';
import WeatherIcon from './WeatherIcons.jsx';
import WeatherSourceStatus from './weather/WeatherSourceStatus.jsx';
import { getWeatherLocationLabel } from '../services/weatherLocations.js';
import './weather/WeatherFocusHeader.css';

/** One compact current-city summary. Source diagnostics appear on an icon tap only. */
export default function WeatherStickyHeader({ weatherData = {}, activeCity, onRefresh, loading }) {
  const cityData = weatherData?.[activeCity];
  const current = cityData?.current;
  return <header className="weather-focus-header" data-weather-focus-header>
    <div className="wfh-current">
      <div className="wfh-city">{getWeatherLocationLabel(activeCity || '')}</div>
      <div className="wfh-reading">
        <WeatherIcon id={current?.iconId || 'day_cloudy'} size={27}/>
        <strong>{current?.temp == null ? '—' : Math.round(current.temp) + '°'}</strong>
        <span>{current?.condition || 'Forecast unavailable'}</span>
      </div>
    </div>
    <div className="wfh-actions">
      <WeatherSourceStatus cityData={cityData}/>
      <button className={'wfh-refresh' + (loading ? ' is-loading' : '')} type="button"
        aria-label="Refresh weather forecast" title="Refresh forecast" onClick={onRefresh} disabled={loading}>
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 11a8 8 0 1 0-2 6M20 4v7h-7"/>
        </svg>
      </button>
    </div>
  </header>;
}
