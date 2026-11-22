/**
 * City-local next 2h/4h forecast. A contiguous series is not necessarily
 * current: reject expired, future-dated or untrusted source timestamps.
 */
function numeric(value, min = -Infinity, max = Infinity) {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}
function localEpoch(time) {
  if (typeof time !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(time)) return null;
  const result = Date.parse(time.length === 16 ? time + ':00Z' : time + 'Z');
  return Number.isFinite(result) ? result : null;
}
function cityLocalHour(now, timezone) {
  if (typeof timezone !== 'string' || !timezone || timezone === 'auto') return null;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', hourCycle: 'h23', minute: '2-digit',
    }).formatToParts(new Date(now));
    const get = name => parts.find(part => part.type === name)?.value;
    return localEpoch(get('year') + '-' + get('month') + '-' + get('day') + 'T' + get('hour') + ':00');
  } catch { return null; }
}
export function buildWeatherIntervals(cityData, hours = 2, limit = 4, now = Date.now()) {
  if (![2, 4].includes(hours)) throw new Error('Only 2h/4h weather intervals supported');
  const fetchedAt = numeric(cityData?.fetchedAt, 1);
  const nowEpoch = Number(now);
  // Even if a 48h fallback is retained, its expired measurements must not be called "Now".
  if (!Number.isFinite(nowEpoch) || fetchedAt == null ||
      nowEpoch - fetchedAt > 4 * 60 * 60 * 1000 || fetchedAt - nowEpoch > 5 * 60 * 1000) return [];
  const currentHour = cityLocalHour(nowEpoch, cityData?.timezone);
  if (currentHour == null) return [];
  const slots = Array.isArray(cityData?.hourly24) ? cityData.hourly24 : [];
  const firstIndex = slots.findIndex(slot => {
    const time = localEpoch(slot?.localTime);
    return time != null && time >= currentHour && time < currentHour + 60 * 60 * 1000;
  });
  if (firstIndex < 0) return [];
  const output = [];
  for (let offset = 0; firstIndex + offset + hours <= slots.length && output.length < limit; offset += hours) {
    const group = slots.slice(firstIndex + offset, firstIndex + offset + hours);
    const start = localEpoch(group[0]?.localTime);
    const complete = start != null && group.every((slot, index) => localEpoch(slot?.localTime) === start + index * 3600000);
    const label = offset ? '+' + offset + 'h' : 'Now';
    if (!complete) {
      output.push({ key: String(firstIndex + offset), label, complete: false,
        temp: null, rainMm: null, rainProbability: null, iconId: 'day_cloudy' });
      continue;
    }
    const rain = group.map(slot => numeric(slot.precip, 0));
    const probability = group.map(slot => numeric(slot.prob, 0, 100));
    output.push({
      key: group[0].localTime, label, localTime: group[0].localTime,
      endLocalTime: group[group.length - 1].localTime, complete: true,
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
