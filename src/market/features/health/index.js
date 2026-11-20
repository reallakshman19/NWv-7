/**
 * NWv7 Market Desk R2.1 - WP-09 Data Health, Rights, Cache & Privacy Barrel
 */

import './health.css';

export { HealthPanel } from './HealthPanel.jsx';
export { SourceHealthCard } from './SourceHealthCard.jsx';
export { ReceiptsAuditPanel } from './ReceiptsAuditPanel.jsx';
export { StoragePrivacyPanel } from './StoragePrivacyPanel.jsx';
export { ClearCacheModal } from './ClearCacheModal.jsx';

export { healthStore } from './healthStore.js';
export {
  buildInitialSourceStates,
  hydrateSourceStates,
  applyReceiptToSourceState,
  ALL_SOURCE_IDS
} from './sourceHealthEngine.js';
export {
  readReceiptsLog,
  appendReceiptRecord,
  getReceiptsLogSummary,
  clearReceiptsLog,
  processReceiptCandidate,
  RECORD_CLASSES,
  MAX_RETAINED_RECEIPTS,
  RECEIPTS_LOG_STORAGE_KEY
} from './receiptsLedger.js';
export {
  previewWatchlistMigration,
  executeWatchlistMigration,
  rollbackWatchlistMigration,
  checkRollbackEligibility,
  getNormalizedSavedFunds,
  getStorageUsageSummary,
  computeFingerprint,
  MIGRATION_JOURNAL_KEY,
  CACHE_KEYS_ALLOWLIST,
  PROTECTED_KEYS_ALLOWLIST
} from './storageManager.js';
export {
  PRIVACY_DISCLOSURE,
  sanitizeSourceUrl,
  serializeHealthDiagnostics,
  assertPayloadHasNoPortfolioData
} from './privacyGuard.js';
export { evaluateMarketQuality } from './honestMarketGrading.js';
