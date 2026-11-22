import React, { useMemo, useState } from 'react';
import WeatherIcon from '../WeatherIcons.jsx';
import { buildWeatherIntervals } from '../../services/weatherIntervals.js';
import './WeatherHourIntervals.css';

export default function WeatherHourIntervals({ cityData, compact = false }) {
  const [hours, setHours] = useState(2);
  const periods = useMemo(() => buildWeatherIntervals(cityData, hours, compact ? 4 : 6), [cityData, hours, compact]);
  const knownModels = (cityData?.models?.successful || []).filter(model => ['ecmwf','gfs','icon'].includes(model));
  const count = knownModels.length;
  const status = cityData?.sourceMode || 'unknown';
  return (
    <section className={'weather-hour-intervals' + (compact ? ' weather-hour-intervals--compact' : '')} data-weather-hour-intervals>
      <div className="whi-header">
        <div><h3>Upcoming hours</h3><span>City-local forecast · {hours}-hour intervals</span></div>
        <div className="whi-switch" role="group" aria-label="Forecast interval">
          {[2, 4].map(n => <button key={n} type="button" aria-pressed={hours === n} onClick={() => setHours(n)}>{n}h</button>)}
        </div>
      </div>
      {periods.length ? <div className="whi-rows">
        {periods.map(period => (
          <div className="whi-period" key={period.key} title={period.localTime ? 'Local ' + period.localTime : 'Timing unavailable'}>
            <span className="whi-period__time">{period.label}</span>
            <WeatherIcon id={period.iconId} size={compact ? 24 : 30}/>
            <strong>{period.temp == null ? '—' : period.temp + '°'}</strong>
            <span className="whi-period__rain">{period.rainProbability == null ? '—' : period.rainProbability + '%'}<small>peak hourly</small></span>
            <span className="whi-period__mm">{period.rainMm == null ? '—' : period.rainMm.toFixed(1) + ' mm'}<small>{hours}h rain</small></span>
          </div>
        ))}
      </div> : <p className="whi-empty">Timestamped hourly forecast unavailable. Refresh to retrieve interval data.</p>}
      <div className="whi-footer">
        <span>{status === 'live' ? 'Live forecast' : status === 'cache' ? 'Cached forecast' : status === 'snapshot' ? 'Snapshot forecast' : 'Source unverified'}{count > 0 ? ' · ' + count + '/3 model feeds · rain ' + (cityData?.models?.metricCoverage?.rain ?? '—') + '/3' : ''}</span>
        <span>Rain total per interval · peak hourly chance</span>
      </div>
    </section>
  );
}
