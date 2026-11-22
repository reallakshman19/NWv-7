import React, { useState } from 'react';
import './WeatherSourceStatus.css';

/** Source provenance is one accessible icon, never a dashboard-wide numeric label. */
import { classifyWeatherSource, getWeatherSourceCoverage, WEATHER_SOURCE_METRICS } from './weatherSourceHealth.js';

const iconPaths = {
  healthy: <path d="m7.5 12.5 3 3 6-7"/>,
  limited: <><path d="M12 7v6"/><circle cx="12" cy="16.5" r=".7" fill="currentColor" stroke="none"/></>,
  cached: <><path d="M12 7v5l3 2"/><path d="M7 5.8A8 8 0 1 1 4 12"/></>,
  snapshot: <path d="M8 7h8M8 12h8M8 17h5"/>,
  stale: <path d="M12 7v6m0 3v.01"/>,
  unavailable: <path d="m8 8 8 8m0-8-8 8"/>,
  unknown: <path d="M10 9a2.5 2.5 0 1 1 3.5 2.3c-1.5.7-1.5 1.5-1.5 2.2m0 3v.01"/>,
};
const titles = {
  healthy: '24-hour model coverage complete',
  limited: 'Forecast source coverage incomplete',
  cached: 'Using saved weather data',
  snapshot: 'Using a fallback weather snapshot',
  stale: 'Weather forecast needs refreshing',
  unavailable: 'Weather forecast unavailable',
  unknown: 'Weather source not verified',
};
export default function WeatherSourceStatus({ cityData, compact = false }) {
  const [open, setOpen] = useState(false);
  const status = classifyWeatherSource(cityData);
  const { feeds, metrics, completeHorizon } = getWeatherSourceCoverage(cityData);
  const updated = Number(cityData?.fetchedAt);
  const validUpdated = Number.isFinite(updated) && updated > 0 && updated <= Date.now()+300000;
  let timeText = 'Update time unavailable';
  if (validUpdated) {
    try {
      timeText = 'Updated ' + new Intl.DateTimeFormat(undefined, {
        hour:'numeric', minute:'2-digit', timeZone:cityData?.timezone || 'UTC',
      }).format(new Date(updated)) + ' (city time)';
    } catch {
      timeText = 'Updated ' + new Date(updated).toISOString();
    }
  }
  return <div className={'weather-source-status' + (compact ? ' weather-source-status--compact' : '')}>
    <button type="button" className={'wss-button wss-button--' + status}
      aria-label={titles[status] + '. Show data source details'} title={titles[status]}
      aria-expanded={open} onClick={() => setOpen(value => !value)}
      data-weather-health-icon={status}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9"/>{iconPaths[status]}
      </svg>
    </button>
    {open && <div className="wss-detail" data-weather-source-details>
      <div className="wss-detail__top"><strong>{titles[status]}</strong>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close data source details">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
        </button>
      </div>
      <p>{timeText}</p>
      <p>{status === 'cached' || status === 'stale' || status === 'snapshot'
        ? 'Live feeds may be unavailable. Forecast freshness is limited.'
        : 'Available forecast model feeds: ' + feeds.length + ' of 3.'}</p>
      <p>Next 24h coverage: {completeHorizon ? '24 hourly slots' : 'incomplete hourly horizon'}</p>
      <div className="wss-metrics">
        {WEATHER_SOURCE_METRICS.map(([key, label]) => <div key={key}><span>{label}</span>
          <strong>{Number.isInteger(metrics[key]) ? metrics[key] + ' of 3' : 'unknown'}</strong></div>)}
      </div>
      <small>Counts show the minimum contributing providers across 24 hours, not forecast accuracy. Weekly forecast and official alerts are not certified by this icon.</small>
    </div>}
  </div>;
}
