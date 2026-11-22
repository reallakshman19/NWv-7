import React from 'react';
import SevereWeatherIcon from './SevereWeatherIcons.jsx';
import './WeatherOfficialAlerts.css';

/** No authoritative warning feed is connected. Information is quiet, explicit and opt-in. */
export default function WeatherOfficialAlerts() {
  return <details className="weather-official-alerts" aria-label="Official alert source information">
    <summary title="About official weather warnings"><SevereWeatherIcon type="warning" size={15}/>
      <span>Alert sources</span>
    </summary>
    <p>Official cyclone, sandstorm and flood warnings are not monitored in this app. Consult your national meteorological authority for active alerts.</p>
  </details>;
}
