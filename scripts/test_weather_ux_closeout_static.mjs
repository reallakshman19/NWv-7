import fs from 'node:fs';
const read=path=>fs.readFileSync(path,'utf8');
const checks=[
 ['City selector',read('src/components/QuickWeather.jsx').includes('WeatherCityStrip')&&read('src/pages/WeatherPage.jsx').includes('WeatherCityStrip')],
 ['City management',read('src/components/weather/WeatherLocationManager.jsx').includes('addCity')&&read('src/components/weather/WeatherLocationManager.jsx').includes('removeCity')],
 ['2h/4h intervals',read('src/services/weatherIntervals.js').includes('[2, 4].includes(hours)')],
 ['No two-day quick summary',!read('src/components/QuickWeather.jsx').includes('QuickWeatherSignalStrip')],
 ['Seven-day detail retained',read('src/components/weather/WeeklyWeatherForecast.jsx').includes('7-day outlook')],
 ['SVG icons',read('src/components/weather/WeeklyWeatherForecast.jsx').includes('<WeatherIcon')&&read('src/components/QuickWeather.jsx').includes('<WeatherIcon')],
];
for(const [label,ok] of checks)if(!ok)throw Error('Weather UX: '+label+' failed');
console.log('PASS: citywise weather UX contract');
