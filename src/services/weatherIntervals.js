/**
 * Two- or four-hour intervals derived only from complete city-local hourly slots.
 * A missing rainfall measurement is never interpreted as 0 mm.
 */
function numeric(value, min = -Infinity, max = Infinity) {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}
function localEpoch(time) {
  if (typeof time !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(time)) return null;
  const stamp = Date.parse(time.length === 16 ? time + ':00Z' : time + 'Z');
  return Number.isFinite(stamp) ? stamp : null;
}
export function buildWeatherIntervals(cityData, hours = 2, limit = 4) {
  if (![2, 4].includes(hours)) throw new Error('Only 2h/4h weather intervals supported');
  const slots = Array.isArray(cityData?.hourly24) ? cityData.hourly24 : [];
  const output = [];
  for (let offset = 0; offset + hours <= slots.length && output.length < limit; offset += hours) {
    const group = slots.slice(offset, offset + hours);
    const start = localEpoch(group[0]?.localTime);
    const complete = start != null && group.every((slot, i) => localEpoch(slot?.localTime) === start + i * 3600000);
    if (!complete) {
      output.push({ key: String(offset), label: offset ? '+' + offset + 'h' : 'Now', complete: false, temp: null, rainMm: null, rainProbability: null, iconId: 'day_cloudy' });
      continue;
    }
    const rain = group.map(x => numeric(x.precip, 0));
    const probability = group.map(x => numeric(x.prob, 0, 100));
    output.push({
      key: group[0].localTime,
      label: offset ? '+' + offset + 'h' : 'Now',
      localTime: group[0].localTime,
      endLocalTime: group[group.length - 1].localTime,
      complete: true,
      iconId: group[0].iconId || 'day_cloudy',
      temp: numeric(group[0].temp, -100, 70),
      condition: group[0].condition || null,
      rainMm: rain.every(v => v !== null) ? Number(rain.reduce((a, b) => a + b, 0).toFixed(1)) : null,
      rainProbability: probability.every(v => v !== null) ? Math.max(...probability) : null,
      rainProbabilitySemantics: 'peak_hourly_probability_in_interval',
    });
  }
  return output;
}
