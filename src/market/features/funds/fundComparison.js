import {
  alignComparativeHistory,
  sanitizeAndSortNavHistory,
  calculateTrailingReturns,
  calculateMaxDrawdown,
  calculateAnnualizedVolatility,
  subtractCalendarPeriod
} from './fundMath.js';
import { CHART_RANGES } from './FundNavChart.jsx';

export function buildComparisonOutcome(activeSelectedCodes, historyCache, horizon) {
  if (activeSelectedCodes.length < 2) return null;

  const schemesMap = {};
  for (const code of activeSelectedCodes) {
    const hist = historyCache[code];
    if (hist && Array.isArray(hist.observations) && hist.observations.length > 0) {
      schemesMap[code] = sanitizeAndSortNavHistory(hist.observations);
      if (!schemesMap[code].length) return {isReady:false,missingCode:code};
    } else {
      // Missing history
      return { isReady: false, missingCode: code };
    }
  }

  // Anchor the horizon at the actual latest shared observation, not the
  // minimum of potentially different latest dates.
  const shared = alignComparativeHistory(schemesMap, '1950-01-01');
  if (shared.alignedDates.length < 2) return {isReady:false,reason:'INSUFFICIENT_COMMON_DATES'};
  const minLatestDate = shared.alignedDates.at(-1);

  const rangeConfig = CHART_RANGES.find(r => r.id === horizon) || CHART_RANGES[2];
  const startDate = subtractCalendarPeriod(minLatestDate, {
    months: rangeConfig.months,
    years: rangeConfig.years
  });

  const aligned = alignComparativeHistory(schemesMap, startDate);

  if (aligned.alignedDates.length < 2) return {isReady:false,reason:'INSUFFICIENT_COMMON_DATES'};

  // Compute metrics per scheme over aligned window
  const metricsByScheme = {};
  for (const code of activeSelectedCodes) {
    const obs = aligned.seriesByScheme[code];
    const trailing = calculateTrailingReturns(obs);
    const mdd = calculateMaxDrawdown(obs);
    const vol = calculateAnnualizedVolatility(obs);

    const hist = historyCache[code];
    metricsByScheme[code] = {
      code,
      name: hist.schemeName || `Scheme ${code}`,
      category: hist.category || 'Mutual Fund',
      plan: hist.plan || 'Direct',
      option: hist.option || 'Growth',
      isIdcw: hist.isIdcw || false,
      latestNav: obs.at(-1).nav,
      latestDate: obs.at(-1).date,
      returnPercent: trailing[horizon]?.returnPercent ?? null,
      isCagr: trailing[horizon]?.isCagr ?? false,
      mddPercent: mdd.mddPercent,
      volatilityPercent: vol.volatilityPercent
    };
  }

  return {
    isReady: true,
    alignedDates: aligned.alignedDates,
    seriesByScheme: aligned.seriesByScheme,
    metricsByScheme
  };
}

