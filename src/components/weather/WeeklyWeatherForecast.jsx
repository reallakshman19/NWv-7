import React from 'react';
import WeatherIcon from '../WeatherIcons.jsx';
import { getWeatherIconId } from '../../utils/weatherUtils.js';
import {
  formatRainPair, getWeatherCityRows, normalizeForecastRows,
} from '../../services/weatherDataAdapters.js';
import './WeeklyWeatherForecast.css';

function uvLabel(uv) {
  if (uv == null) return '—';
  if (uv >= 11) return 'Extreme';
  if (uv >= 8) return 'Very high';
  if (uv >= 6) return 'High';
  if (uv >= 3) return 'Moderate';
  return 'Low';
}

function AdditionalMetrics({ day }) {
  return <>
    <div className="wwf-metric"><span>Feels</span>
      <strong>{day.realFeelDay != null ? day.realFeelDay + '°' : '—'}</strong></div>
    <div className="wwf-metric"><span>Humidity</span>
      <strong>{day.humidityDay != null ? day.humidityDay + '%' : '—'}</strong></div>
    <div className="wwf-metric"><span>UV / Wind</span>
      <strong>{uvLabel(day.uvIndex)}{day.windKph != null ? ' · ' + day.windKph + 'km/h' : ''}</strong></div>
  </>;
}
function renderForecastRows(forecast) {
  return normalizeForecastRows(forecast).map((day, index) => {
    const name = day.dayLabel || day.label || day.date || 'Day';
    return <article key={day.date || day.label || index} className={'wwf-row' + (index===0 ? ' wwf-row--today':'')}>
      <div className="wwf-row-primary">
        <div className="wwf-main">
          <span className="wwf-day">{name}</span>
          <span className="wwf-condition">
            <span className="wwf-icon"><WeatherIcon id={getWeatherIconId(day.weatherCode ?? 3, 12)} size={22}/></span>
            {day.condition || 'Forecast'}
          </span>
        </div>
        <div className="wwf-temp">
          <strong>{day.high != null ? day.high + '°' : '—'}</strong>
          <span>{day.low != null ? day.low + '°' : '—'}</span>
        </div>
        <div className="wwf-metric wwf-metric--rain">
          <span>Rain</span><strong>{formatRainPair(day)}</strong>
        </div>
      </div>
      <div className="wwf-row-desktop-metrics"><AdditionalMetrics day={day}/></div>
      <details className="wwf-row-mobile-details">
        <summary aria-label={'Additional forecast details for ' + name}>
          Details
          <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor"
            strokeWidth="2" fill="none" strokeLinecap="round"><path d="m6 9 6 6 6-6"/></svg>
        </summary>
        <div className="wwf-row-mobile-metrics"><AdditionalMetrics day={day}/></div>
      </details>
    </article>;
  });
}
function ForecastCard({ forecast, cityName }) {
  const rows = normalizeForecastRows(forecast);
  if (rows.length === 0) return null;
  return <section className="wwf-card" data-weekly-weather-forecast="available">
    <div className="wwf-header">
      <div><span className="wwf-eyebrow">Weekly forecast</span><h3>7-day outlook</h3></div>
      {cityName && <span className="wwf-city">{cityName}</span>}
    </div>
    <div className="wwf-rows">{renderForecastRows(rows)}</div>
  </section>;
}

/** Accepts both a selected city forecast and the legacy city collection route. */
export default function WeeklyWeatherForecast({
  forecast = null, cityName = '', weatherData = null, settings = null, cities = null,
}) {
  if (Array.isArray(forecast)) return <ForecastCard forecast={forecast} cityName={cityName}/>;
  const cityRows = getWeatherCityRows({
    weatherData:weatherData || {},settings:settings || {},cities,
  }).filter(row => row.forecast.length>0);
  if (cityRows.length===0) return <section className="wwf-card wwf-card--empty" data-weekly-weather-forecast="empty">
    <div className="wwf-header"><div><span className="wwf-eyebrow">Weekly forecast</span>
      <h3>7-day outlook</h3></div></div>
    <p className="wwf-empty">Weekly forecast is updating.</p>
  </section>;
  return <div className="wwf-stack" data-weekly-weather-forecast="stack">
    {cityRows.map(row => <ForecastCard key={row.city} forecast={row.forecast} cityName={row.cityName}/>)}
  </div>;
}
