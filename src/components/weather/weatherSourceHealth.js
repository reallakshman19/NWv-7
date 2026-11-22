export function classifyWeatherSource(cityData, now = Date.now()) {
  if (cityData?.current?.temp == null) return 'unavailable';
  const fetchedAt = Number(cityData?.fetchedAt);
  const age = now - fetchedAt;
  if (!Number.isFinite(fetchedAt) || fetchedAt <= 0 || age > 4 * 3600000 || age < -300000 || cityData?.isStale) return 'stale';
  if (cityData?.sourceMode === 'cache') return 'cached';
  if (cityData?.sourceMode === 'snapshot') return 'snapshot';
  const models = cityData?.models;
  const successful = Array.isArray(models?.successful)
    ? [...new Set(models.successful.filter(name => ['ecmwf', 'gfs', 'icon'].includes(name)))] : [];
  if (cityData?.sourceMode === 'live' && successful.length === 3 &&
      models?.metricCoverage?.rain === 3 && models?.metricCoverage?.rainProbability === 3) return 'healthy';
  if (cityData?.sourceMode === 'live' && successful.length > 0) return 'limited';
  return 'unknown';
}