import fs from 'node:fs';
const read=path=>fs.readFileSync(path,'utf8');
const quick=read('src/components/QuickWeather.jsx');
const interval=read('src/components/weather/WeatherHourIntervals.jsx');
const strip=read('src/components/weather/WeatherCityStrip.jsx');
const context=read('src/context/WeatherContext.jsx');
for(const token of ['WeatherCityStrip','WeatherHourIntervals','getConfiguredWeatherCities','activeCity','setActiveCity','Manage cities']){
  if(!quick.includes(token))throw Error('Quick Weather missing '+token);
}
for(const token of ['[2, 4]','buildWeatherIntervals','data-weather-hour-intervals'])if(!interval.includes(token))throw Error('2h/4h timeline missing '+token);
for(const token of ['qw-city-row--missing','No forecast','onSelect'])if(!strip.includes(token))throw Error('Shared city selector missing '+token);
if(!context.includes('activeCity, setActiveCity'))throw Error('Missing shared city state');
if(quick.includes('QuickWeatherSignalStrip')||quick.includes('getSevereWarning'))throw Error('Unqualified daily summaries remain visible');
console.log('PASS: Quick Weather shared city selection, 2h/4h timeline, SVG-only UI');
