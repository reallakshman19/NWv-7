import React from 'react';
import SevereWeatherIcon from './SevereWeatherIcons.jsx';
import './WeatherOfficialAlerts.css';

/**
 * This app has no verified official-alert ingest yet.
 * Do not reinterpret Open-Meteo forecast weather codes as official warnings.
 */
export default function WeatherOfficialAlerts() {
  return <section className="weather-official-alerts" aria-label="Official severe weather warnings">
    <SevereWeatherIcon type="warning" size={22}/>
    <span><strong>Official warnings not monitored</strong>
      <small>Check your national weather authority for cyclone, sandstorm and flood warnings.</small>
    </span>
  </section>;
}
