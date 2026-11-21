import fs from 'node:fs';
const read=path=>fs.readFileSync(path,'utf8');
const asserts=[
 ['On This Day defaults off',read('src/services/displayPreferences.js').includes('showOnThisDay: false')],
 ['Display preferences',read('src/components/settings/DisplayPreferencesPanel.jsx').includes('On This Day')],
 ['Visibility controller',read('src/components/settings/OnThisDayVisibilityController.jsx').includes('MutationObserver')],
 ['Settings weather manager',read('src/pages/SettingsPage.jsx').includes('WeatherLocationManager')],
 ['Quick Weather shared registry',read('src/components/QuickWeather.jsx').includes('getConfiguredWeatherCities')],
 ['Canonical city list',read('src/context/WeatherContext.jsx').includes('getConfiguredWeatherCities')]
];
for(const [label,ok] of asserts)if(!ok)throw Error(label);
console.log('PASS: weather settings and On This Day contract');
