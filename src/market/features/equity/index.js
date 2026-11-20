/**
 * Canonical exports for WP-03 Equity Research and Watchlist.
 */
export { EquityResearchPanel } from './EquityResearchPanel.jsx';
export { WatchlistSummary } from './WatchlistSummary.jsx';
export {
  createWatchlistStore,
  useWatchlist,
  defaultWatchlistStore,
  WATCHLIST_V2_KEY,
  WATCHLIST_V1_KEY,
} from './watchlistStore.js';
export {
  createNotesStore,
  useEquityNote,
  defaultNotesStore,
  NOTES_STORAGE_KEY,
  MAX_NOTE_LENGTH,
} from './notesStore.js';
export {
  TRACKED_NSE_METADATA,
  TRACKED_SYMBOLS,
  getEquityMetadata,
  getNseQuoteUrl,
  getNseAnnouncementsUrl,
} from './equityMetadata.js';
export {
  validateCustomSymbol,
  toCanonicalKey,
  fromCanonicalKey,
  isFormulaInjection,
  parseWatchlistFile,
  generateWatchlistCsv,
  generateWatchlistJson,
  MAX_WATCHLIST_LIMIT,
  MAX_FILE_SIZE_BYTES,
} from './equityModel.js';
export { ImportPreviewModal } from './ImportPreviewModal.jsx';
