function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function quantile(values, fraction) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + ((sorted[upper] - sorted[lower]) * (position - lower));
}

export function summarizePilotValues(values = []) {
  const rows = values.map(finite).filter(value => value !== null);
  return {
    count: rows.length,
    median: quantile(rows, 0.5),
    p10: quantile(rows, 0.1),
    p25: quantile(rows, 0.25),
    p75: quantile(rows, 0.75),
    p90: quantile(rows, 0.9),
    minimum: rows.length ? Math.min(...rows) : null,
    maximum: rows.length ? Math.max(...rows) : null,
  };
}

export function incrementCount(counts, key, amount = 1) {
  const normalized = String(key || 'unknown');
  counts[normalized] = (counts[normalized] || 0) + Number(amount || 0);
  return counts;
}

export function mergeCountMaps(target, source = {}) {
  Object.entries(source).forEach(([key, value]) => incrementCount(target, key, value));
  return target;
}

export function isUsablePilotDay(day = {}) {
  return ['PASS', 'PASS_WITH_WARNINGS'].includes(day.validation?.decision) &&
    day.dailyReport?.status === 'OBSERVED';
}
