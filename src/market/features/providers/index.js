/**
 * NWv-7 Market Desk R2.1 — WP-02 Provider Displays and Indices Feature Package
 *
 * Provides the opt-in BSE MarketProviderBoard (TradingView embed) and
 * source-aware IndexSectorPanel covering benchmark indices, sectors, and movers.
 */

export { MarketProviderBoard } from './MarketProviderBoard.jsx';
export { IndexSectorPanel } from './IndexSectorPanel.jsx';
export {
  BSE_GROUPS,
  BSE_CATALOG,
  BSE_SUPPORTED_INDICES,
  BSE_SUPPORTED_EQUITIES,
  isSupportedBseSymbol,
  getBseTradingViewUrl,
  getWidgetSymbols,
} from './bseCoverage.js';
