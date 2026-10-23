/** Pure weather display helpers; keep React component exports limited to components. */

export function getHourInTimezone(timeZone, now = new Date()) {
  if (!timeZone || timeZone === 'auto') return now.getHours();

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      hour12: false,
    }).formatToParts(now);
    const hour = Number(parts.find(part => part.type === 'hour')?.value);
    return Number.isFinite(hour) ? hour % 24 : now.getHours();
  } catch {
    return now.getHours();
  }
}

export function hourlyPeakProbability(data) {
  const hourly = Array.isArray(data?.hourly) ? data.hourly : [];
  return hourly.reduce(
    (peak, slot) => Math.max(peak, Number(slot?.prob || 0)),
    0
  );
}

export function getWeatherHeaderSummary(cityData) {
  const today = Array.isArray(cityData?.weeklyForecast) ? cityData.weeklyForecast[0] : null;
  const peakProbability = Number(
    cityData?.dailyRain?.peakProbability ??
    today?.precipProb ??
    today?.rainProb
  );
  const forecastTotalMm = Number(
    cityData?.dailyRain?.forecastTotalMm ??
    today?.precipSum ??
    today?.rainMm
  );
  const uv = today?.uvMax ?? today?.uvIndex ?? null;

  if (Number.isFinite(peakProbability) && Number.isFinite(forecastTotalMm) && forecastTotalMm > 0) {
    return `Peak rain chance today ${Math.round(peakProbability)}% · Forecast total ${forecastTotalMm.toFixed(1)}mm${uv != null ? ` · UV ${uv}` : ''}`;
  }

  return cityData?.summary || '';
}

export function getConditionText(data) {
  const parts = [];
  const peakRainProb = Math.max(
    Number(data?.rainProb?.peak ?? data?.rainProb?.avg ?? 0) || 0,
    hourlyPeakProbability(data)
  );
  const rainMm = Number.isFinite(Number(data?.rainMmValue))
    ? Number(data.rainMmValue)
    : parseFloat(data?.rainMm === '-' ? 0 : data?.rainMm) || 0;
  const hourly = Array.isArray(data?.hourly) ? data.hourly : [];
  const stormEvidence = /thunder/i.test(String(data?.condition || ''))
    || hourly.some(slot => /thunder/i.test(String(slot?.condition || '')));

  if (stormEvidence && (peakRainProb >= 30 || rainMm >= 0.5)) {
    parts.push('Thunderstorms possible.');
  } else if (rainMm >= 2 || peakRainProb >= 60) {
    parts.push('Rain likely.');
  } else if (rainMm >= 0.5 || peakRainProb >= 30) {
    parts.push('Showers possible.');
  } else if (data.cloudCover > 70) {
    parts.push('Cloudy.');
  } else if (data.cloudCover < 20) {
    parts.push('Clear skies.');
  }

  if (data.windSpeed > 20) parts.push('Breezy.');
  if (data.uvIndex > 8) parts.push('High UV.');

  if (parts.length === 0) return 'Stable conditions.';
  return parts.join(' ');
}
