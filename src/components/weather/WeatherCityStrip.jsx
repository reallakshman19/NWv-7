import React from 'react';
import WeatherIcon from '../WeatherIcons.jsx';
import { getWeatherLocationLabel } from '../../services/weatherLocations.js';
import './WeatherCityStrip.css';

export default function WeatherCityStrip({ cities = [], weatherData = {}, activeCity, onSelect, compact = false }) {
  return <nav className={'weather-city-strip' + (compact ? ' weather-city-strip--compact' : '')} aria-label="Weather cities" data-weather-city-strip>
    {cities.map(city => {
      const data = weatherData?.[city], current = data?.current;
      const missing = current?.temp == null, count = data?.models?.count;
      return <button key={city} type="button" className={'qw-city-row' + (activeCity === city ? ' qw-city-row--active' : '') + (missing ? ' qw-city-row--missing' : '')} aria-current={activeCity === city ? 'true' : undefined} onClick={() => onSelect?.(city)}>
        <span className="wcs-name">{getWeatherLocationLabel(city)}</span>
        <span className="wcs-reading"><WeatherIcon id={current?.iconId || 'day_cloudy'} size={24}/><strong>{missing ? '—' : current.temp + '°'}</strong></span>
        <span className="wcs-foot">{missing ? 'No forecast' : Number.isInteger(count) ? count + '/3 models' : 'Source unverified'}</span>
      </button>;
    })}
  </nav>;
}
