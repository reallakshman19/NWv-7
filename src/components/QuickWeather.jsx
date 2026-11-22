import React, { useEffect, useMemo } from 'react';
import { useWeather } from '../context/WeatherContext';
import { useSettings } from '../context/SettingsContext';
import WeatherIcon from './WeatherIcons';
import WeatherHourIntervals from './weather/WeatherHourIntervals.jsx';
import WeatherCityStrip from './weather/WeatherCityStrip.jsx';
import WeatherSourceStatus from './weather/WeatherSourceStatus.jsx';
import { getConfiguredWeatherCities } from '../services/weatherLocations.js';
import './QuickWeatherRefined.css';
import './weather/WeatherCitywise.css';

export default function QuickWeather() {
  const { weatherData, loading, ensureBoot, booted, activeCity, setActiveCity } = useWeather();
  const { settings } = useSettings();
  const cities = useMemo(() => getConfiguredWeatherCities(settings), [settings]);
  useEffect(() => { ensureBoot?.(); }, [ensureBoot]);
  const cityData = weatherData?.[activeCity], current = cityData?.current;
  return <section className="quick-weather-card" data-quick-weather>
    <div className="qw-config-bar">
      <strong className="qw-config-title">Quick Weather</strong>
      <div className="qw-config-actions">
        <WeatherSourceStatus cityData={cityData} compact />
        <a className="qw-config-add-btn" href="#/weather" aria-label="Manage weather cities">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
        Manage cities
        </a>
      </div>
    </div>
    <WeatherCityStrip cities={cities} weatherData={weatherData || {}} activeCity={activeCity} onSelect={setActiveCity} compact />
    {current ? <div className="qw-highlight-text-container">
      <div className="qw-current-summary">
        <WeatherIcon id={current.iconId || 'day_cloudy'} size={27}/>
        <div><strong>{current.temp == null ? '—' : Math.round(current.temp) + '°C'}</strong><span>{current.condition || 'Forecast'} · Feels {current.feelsLike ?? '—'}°</span></div>
      </div>
      <WeatherHourIntervals cityData={cityData} compact />
    </div> : <p className="qw-empty">{!booted || loading ? 'Loading forecast…' : 'No forecast for selected city. Open Weather to retry.'}</p>}
  </section>;
}
