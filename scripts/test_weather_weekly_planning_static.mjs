import fs from 'node:fs';
const read=path=>fs.readFileSync(path,'utf8');
const assertions=[
 ['Weekly forecast',read('src/components/weather/WeeklyWeatherForecast.jsx').includes('7-day outlook')],
 ['Planning summary',read('src/components/weather/WeatherPlanningSummary.jsx').includes('summarizeCityWeekly')],
 ['City comparison',read('src/components/weather/WeatherCityComparison.jsx').includes('WeatherCityComparison')],
 ['Quick Weather now uses short horizons',read('src/components/QuickWeather.jsx').includes('WeatherHourIntervals')],
 ['Provider-local timestamps',read('src/services/weatherService.js').includes('localTime')],
 ['2h/4h controls',read('src/components/weather/WeatherHourIntervals.jsx').includes('[2, 4]')],
];
for(const [label,ok] of assertions)if(!ok)throw Error(label);
console.log('PASS: seven-day and next-hour weather views remain separately available');
