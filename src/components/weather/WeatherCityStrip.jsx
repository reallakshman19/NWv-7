import React from 'react';
import WeatherIcon from '../WeatherIcons.jsx';
import { getWeatherLocationLabel } from '../../services/weatherLocations.js';
import './WeatherCityStrip.css';

export default function WeatherCityStrip({ cities = [], weatherData = {}, activeCity, onSelect, compact = false }) {
  return <nav className={'weather-city-strip' + (compact ? ' weather-city-strip--compact' : '')} aria-label="Weather cities" data-weather-city-strip>
    {cities.map(city => {
      const data = weatherData?.[city], current = data?.current;
      const missing = current?.temp == null;
      const mode = data?.sourceMode || 'unknown';
      const known = (data?.models?.successful || []).filter(model => ['ecmwf','gfs','icon'].includes(model));
      const count = known.length;
      const rainCoverage = data?.models?.metricCoverage?.rain;
      const probabilityCoverage = data?.models?.metricCoverage?.rainProbability;
      const metricHealthy = rainCoverage === 3 && probabilityCoverage === 3;
      const health = missing ? 'unavailable' : mode === 'cache' ? 'cached' : mode === 'snapshot' ? 'snapshot' : (count === 3 && metricHealthy) ? 'healthy' : count > 0 ? 'degraded' : 'unverified';
      const healthTitle = health === 'healthy' ? 'Three models supply rainfall and rain probability' : health === 'degraded' ? count + '/3 model feeds; rain ' + (rainCoverage ?? 'unknown') + '/3, chance ' + (probabilityCoverage ?? 'unknown') + '/3' : health === 'cached' ? 'Cached weather data' : health === 'snapshot' ? 'Fallback weather snapshot' : health === 'unavailable' ? 'City forecast unavailable' : 'Weather source unverified';
      return <button key={city} type="button" className={'qw-city-row' + (activeCity === city ? ' qw-city-row--active' : '') + (missing ? ' qw-city-row--missing' : '')} aria-current={activeCity === city ? 'true' : undefined} onClick={() => onSelect?.(city)}>
        <span className="wcs-name">{getWeatherLocationLabel(city)}
          <svg className={'wcs-health wcs-health--' + health} viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" role="img" aria-label={healthTitle}>
            <title>{healthTitle}</title>
            <path d="M12 2 20 6v5c0 5-3.4 8.5-8 11C7.4 19.5 4 16 4 11V6l8-4Z"/>
            {health === 'healthy' ? <path d="m8.5 12 2.5 2.5 4.5-5"/> : health === 'unavailable' ? <path d="m9 10 6 6m0-6-6 6"/> : <path d="M12 8v5m0 3v.01"/>}
          </svg>
        </span>
        <span className="wcs-reading"><WeatherIcon id={current?.iconId || 'day_cloudy'} size={24}/><strong>{missing ? '—' : current.temp + '°'}</strong></span>
        <span className="wcs-foot">{missing ? 'No forecast' : mode === 'cache' ? 'Cached' : mode === 'snapshot' ? 'Snapshot' : count ? count + '/3 feeds · rain ' + (rainCoverage ?? '—') + '/3' : 'Source unverified'}</span>
      </button>;
    })}
  </nav>;
}
