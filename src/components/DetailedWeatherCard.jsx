
import React, { useState } from 'react';
import './DetailedWeatherCard.css';
import WeatherIcon from './WeatherIcons';
import { UmbrellaIcon, CloudIcon, HumidityIcon, WindIcon } from './AppIcons';

import { getHourInTimezone, getWeatherHeaderSummary, getConditionText } from './detailedWeatherCardUtils.js';

export default function DetailedWeatherCard({
  weatherData,
  activeCity,
  onActiveCityChange = null,
  cities = [],
  cityLabels = {},
  hideSidebar = false,
  hideHeader = false,
  hideSourceFooter = false,
}) {
  const [expandedCard, setExpandedCard] = useState(null);

  const safeCities = Array.isArray(cities) ? cities : [];

  const handleTravelAwareCityChange = (city) => {
    if (typeof onActiveCityChange === 'function') {
      onActiveCityChange(city);
    }
  };

  if (!weatherData) return null;

  const cityData = weatherData[activeCity];

  if (!cityData) return <div className="dw-container">Data unavailable</div>;

  const hour = getHourInTimezone(cityData.timezone, new Date());
  let segments = [];

  const getSeg = (day, period, labelOverride = null) => {
    const data = day === 'today' ? cityData[period] : cityData.tomorrow?.[period];

    let label = labelOverride;

    if (!label) {
      if (period === 'morning') label = 'Morning';
      else if (period === 'noon') label = 'Afternoon';
      else label = 'Evening';

      if (day === 'tomorrow') label = `Tomorrow ${label}`;
    }

    return {
      id: `${day}-${period}`,
      label,
      data,
    };
  };

  if (hour < 11) {
    segments = [
      getSeg('today', 'morning', 'This Morning'),
      getSeg('today', 'noon'),
      getSeg('today', 'evening'),
    ];
  } else if (hour < 17) {
    segments = [
      getSeg('today', 'noon', 'This Afternoon'),
      getSeg('today', 'evening'),
      getSeg('tomorrow', 'morning'),
    ];
  } else if (hour < 21) {
    segments = [
      getSeg('today', 'evening', 'Tonight'),
      getSeg('tomorrow', 'morning'),
      getSeg('tomorrow', 'noon'),
    ];
  } else {
    segments = [
      getSeg('tomorrow', 'morning', 'Tomorrow Morning'),
      getSeg('tomorrow', 'noon'),
      getSeg('tomorrow', 'evening'),
    ];
  }

  return (
    <div className="dw-container">
      {!hideSidebar && <div className="dw-sidebar">
        {safeCities.map(city => (
          <button
            key={city}
            className={`dw-city-tab ${city === activeCity ? 'active' : ''}`}
            onClick={() => handleTravelAwareCityChange(city)}
            aria-label={`Select ${cityLabels[city] || city}`}
          >
            <span className="dw-city-icon"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="2"/></svg></span>
            <span className="dw-city-name">{cityLabels[city] || city}</span>
          </button>
        ))}
      </div>}

      <div className="dw-content">
        {!hideHeader && <div className="dw-header">
          <div className="dw-header-main">
            <h2 className="dw-city-title">{cityData.name}</h2>
            <span className="dw-current-temp">{cityData.current?.temp}°</span>
          </div>

          <div className="dw-header-sub">
            {getWeatherHeaderSummary(cityData)}
          </div>
        </div>}

        <div className="dw-cards-list">
          {segments.map((seg, idx) => {
            if (!seg.data) return null;

            return (
              <WeatherSegmentCard
                key={seg.id}
                segment={seg}
                isExpanded={expandedCard === idx}
                onToggle={() => setExpandedCard(expandedCard === idx ? null : idx)}
              />
            );
          })}
        </div>

        {!hideSourceFooter && <div className="dw-footer">
          {cityData.models?.count
            ? `Forecast based on ${cityData.models.count} model${cityData.models.count !== 1 ? 's' : ''}: ${cityData.models.names}`
            : 'Forecast source coverage unknown'}
        </div>}
      </div>
    </div>
  );
}

function WeatherSegmentCard({ segment, isExpanded, onToggle }) {
  const { label, data } = segment;
  const hourly = Array.isArray(data.hourly) ? data.hourly : [];
  const hasHourly = hourly.length > 0;

  const explicitRain = data.rainMmValue != null ? Number(data.rainMmValue) : null;
  const parsedRain = explicitRain == null && typeof data.rainMm === 'string' ? parseFloat(data.rainMm) : null;
  const rainMmVal = Number.isFinite(explicitRain) ? explicitRain : Number.isFinite(parsedRain) ? parsedRain : null;
  const hourlyProbs = hourly.map(h => h?.prob).filter(v => v != null && Number.isFinite(Number(v))).map(Number);
  const rawProb = data.rainProb?.peak ?? data.rainProb?.avg;
  const rainProbVal = rawProb != null && Number.isFinite(Number(rawProb))
    ? Math.max(Number(rawProb), ...hourlyProbs)
    : hourlyProbs.length ? Math.max(...hourlyProbs) : null;
  const hasSignificantRain = rainMmVal != null && rainMmVal >= 1;
  const hasAnyRain = (rainMmVal != null && rainMmVal > 0) || (rainProbVal != null && rainProbVal > 0);

  let RainIcon = CloudIcon;
  let rainColor = 'var(--text-secondary)';
  let rainText = rainMmVal == null && rainProbVal == null ? 'Rain data unavailable' : 'No rain forecast for period';

  if (hasAnyRain) {
    RainIcon = hasSignificantRain ? UmbrellaIcon : CloudIcon;
    rainColor = hasSignificantRain ? '#3b82f6' : '#94a3b8';
    rainText = (rainMmVal == null ? 'Rain —' : rainMmVal.toFixed(1) + 'mm') +
      ' · Peak ' + (rainProbVal == null ? '—' : rainProbVal + '%');
  }

  const description = getConditionText(data);

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onToggle();
    }
  };

  return (
    <div
      className={`dw-card ${isExpanded ? 'expanded' : ''}`}
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded}
      aria-label={`${label}. ${hasHourly ? 'Toggle hourly forecast' : 'Hourly forecast unavailable'}`}
      onClick={onToggle}
      onKeyDown={handleKeyDown}
    >
      <div className="dw-card-header">
        <span className="dw-period-badge">{label}</span>
        <span className={`dw-expand-hint ${hasHourly ? '' : 'dw-expand-hint--disabled'}`}>
          {isExpanded ? 'Collapse hourly' : hasHourly ? 'View hourly' : 'Hourly unavailable'}
        </span>
      </div>

      <div className="dw-card-main">
        <div className="dw-main-icon">
          <WeatherIcon id={data.iconId || 'day_cloudy'} size={56} />
        </div>

        <div className="dw-main-temp">
          <div className="dw-temp-val">{data.temp}°</div>
          <div className="dw-temp-feels">Feels like {data.feelsLike}°</div>
        </div>
      </div>

      <div className="dw-details-grid">
        <div className="dw-detail-row">
          <div className="dw-detail-icon">
            <RainIcon size={20} color={rainColor} />
          </div>
          <div className="dw-detail-text">
            {rainText}
          </div>
        </div>

        <div className="dw-detail-row">
          <div className="dw-detail-icon"><HumidityIcon size={20} /></div>
          <div className="dw-detail-text">
            {data.humidity}% <span className="dw-sep">|</span> <WindIcon size={16} /> {data.windSpeed} km/h
          </div>
        </div>

        <div className="dw-detail-row">
          <div className="dw-detail-icon"><WeatherIcon id="day_clear" size={20} /></div>
          <div className="dw-detail-text">
            UV: {data.uvIndex ?? '—'} <span className="dw-sep">|</span> PM 2.5: -
          </div>
        </div>

        <div className="dw-detail-row">
          <div className="dw-detail-icon"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7v.01"/></svg></div>
          <div className="dw-detail-text dw-desc">
            {description}
          </div>
        </div>
      </div>

      {isExpanded && hasHourly && (
        <div className="dw-hourly-container hide-scrollbar" onClick={event => event.stopPropagation()}>
          {hourly.map((h, i) => (
            <div key={`${h.time || h.label || 'hour'}-${i}`} className="dw-hourly-slot">
              <span className="dw-slot-time">{h.time || h.label}</span>
              <div className="dw-slot-icon">
                <WeatherIcon id={h.iconId || 'day_cloudy'} size={28} />
              </div>
              <strong className="dw-slot-temp">{h.temp}°</strong>
              {((h.precip || 0) > 0 || (h.prob || 0) > 0) && (
                <span className="dw-slot-precip">
                  {h.precip >= 1 && <UmbrellaIcon size={13} />}
                  {h.prob == null ? '—' : h.prob + '%'} · {h.precip == null ? '—' : Number(h.precip).toFixed(1) + 'mm'}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
