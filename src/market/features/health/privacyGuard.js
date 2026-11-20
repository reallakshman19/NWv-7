/**
 * NWv7 Market Desk R2.1 - WP-09 Privacy Guardian & Allowlist Exporter
 *
 * Implements strict allowlist-only diagnostic serialization,
 * query-parameter stripping for exported URLs,
 * and honest disclosure of the third-party script trust boundary.
 *
 * Guarantees:
 * 1. noHoldingsInTelemetry: true (MARKET_STORAGE_RULES).
 * 2. Personal portfolio transaction records and holdings are NEVER ingested or exported.
 * 3. Does not use fragile key-blacklisting (which fails on nested or renamed properties);
 *    uses a strict schema-allowlist constructor.
 * 4. Transparent disclosure of the unverified third-party script boundary (TradingView embed).
 */

export const PRIVACY_DISCLOSURE = Object.freeze({
  portfolioStorage: 'LOCAL_BROWSER_ONLY',
  telemetryStatus: 'ZERO_NWV7_TELEMETRY',
  thirdPartyBoundary: 'EXTERNAL_SCRIPTS_PRESENT_IN_DOM',
  badgeText: 'Portfolio stored locally in this browser. Diagnostic exports exclude portfolio records. Third-party integration privacy verification pending.',
  trustBoundaryNotes: Object.freeze([
    'NWv7 transmits zero analytics or telemetry payloads to any remote server.',
    'User portfolio transactions and holdings are stored exclusively in browser localStorage.',
    'External scripts (such as TradingView market quote embeds) execute in the main document origin and have technical access to browser APIs.',
    'Full script isolation (e.g. sandboxed iframe) is pending coordinator integration in WP-10.'
  ])
});

/**
 * Strips all query parameters, search strings, credentials, and hash fragments from a URL.
 * Retains only origin + pathname.
 */
export function sanitizeSourceUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return null;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return null;
  }
}

/**
 * Strict allowlist-only diagnostic report serializer.
 * Explicitly ignores any personal portfolio data.
 */
export function serializeHealthDiagnostics({
  appVersion = '7.0.0',
  sourceStates = [],
  storageSummary = {},
  receiptsSummary = {}
} = {}) {
  // Allowlisted source representations
  const allowlistedSources = (Array.isArray(sourceStates) ? sourceStates : []).map(s => {
    if (!s || typeof s !== 'object') return null;
    return {
      sourceId: String(s.sourceId || ''),
      publisher: String(s.publisher || ''),
      accessMode: String(s.accessMode || ''),
      rights: String(s.rights || ''),
      state: String(s.state || 'UNKNOWN'),
      lastChecked: typeof s.lastChecked === 'string' ? s.lastChecked : null,
      providerAsOf: typeof s.providerAsOf === 'string' ? s.providerAsOf : null,
      transportStatus: Number.isInteger(s.transportStatus) ? s.transportStatus : null,
      reasonCode: typeof s.reasonCode === 'string' ? s.reasonCode : null
    };
  }).filter(Boolean);

  // Allowlisted storage summary
  const safeStorage = {
    knownPayloadBytes: Number.isFinite(storageSummary?.knownPayloadBytes)
      ? Number(storageSummary.knownPayloadBytes)
      : 0,
    estimatedOriginQuotaBytes: Number.isFinite(storageSummary?.estimatedOriginQuotaBytes)
      ? Number(storageSummary.estimatedOriginQuotaBytes)
      : null,
    itemCounts: {
      watchlistV2: Number(storageSummary?.itemCounts?.['nw7.market-watchlist.v2'] || 0),
      legacyWatchlist: Number(storageSummary?.itemCounts?.['nw7.india-watchlist.v1'] || 0),
      savedFunds: Number(storageSummary?.itemCounts?.['nw7.market-saved-funds.v1'] || 0),
      receipts: Number(storageSummary?.itemCounts?.['nw7.market-source-receipts.v1'] || 0)
    }
  };

  // Allowlisted receipts summary
  const safeReceipts = {
    retainedCount: Number(receiptsSummary?.retainedCount || 0),
    discardedCount: Number(receiptsSummary?.discardedCount || 0),
    oldestRetainedClock: typeof receiptsSummary?.oldestRetainedClock === 'string'
      ? receiptsSummary.oldestRetainedClock
      : null,
    newestRetainedClock: typeof receiptsSummary?.newestRetainedClock === 'string'
      ? receiptsSummary.newestRetainedClock
      : null
  };

  const payload = {
    schemaVersion: 1,
    appVersion: String(appVersion),
    generatedAt: new Date().toISOString(),
    privacyNotice: PRIVACY_DISCLOSURE.badgeText,
    sources: allowlistedSources,
    storage: safeStorage,
    receiptsSummary: safeReceipts
  };

  return JSON.stringify(payload, null, 2);
}

/**
 * Validates that an arbitrary JSON diagnostic payload does not contain private portfolio keys.
 */
export function assertPayloadHasNoPortfolioData(jsonString) {
  if (typeof jsonString !== 'string') return false;
  const privatePatterns = [
    'nw7.market-portfolio.v1',
    '"lots"',
    '"cashTransactions"',
    '"purchasePrice"',
    '"unitCost"',
    '"portfolioId"'
  ];
  for (const pat of privatePatterns) {
    if (jsonString.includes(pat)) return false;
  }
  return true;
}
