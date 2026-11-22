// Source health concerns the full 24h forecast horizon, not endpoint HTTP success.
// A green icon does NOT establish meteorological accuracy or official warnings.
export const WEATHER_SOURCE_METRICS = Object.freeze([
  ['temperature', 'Temperature'], ['rain', 'Rainfall'],
  ['rainProbability', 'Rain chance'], ['humidity', 'Humidity'], ['wind', 'Wind'],
]);

const MODEL_IDS = ['ecmwf', 'gfs', 'icon'];
const MAX_FORECAST_AGE_MS = 4 * 60 * 60 * 1000;
const HORIZON_HOURS = 24;

export function getWeatherSourceCoverage(cityData) {
  const feeds = [...new Set((cityData?.models?.successful || [])
    .filter(model => MODEL_IDS.includes(model)))];
  const slots = Array.isArray(cityData?.hourly24) ? cityData.hourly24.slice(0, HORIZON_HOURS) : [];
  const completeHorizon = slots.length === HORIZON_HOURS;
  const metrics = {};
  for (const [key] of WEATHER_SOURCE_METRICS) {
    const firstFour = cityData?.models?.metricCoverage?.[key];
    if (!completeHorizon || !Number.isInteger(firstFour) || firstFour < 0 || firstFour > 3 ||
      slots.some(slot => !Number.isInteger(slot?.modelCoverage?.[key]) || slot.modelCoverage[key] < 0 || slot.modelCoverage[key] > 3)) {
      metrics[key] = null;
    } else {
      metrics[key] = Math.min(firstFour, ...slots.map(slot => slot.modelCoverage[key]));
    }
  }
  return { feeds, metrics, completeHorizon, hours: HORIZON_HOURS };
}

export function classifyWeatherSource(cityData, now = Date.now()) {
  if (cityData?.current?.temp == null || !Number.isFinite(Number(cityData.current.temp))) return 'unavailable';
  const stamp = Number(cityData?.fetchedAt);
  const age = now - stamp;
  if (!Number.isFinite(stamp) || stamp <= 0 || age < -300000 ||
    age > MAX_FORECAST_AGE_MS || cityData?.isStale) return 'stale';
  if (cityData?.sourceMode === 'cache') return 'cached';
  if (cityData?.sourceMode === 'snapshot') return 'snapshot';
  const { feeds, metrics, completeHorizon } = getWeatherSourceCoverage(cityData);
  if (cityData?.sourceMode !== 'live') return 'unknown';
  if (feeds.length === 3 && completeHorizon &&
      WEATHER_SOURCE_METRICS.every(([key]) => metrics[key] === 3)) return 'healthy';
  return feeds.length > 0 ? 'limited' : 'unknown';
}
