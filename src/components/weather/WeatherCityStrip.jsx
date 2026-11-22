import React from 'react';
import WeatherIcon from '../WeatherIcons.jsx';
import { getWeatherLocationLabel } from '../../services/weatherLocations.js';
import './WeatherCityStrip.css';

/** Compact city selection. Technical source diagnostics appear only in the active city's health icon. */
export default function WeatherCityStrip({ cities = [], weatherData = {}, activeCity, onSelect, compact = false }) {
  return <nav className={'weather-city-strip' + (compact ? ' weather-city-strip--compact' : '')}
    aria-label="Weather cities" data-weather-city-strip>
    {cities.map(city => {
      const current = weatherData?.[city]?.current;
      const missing = current?.temp == null;
      const name = getWeatherLocationLabel(city);
      return <button key={city} type="button"
        className={'wcs-chip' + (activeCity === city ? ' wcs-chip--active' : '') + (missing ? ' wcs-chip--missing' : '')}
        aria-label={'Select ' + name + ' weather' + (missing ? ', data unavailable' : '')}
        aria-current={activeCity === city ? 'true' : undefined}
        onClick={() => onSelect?.(city)}>
        <span className="wcs-chip__name">{name}</span>
        <span className="wcs-chip__reading">
          {missing ? <svg data-weather-unavailable-icon viewBox="0 0 24 24" width={compact ? 17 : 19} height={compact ? 17 : 19}
            fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9"/><path d="M8 8l8 8m0-8-8 8"/>
          </svg> : <WeatherIcon id={current.iconId || 'day_cloudy'} size={compact ? 17 : 19}/>}

          <strong>{missing ? '—' : Math.round(current.temp) + '°'}</strong>
        </span>
      </button>;
    })}
  </nav>;
}
