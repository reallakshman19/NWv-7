export const HOUR_MS = 60 * 60 * 1000;
export const MINUTE_MS = 60 * 1000;

export const DATASET_CONTRACTS = Object.freeze([
  {
    dataset: 'insight',
    path: '/newsdata/insight_latest.json',
    warnAgeMs: 8 * HOUR_MS,
    failAgeMs: 48 * HOUR_MS,
    contract: 'insight',
  },
  {
    dataset: 'sections',
    path: '/newsdata/sections_latest.json',
    warnAgeMs: 12 * HOUR_MS,
    failAgeMs: 60 * HOUR_MS,
    contract: 'sections',
  },
  {
    dataset: 'breaking',
    path: '/newsdata/breaking_latest.json',
    warnAgeMs: 30 * MINUTE_MS,
    failAgeMs: 3 * HOUR_MS,
    contract: 'basic',
  },
  {
    dataset: 'upAhead',
    path: '/data/up_ahead.json',
    warnAgeMs: 12 * HOUR_MS,
    failAgeMs: 48 * HOUR_MS,
    contract: 'upAhead',
  },
  {
    dataset: 'market',
    path: '/data/market_snapshot.json',
    warnAgeMs: 24 * HOUR_MS,
    failAgeMs: 72 * HOUR_MS,
    contract: 'basic',
  },
  {
    dataset: 'weather',
    path: '/data/weather_snapshot.json',
    warnAgeMs: 12 * HOUR_MS,
    failAgeMs: 48 * HOUR_MS,
    contract: 'basic',
  },
]);

export function getDatasetContracts() {
  return DATASET_CONTRACTS.map(item => ({ ...item }));
}
