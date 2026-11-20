/**
 * Storage contract only: WP-00 does not migrate or mutate browser storage.
 * Feature owners consume immutable keys; WP-09 implements safe write/rollback.
 */
export const MARKET_LEGACY_STORAGE_KEYS = Object.freeze({
  watchlist:'nw7.india-watchlist.v1',
  funds:'nw7.market-saved-funds.v1',
  indexPins:'nw7.market-index-pins.v1',
  settings:'dailyEventAI_settings'
});
export const MARKET_R21_STORAGE_KEYS = Object.freeze({
  portfolio:'nw7.market-portfolio.v1',
  receipts:'nw7.market-source-receipts.v1',
  watchlistV2:'nw7.market-watchlist.v2',
  selectedFundHistory:'nw7.market-fund-history.v1'
});
export const MARKET_STORAGE_RULES = Object.freeze({
  preserveLegacyKeys:true,
  noAutomaticDestructiveMigration:true,
  noPublicQuoteCache:true,
  noHoldingsInTelemetry:true,
  maxSavedEquities:12,
  maxSavedFunds:12,
  maxSourceReceipts:100,
  maxHistorySchemes:12,
  maxHistoryObservationsPerScheme:4000
});
