import fs from 'node:fs';
function check(ok, why){if(!ok)throw Error(why);}
function read(file){check(fs.existsSync(file),'Missing '+file);return fs.readFileSync(file,'utf8');}
const quick=read('src/components/QuickWeather.jsx');
const strip=read('src/components/weather/WeatherCityStrip.jsx');
const interval=read('src/services/weatherIntervals.js');
const context=read('src/context/WeatherContext.jsx');
const view=read('src/viewModels/useWeatherTabViewModel.js');
const page=read('src/pages/WeatherPage.jsx');
const manager=read('src/components/weather/WeatherLocationManager.jsx');
for(const token of ['getConfiguredWeatherCities','WeatherCityStrip','WeatherHourIntervals','activeCity','setActiveCity','Manage cities']){
  check(quick.includes(token),'QuickWeather missing '+token);
}
for(const token of ['data-weather-city-strip','qw-city-row--missing','No forecast','aria-current','onSelect']){
  check(strip.includes(token),'City selector missing '+token);
}
for(const token of ['[2, 4].includes(hours)','cityLocalHour','fetchedAt','rain.every','probability.every','localTime']){
  check(interval.includes(token),'Interval data contract missing '+token);
}
for(const token of ['activeCity, setActiveCity','updateSettings(','weather_active_city']){
  check(context.includes(token),'Shared city persistence missing '+token);
}
for(const token of ['buildWeatherSettingsWithCities','addWeatherCity','removeWeatherCity','uniqueCities.length > 10','Unable to save weather locations.']){
  check(view.includes(token),'Weather manager missing '+token);
}
check(page.includes('<WeatherLocationManager')&&page.includes('<WeatherCityStrip'),'Weather tab cannot manage/select cities');
check(manager.includes('removeCity')&&manager.includes('addCity'),'City manager must add and remove');
check(!quick.includes('QuickWeatherSignalStrip'),'Do not mix Today+Tomorrow risk signals into Quick Weather');
check(!quick.includes('getSevereWarning'),'No unsupported weather alert banner');
check(!view.includes('displayData?.chennai'),'Must never substitute another city forecast');
check(!quick.includes('handleRemoveCity'),'Quick Weather deletion must use canonical city manager');
console.log('PASS: all citywise Quick Weather wiring and negative source constraints');
