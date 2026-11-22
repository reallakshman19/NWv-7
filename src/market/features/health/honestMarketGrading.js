/**
 * NWv7 Market Desk R2.1 - WP-09 Multi-Dimensional Market Data Grading Adapter
 *
 * Replaces the legacy auditMarketTabQuality flaw where missing quote feeds
 * were awarded a false "Grade A" due to `ok !== false` logic.
 *
 * Guarantees:
 * 1. Multi-dimensional evaluation: separates legal Policy Compliance from native Data Availability.
 * 2. Intentional absence of unlicensed quotes is NOT penalized as a policy failure.
 * 3. Pure adapter: does NOT modify shared code directly; delivers non-destructive integration for WP-10.
 */

export function evaluateMarketQuality({
  sourceStates = {},
  receipts = [],
  dataCoverage = {},
  now = Date.now()
} = {}) {
  // 1. Policy Compliance: 100% adherence to free/open terms, zero unauthorized exchange scraping
  let unauthorizedAttempts = 0;
  const complianceNotes = [];

  for (const [id, state] of Object.entries(sourceStates)) {
    if (state.accessMode === 'UNAUTHORIZED_PUBLICATION') {
      unauthorizedAttempts++;
      complianceNotes.push(`Source ${id} violates publication rights.`);
    }
    if (id === 'world-bank' && state.observationStatus === 'READY') {
      // World Bank requires licensing review before publication
      unauthorizedAttempts++;
      complianceNotes.push('World Bank published without active license clearance.');
    }
  }

  const policyCompliance = {
    id: 'policy-compliance',
    label: 'Open-License & Policy Compliance',
    status: unauthorizedAttempts === 0 ? 'PASS' : 'FAIL',
    score: unauthorizedAttempts === 0 ? 100 : 0,
    detail: unauthorizedAttempts === 0
      ? 'No publication-policy violations detected in registered local states; independent license compliance has not been certified.'
      : `${unauthorizedAttempts} policy violation(s) detected.`
  };

  // 2. Data Availability: Actual qualified native observation counts
  const indicesCount = Number(dataCoverage?.indicesCount || 0);
  const moversCount = Number(dataCoverage?.moversCount || 0);
  const fundsCount = Number(dataCoverage?.fundsCount || 0);
  const currenciesCount = Number(dataCoverage?.currenciesCount || 0);

  const nativeQuotesAvailable = indicesCount >= 4 && moversCount >= 2;
  const dataAvailability = {
    id: 'data-availability',
    label: 'Native Observation Coverage',
    status: nativeQuotesAvailable ? 'PASS' : indicesCount > 0 ? 'WARN' : 'LIMITED_FREE_TIER',
    indicesCoverage: `${indicesCount}/4 qualified indices`,
    moversCoverage: `${moversCount}/2 mover lists`,
    fundsCoverage: `${fundsCount} fund scheme(s)`,
    currenciesCoverage: `${currenciesCount} currency rate(s)`,
    detail: nativeQuotesAvailable
      ? 'Full native quote coverage active.'
      : 'Native exchange quotes are intentionally restricted under open/free licensing; official links provided.'
  };

  // 3. Observation freshness is about the LAST provider observation per
  // source, not the age of every entry in a bounded audit history.
  const sourceList = Object.values(sourceStates);
  const datedSources = sourceList.filter(source => typeof source?.providerAsOf === 'string');
  const failedSources = sourceList.filter(source => source?.lastResult === 'REQUEST_FAILED');
  let staleCount = 0;
  let missingClockCount = 0;
  for (const source of datedSources) {
    // Year-only publication clocks do not support an hourly SLA assertion.
    if (source.providerClockGranularity === 'year') {
      missingClockCount++;
      continue;
    }
    const parsed = Date.parse(source.providerAsOf);
    if (!Number.isFinite(parsed) || parsed > now + 5 * 60 * 1000) {
      missingClockCount++;
      continue;
    }
    if (now - parsed > 72 * 60 * 60 * 1000) staleCount++;
  }

  const freshness = {
    id: 'observation-freshness',
    label: 'Provider Observation Freshness',
    status: datedSources.length === 0 ? 'NOT_CHECKED'
      : staleCount > 0 || missingClockCount > 0 ? 'WARN' : 'PASS',
    observedCount: datedSources.length,
    staleCount,
    missingClockCount,
    detail: datedSources.length === 0
      ? 'No dated provider observations recorded on this device.'
      : staleCount > 0 || missingClockCount > 0
        ? `${staleCount} dated observation(s) over 72h; ${missingClockCount} observation clock(s) too coarse or invalid.`
        : `${datedSources.length} source(s) have recorded observations within 72h. No current reachability check is implied.`
  };

  // 4. No synthetic functional PASS: this passive panel has no dedicated
  // browser, storage round-trip, or live-provider functional certification.
  const functionalHealth = {
    id: 'functional-health',
    label: 'Functional & Storage Health',
    status: failedSources.length > 0 ? 'WARN' : 'NOT_CHECKED',
    failedSourceCount: failedSources.length,
    detail: failedSources.length > 0
      ? `${failedSources.length} source request(s) most recently failed; prior dated values may remain visible.`
      : 'Functional and storage checks have not been independently executed by this passive monitor.'
  };

  // 5. A receipt is evidence of a bounded local event, not proof of coverage
  // across all market workflows or continuing live reachability.
  const validReceipts = (Array.isArray(receipts) ? receipts : []).filter(r => r?.receipt);
  const diagnosticCompleteness = {
    id: 'diagnostic-completeness',
    label: 'Local Request Evidence',
    status: validReceipts.length > 0 ? 'RECORDED' : 'NOT_CHECKED',
    detail: validReceipts.length > 0
      ? `${validReceipts.length} source request receipt(s) retained locally (max 100; not independently audited).`
      : 'No provider request receipts recorded on this device.'
  };

  return {
    schemaVersion: 1,
    evaluatedAt: new Date(now).toISOString(),
    dimensions: {
      policyCompliance,
      dataAvailability,
      freshness,
      functionalHealth,
      diagnosticCompleteness
    },
    honestSummary: {
      isFullyPolicyCompliant: policyCompliance.status === 'PASS',
      hasNativeExchangeQuotes: nativeQuotesAvailable,
      overallHealthStatus: unauthorizedAttempts > 0 ? 'FAIL'
        : freshness.status === 'NOT_CHECKED' ? 'NOT_CHECKED'
        : functionalHealth.status === 'WARN' || freshness.status === 'WARN' ? 'ATTENTION' : 'OBSERVED'
    }
  };
}
