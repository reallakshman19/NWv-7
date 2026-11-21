import fs from 'node:fs';
const read=path=>fs.readFileSync(path,'utf8');
const expected={
 'src/services/weatherLocations.js':['DEFAULT_WEATHER_CITIES','colombo','buildWeatherSettingsWithCities'],
 'src/services/weatherDataAdapters.js':['normalizeForecastDay','formatRainPair'],
 'src/services/weatherService.js':['precipitation_sum','weeklyForecast','localTime','sourceMode'],
 'src/components/QuickWeather.jsx':['WeatherHourIntervals','WeatherCityStrip','Manage cities'],
 'src/pages/WeatherPage.jsx':['WeatherLocationManager','WeatherHourIntervals','WeatherCityStrip','WeeklyWeatherForecast','WeatherPlanningSummary'],
 'src/components/weather/WeatherLocationManager.jsx':['removeCity','addCity','Reset defaults'],
 'src/components/weather/WeeklyWeatherForecast.jsx':['7-day outlook','<WeatherIcon','Humidity','Feels'],
 'src/services/weatherIntervals.js':['Only 2h/4h','rainProbabilitySemantics','localTime']
};
for(const [path,tokens] of Object.entries(expected)){const c=read(path);for(const t of tokens)if(!c.includes(t))throw Error(path+' missing '+t);}
console.log('PASS: weather shared-city, timed intervals, weekly, and location manager');
