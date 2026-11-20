/**
 * NWv7 Market Desk R2.1 - WP-06 Currency and Macro Feature Module
 * Canonical barrel export for FX Converter, Macro Desk, and data clients.
 */

export { CurrencyMacroPanel } from './CurrencyMacroPanel.jsx';
export { FXQuickConverter } from './FXQuickConverter.jsx';
export { MacroChart } from './MacroChart.jsx';

export {
  FxClient,
  fxClient,
  FRANKFURTER_SOURCE_ID,
  FRESHNESS_WINDOW_MS,
  EXPIRY_WINDOW_MS
} from './fxClient.js';

export {
  MacroClient,
  macroClient,
  WORLDBANK_SOURCE_ID,
  WDI_INDICATORS,
  SUPPORTED_MACRO_COUNTRIES
} from './macroClient.js';

export {
  macroStore,
  useMacroStore,
  OMR_INR_STORAGE_KEY,
  USD_INR_STORAGE_KEY
} from './macroStore.js';

export {
  SUPPORTED_CURRENCY_PAIRS,
  sanitizeCurrencyAmount,
  convertBaseToQuote,
  convertQuoteToBase,
  calculateConversion,
  formatCurrencyDisplay,
  formatRateBenchmark,
  subtractCalendarDays
} from './fxMath.js';
