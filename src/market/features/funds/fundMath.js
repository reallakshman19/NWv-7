/**
 * NWv7 Market Desk R2.1 - WP-05 Mutual Funds Mathematics
 * Pure financial calculations:
 * - Deterministic trailing returns with 7-day lookback window selection
 * - Annualized CAGR using the standard 365.25-day convention
 * - Maximum Drawdown (MDD)
 * - Annualized historical NAV volatility with weekend/holiday gap filtering
 * - Common-date base-100 normalization for multi-fund comparison
 */

export const DAYS_PER_YEAR = 365.25;

/**
 * Normalizes input date string ('YYYY-MM-DD' or 'DD-MM-YYYY') to ISO 'YYYY-MM-DD'.
 * Validates calendar validity (leap years, month days).
 * @param {string} dateStr 
 * @returns {string|null}
 */
export function normalizeDateToIso(dateStr) {
  if (typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();

  let y, m, d;
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  const dmyMatch = /^(\d{2})-(\d{2})-(\d{4})$/.exec(trimmed);

  if (isoMatch) {
    y = Number(isoMatch[1]);
    m = Number(isoMatch[2]);
    d = Number(isoMatch[3]);
  } else if (dmyMatch) {
    d = Number(dmyMatch[1]);
    m = Number(dmyMatch[2]);
    y = Number(dmyMatch[3]);
  } else {
    return null;
  }

  if (y < 1950 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;

  const dateObj = new Date(Date.UTC(y, m - 1, d));
  if (
    dateObj.getUTCFullYear() !== y ||
    dateObj.getUTCMonth() !== m - 1 ||
    dateObj.getUTCDate() !== d
  ) {
    return null; // Invalid day for month
  }

  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

/**
 * Calculates calendar day difference between two dates (d1 - d0).
 * Uses UTC to avoid daylight saving time distortion.
 * @param {string} d1 
 * @param {string} d0 
 * @returns {number}
 */
export function calendarDayDiff(d1, d0) {
  const iso1 = normalizeDateToIso(d1);
  const iso0 = normalizeDateToIso(d0);
  if (!iso1 || !iso0) return NaN;

  const [y1, m1, day1] = iso1.split('-').map(Number);
  const [y0, m0, day0] = iso0.split('-').map(Number);

  const ms1 = Date.UTC(y1, m1 - 1, day1);
  const ms0 = Date.UTC(y0, m0 - 1, day0);

  return Math.round((ms1 - ms0) / 86400000);
}

/**
 * Subtracts calendar period (months, years) from an ISO date string.
 * Snaps day to the last valid day of the resulting month (e.g. 31 Mar minus 1 month = 28/29 Feb).
 * @param {string} isoDate YYYY-MM-DD
 * @param {{ months?: number, years?: number }} period 
 * @returns {string} target YYYY-MM-DD
 */
export function subtractCalendarPeriod(isoDate, { months = 0, years = 0 } = {}) {
  const norm = normalizeDateToIso(isoDate);
  if (!norm) return null;

  const [currY, currM, currD] = norm.split('-').map(Number);

  let targetY = currY - (years || 0);
  let targetM = currM - (months || 0);

  while (targetM < 1) {
    targetM += 12;
    targetY -= 1;
  }

  // Days in target month
  // Day 0 of next month gives the last day of target month in UTC
  const maxDaysInTargetMonth = new Date(Date.UTC(targetY, targetM, 0)).getUTCDate();
  const targetD = Math.min(currD, maxDaysInTargetMonth);

  const mm = String(targetM).padStart(2, '0');
  const dd = String(targetD).padStart(2, '0');
  return `${targetY}-${mm}-${dd}`;
}

/**
 * Parses and sorts an array of raw NAV observations chronologically (date ASC).
 * Filters out invalid dates or non-positive NAVs.
 * @param {Array<{ date: string, nav: number|string }>} rawObservations 
 * @returns {Array<{ date: string, nav: number }>}
 */
export function sanitizeAndSortNavHistory(rawObservations) {
  if (!Array.isArray(rawObservations)) return [];

  const valid = [];
  for (const item of rawObservations) {
    if (!item) continue;
    const isoDate = normalizeDateToIso(item.date);
    const navNum = typeof item.nav === 'number' ? item.nav : Number(item.nav);
    if (isoDate && Number.isFinite(navNum) && navNum > 0) {
      valid.push({
        date: isoDate,
        nav: Math.round(navNum * 10000) / 10000
      });
    }
  }

  // Deduplicate on same date (keep last entry)
  const map = new Map();
  for (const obs of valid) {
    map.set(obs.date, obs);
  }

  const sorted = Array.from(map.values());
  sorted.sort((a, b) => a.date.localeCompare(b.date));
  return sorted;
}

/**
 * Calculates point-to-point trailing returns and CAGRs using the strict 7-day backward lookback window.
 * 
 * Rules:
 * 1. End observation: newest valid observation.
 * 2. Target date = end date minus requested period (1M, 3M, 6M, 1Y, 3Y, 5Y).
 * 3. Search window: latest observation on or before target date within [targetDate - 7 days, targetDate].
 * 4. Never pick an observation AFTER target date; never interpolate.
 * 5. If horizon <= 1Y: Simple percentage return.
 * 6. If horizon > 1Y: Annualized CAGR with 365.25 day convention.
 *
 * @param {Array<{ date: string, nav: number }>} observations 
 * @param {string|null} asOfDate optional specific end date
 * @returns {Record<string, { available: boolean, returnPercent: number|null, isCagr: boolean, startDate?: string, endDate?: string, elapsedDays?: number, reason?: string }>}
 */
export function calculateTrailingReturns(observations = [], asOfDate = null) {
  const history = sanitizeAndSortNavHistory(observations);

  const emptyPeriod = (reason = 'NO_DATA') => ({
    available: false,
    returnPercent: null,
    isCagr: false,
    reason
  });

  const horizons = [
    { key: '1M', label: '1 Month', months: 1, years: 0 },
    { key: '3M', label: '3 Months', months: 3, years: 0 },
    { key: '6M', label: '6 Months', months: 6, years: 0 },
    { key: '1Y', label: '1 Year', months: 0, years: 1 },
    { key: '3Y', label: '3 Years', months: 0, years: 3 },
    { key: '5Y', label: '5 Years', months: 0, years: 5 }
  ];

  const results = {
    '1M': emptyPeriod(),
    '3M': emptyPeriod(),
    '6M': emptyPeriod(),
    '1Y': emptyPeriod(),
    '3Y': emptyPeriod(),
    '5Y': emptyPeriod(),
    'ALL': emptyPeriod()
  };

  if (history.length < 2) return results;

  // 1. Determine End Observation
  let endObs = history[history.length - 1];
  if (asOfDate) {
    const normAsOf = normalizeDateToIso(asOfDate);
    if (normAsOf) {
      const filtered = history.filter(o => o.date <= normAsOf);
      if (filtered.length >= 2) {
        endObs = filtered[filtered.length - 1];
      } else {
        return results;
      }
    }
  }

  // 2. Compute Trailing Horizons
  for (const h of horizons) {
    const targetDate = subtractCalendarPeriod(endObs.date, { months: h.months, years: h.years });
    if (!targetDate) continue;

    // Search for latest observation in [targetDate - 7 days, targetDate]
    let startObs = null;
    for (let i = history.length - 1; i >= 0; i--) {
      const candidate = history[i];
      if (candidate.date > targetDate) continue; // Must be ON or BEFORE target date

      const daysDiff = calendarDayDiff(targetDate, candidate.date);
      if (daysDiff <= 7) {
        startObs = candidate;
        break; // Latest candidate found
      } else {
        // Too far back (> 7 days before target date)
        break;
      }
    }

    if (!startObs) {
      results[h.key] = emptyPeriod('INSUFFICIENT_WINDOW_COVERAGE');
      continue;
    }

    const elapsedDays = calendarDayDiff(endObs.date, startObs.date);
    if (elapsedDays <= 0) {
      results[h.key] = emptyPeriod('ZERO_ELAPSED_DAYS');
      continue;
    }

    // A weekend/holiday lookback can make a 1Y span exceed 366 days without
    // changing its documented simple-return convention.
    const isLongTerm = h.years >= 3;

    let returnPercent;
    if (!isLongTerm) {
      // Simple return for <= 1 Year
      returnPercent = ((endObs.nav - startObs.nav) / startObs.nav) * 100;
    } else {
      // Annualized CAGR with 365.25 convention
      const baseRatio = endObs.nav / startObs.nav;
      returnPercent = (Math.pow(baseRatio, DAYS_PER_YEAR / elapsedDays) - 1) * 100;
    }

    results[h.key] = {
      available: true,
      returnPercent: Math.round(returnPercent * 100) / 100,
      isCagr: isLongTerm,
      startDate: startObs.date,
      endDate: endObs.date,
      startNav: startObs.nav,
      endNav: endObs.nav,
      elapsedDays
    };
  }

  // 3. Compute ALL (Available Period) Horizon
  const firstObs = history[0];
  const allElapsedDays = calendarDayDiff(endObs.date, firstObs.date);
  if (allElapsedDays > 0) {
    const isCagr = allElapsedDays > 365.25;
    let allReturn;
    if (isCagr) {
      const baseRatio = endObs.nav / firstObs.nav;
      allReturn = (Math.pow(baseRatio, DAYS_PER_YEAR / allElapsedDays) - 1) * 100;
    } else {
      allReturn = ((endObs.nav - firstObs.nav) / firstObs.nav) * 100;
    }

    results['ALL'] = {
      available: true,
      returnPercent: Math.round(allReturn * 100) / 100,
      isCagr,
      startDate: firstObs.date,
      endDate: endObs.date,
      startNav: firstObs.nav,
      endNav: endObs.nav,
      elapsedDays: allElapsedDays,
      isAvailablePeriodOnly: true
    };
  }

  return results;
}

/**
 * Calculates Maximum Drawdown (MDD) across an observation series.
 * @param {Array<{ date: string, nav: number }>} observations 
 * @returns {{ mddPercent: number, peakDate: string|null, peakNav: number|null, troughDate: string|null, troughNav: number|null }}
 */
export function calculateMaxDrawdown(observations = []) {
  const history = sanitizeAndSortNavHistory(observations);
  if (history.length < 2) {
    return {
      mddPercent: 0,
      peakDate: null,
      peakNav: null,
      troughDate: null,
      troughNav: null
    };
  }

  let runningPeak = history[0].nav;
  let runningPeakDate = history[0].date;

  let maxDrawdown = 0; // negative or 0
  let bestPeakDate = runningPeakDate;
  let bestPeakNav = runningPeak;
  let bestTroughDate = history[0].date;
  let bestTroughNav = history[0].nav;

  for (let i = 1; i < history.length; i++) {
    const pt = history[i];
    if (pt.nav > runningPeak) {
      runningPeak = pt.nav;
      runningPeakDate = pt.date;
    } else {
      const dd = ((pt.nav - runningPeak) / runningPeak) * 100;
      if (dd < maxDrawdown) {
        maxDrawdown = dd;
        bestPeakDate = runningPeakDate;
        bestPeakNav = runningPeak;
        bestTroughDate = pt.date;
        bestTroughNav = pt.nav;
      }
    }
  }

  return {
    mddPercent: Math.round(maxDrawdown * 100) / 100,
    peakDate: bestPeakDate,
    peakNav: bestPeakNav,
    troughDate: bestTroughDate,
    troughNav: bestTroughNav
  };
}

/**
 * Calculates annualized historical NAV volatility.
 * Requires at least 20 trading days.
 * Filters calendar gaps > 4 days from daily return sample to avoid holiday distortion.
 *
 * @param {Array<{ date: string, nav: number }>} observations 
 * @returns {{ available: boolean, volatilityPercent: number|null, sampleCount: number, reason?: string }}
 */
export function calculateAnnualizedVolatility(observations = []) {
  const history = sanitizeAndSortNavHistory(observations);
  if (history.length < 20) {
    return {
      available: false,
      volatilityPercent: null,
      sampleCount: history.length,
      reason: 'MIN_20_OBSERVATIONS_REQUIRED'
    };
  }

  const returns = [];
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1];
    const curr = history[i];

    const dayDiff = calendarDayDiff(curr.date, prev.date);
    // Filter gaps > 4 calendar days (e.g. extended market shutdowns or missing reporting blocks)
    if (dayDiff > 0 && dayDiff <= 4) {
      returns.push((curr.nav - prev.nav) / prev.nav);
    }
  }

  if (returns.length < 15) {
    return {
      available: false,
      volatilityPercent: null,
      sampleCount: returns.length,
      reason: 'INSUFFICIENT_QUALIFIED_TRADING_PAIRS'
    };
  }

  // Mean return
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;

  // Sample variance
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);
  const dailySigma = Math.sqrt(variance);

  // Annualize with sqrt(252) trading days
  const annualizedSigmaPercent = dailySigma * Math.sqrt(252) * 100;

  return {
    available: true,
    volatilityPercent: Math.round(annualizedSigmaPercent * 100) / 100,
    sampleCount: returns.length
  };
}

/**
 * Rebase a single scheme's history to base 100 at a target start date.
 * @param {Array<{ date: string, nav: number }>} observations 
 * @param {string} startDate target evaluation start date
 * @returns {Array<{ date: string, nav: number, normalized: number }>}
 */
export function rebaseSeriesToBase100(observations, startDate) {
  const history = sanitizeAndSortNavHistory(observations);
  const filtered = history.filter(o => o.date >= startDate);
  if (filtered.length === 0) return [];

  const baseNav = filtered[0].nav;
  return filtered.map(pt => ({
    date: pt.date,
    nav: pt.nav,
    normalized: Math.round((pt.nav / baseNav) * 10000) / 100
  }));
}

/**
 * Aligns 2 or 3 schemes on common observation dates for normalized comparative charting.
 * @param {Record<string, Array<{ date: string, nav: number }>>} schemesHistoryMap map of schemeCode -> observations
 * @param {string} startDate horizon start date
 * @returns {{ alignedDates: string[], seriesByScheme: Record<string, Array<{ date: string, nav: number, normalized: number }>> }}
 */
export function alignComparativeHistory(schemesHistoryMap, startDate) {
  const codes = Object.keys(schemesHistoryMap);
  if (codes.length === 0) return { alignedDates: [], seriesByScheme: {} };

  // Sanitize each series filtered to >= startDate
  const cleanMap = {};
  for (const code of codes) {
    cleanMap[code] = sanitizeAndSortNavHistory(schemesHistoryMap[code]).filter(o => o.date >= startDate);
  }

  // Find intersection of dates where every scheme has an observation
  const dateSets = codes.map(c => new Set(cleanMap[c].map(o => o.date)));
  const commonDates = Array.from(dateSets[0]).filter(d => dateSets.every(set => set.has(d)));
  commonDates.sort();

  const seriesByScheme = {};
  for (const code of codes) {
    const obsMap = new Map(cleanMap[code].map(o => [o.date, o.nav]));
    const baseNav = obsMap.get(commonDates[0]);
    if (!baseNav) {
      seriesByScheme[code] = [];
      continue;
    }

    seriesByScheme[code] = commonDates.map(date => {
      const nav = obsMap.get(date);
      return {
        date,
        nav,
        normalized: Math.round((nav / baseNav) * 10000) / 100
      };
    });
  }

  return {
    alignedDates: commonDates,
    seriesByScheme
  };
}
