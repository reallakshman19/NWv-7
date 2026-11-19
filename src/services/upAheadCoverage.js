import { upAheadTimeMs } from './upAheadLifecycle.js';

const MAX_AGE = 12 * 3_600_000;
const STATUS_AGE = 3 * 3_600_000;
const SOURCE_URLS = {
  'chennai-calendar': 'https://chennai2go.in/this-week',
  'oman-calendar': 'https://experienceoman.om/events',
  'imd-nowcast': 'https://mausam.imd.gov.in/chennai/mcdata/nowcast.pdf',
  'tneb-shutdowns': 'https://tneb.tnebnet.org/cpro/today.html',
  'oman-warnings': 'https://met.caa.gov.om/en/warnings/',
};

const recent = (value, now, limit = MAX_AGE) => {
  const time = upAheadTimeMs(value);
  return time > 0 && now >= time && now - time <= limit;
};

export function getUpAheadLocalCoverage({ data, categories = [], locations = ['Chennai', 'Muscat'], settings = {}, now = Date.now() } = {}) {
  const enabled = categories.filter(category => settings.categories?.[category] !== false);
  const acquisition = data?.acquisitionSummary || {};
  const cities = locations.map(city => {
    let attempted = 0, succeeded = 0, failed = 0, unknown = 0;
    for (const category of enabled) {
      const row = acquisition.byCategory?.[category];
      const counts = row?.byLocation?.[city];
      // A successful Chennai feed does not certify coverage in Muscat. Legacy
      // category-only summaries remain unverified for city-level empty claims.
      if (!counts || !recent(counts.checkedAt || row.checkedAt || acquisition.checkedAt, now)) {
        unknown += 1;
        continue;
      }
      attempted += Number(counts.attemptedSources || 0);
      succeeded += Number(counts.successfulSources || 0);
      failed += Number(counts.failedSources || 0);
    }
    const status = !enabled.length ? 'disabled' : !succeeded ? (failed ? 'unavailable' : 'unknown')
      : failed || unknown ? 'partial' : 'checked';
    return { city, status, attempted, succeeded, failed };
  });
  const bulletins = Object.entries(data?.sourceStatuses || {}).flatMap(([id, row]) => {
    if (!SOURCE_URLS[id] || !locations.includes(row?.city) || !enabled.includes(row.category)) return [];
    const validUntil = upAheadTimeMs(row.validUntil);
    const fresh = recent(row.checkedAt, now, STATUS_AGE) && (!validUntil || now < validUntil);
    return [{ id, city: row.city, source: row.source, url: SOURCE_URLS[id],
      checkedAt: upAheadTimeMs(row.checkedAt), issuedAt: upAheadTimeMs(row.issuedAt), validUntil,
      status: !fresh ? 'stale' : row.ok ? row.status : 'unavailable',
      message: !fresh ? 'The last source check has expired; current coverage is unverified.'
        : row.ok ? String(row.message || 'Source checked.') : String(row.message || 'Source could not be verified.'),
    }];
  });
  return { cities, bulletins, enabled: enabled.length > 0 };
}
