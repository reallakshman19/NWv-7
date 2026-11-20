/**
 * NWv7 Market Desk R2.1 - WP-05 Mutual Funds Barrel Exports
 */

export { FundsPanel } from './FundsPanel.jsx';
export { FundSummary } from './FundSummary.jsx';
export { FundNavChart, CHART_RANGES } from './FundNavChart.jsx';
export { FundCompareModal } from './FundCompareModal.jsx';
export { FundSipModal } from './FundSipModal.jsx';

export {
  fundStore,
  useFundStore,
  SAVED_FUNDS_STORAGE_KEY,
  FUND_HISTORY_STORAGE_KEY,
  MAX_CONCURRENT_REQUESTS,
  MAX_HISTORY_SCHEMES,
  MAX_OBSERVATIONS_PER_SCHEME,
  getIstDayKey,
  sanitizeCsvCell,
  desanitizeCsvCell
} from './fundStore.js';

export {
  fundClient,
  MFAPI_SOURCE_ID,
  DEFAULT_COOLDOWN_MS,
  MAX_HISTORY_OBSERVATIONS
} from './fundClient.js';

export {
  normalizeDateToIso,
  calendarDayDiff,
  subtractCalendarPeriod,
  sanitizeAndSortNavHistory,
  calculateTrailingReturns,
  calculateMaxDrawdown,
  calculateAnnualizedVolatility,
  rebaseSeriesToBase100,
  alignComparativeHistory,
  DAYS_PER_YEAR
} from './fundMath.js';

export {
  computeFundSip,
  referenceCalcSip
} from './fundSipAdapter.js';
