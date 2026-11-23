// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createSourceReceipt } from '../../contracts/sourceReceipt.js';
import { macroStore } from '../macro/macroStore.js';
import { fxClient } from '../macro/fxClient.js';
import { fundStore } from '../funds/fundStore.js';
import { fundClient } from '../funds/fundClient.js';
import { healthStore } from './healthStore.js';
import { buildInitialSourceStates } from './sourceHealthEngine.js';
import { evaluateMarketQuality } from './honestMarketGrading.js';
import { recordMarketSourceObservation, recordMarketSourceFailure } from './marketSourceRecorder.js';
import { readReceiptsLog } from './receiptsLedger.js';

function receiptFor(sourceId, providerAsOf) {
  const fund = sourceId === 'mfapi';
  const result = createSourceReceipt({
    sourceId,
    publisher: fund ? 'MFapi' : 'Frankfurter',
    accessMode: 'DIRECT_ON_DEMAND',
    rights: 'BROWSER_DIRECT_CONDITIONAL',
    state: 'READY',
    validity: 'VALID',
    providerClockGranularity: 'day',
    providerAsOf,
    originalUrl: fund ? 'https://api.mfapi.in/mf/123456/latest'
      : 'https://api.frankfurter.dev/v2/rate/omr/inr',
    transportStatus: 200,
    requestedAt: new Date().toISOString(),
    checkedAt: new Date().toISOString()
  });
  expect(result.ok).toBe(true);
  return result.receipt;
}

describe('Market R3B local provenance integration', () => {
  beforeEach(() => {
    localStorage.clear();
    healthStore.refresh();
    macroStore.init();
    fundStore.init();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    healthStore.refresh();
    macroStore.init();
    fundStore.init();
  });

  it('does not call an empty receipt ledger verified or functionally certified', () => {
    const quality = evaluateMarketQuality({
      sourceStates: buildInitialSourceStates(), receipts: []
    });
    expect(quality.dimensions.freshness.status).toBe('NOT_CHECKED');
    expect(quality.dimensions.functionalHealth.status).toBe('NOT_CHECKED');
    expect(quality.honestSummary.overallHealthStatus).toBe('NOT_CHECKED');
  });

  it('records actual FX and NAV provider receipts without background polling', async () => {
    const observationDay = new Date().toISOString().slice(0, 10);
    const fxReceipt = receiptFor('frankfurter', observationDay);
    vi.spyOn(fxClient, 'fetchLatestRate').mockResolvedValueOnce({
      base: 'OMR', quote: 'INR', rate: 220, date: observationDay,
      payload: { base: 'OMR', quote: 'INR', rate: 220, date: observationDay },
      checkedAt: Date.now(), receipt: fxReceipt
    });
    await macroStore.fetchRate('OMR', 'INR', { force: true });
    let snapshot = healthStore.getSnapshot();
    expect(snapshot.sourceStates.frankfurter.requestStatus).toBe('REQUESTED');
    expect(snapshot.sourceStates.frankfurter.providerAsOf).toBe(observationDay);
    expect(snapshot.sourceStates.frankfurter.lastResult).toBe('SUCCESS');

    const navReceipt = receiptFor('mfapi', observationDay);
    vi.spyOn(fundClient, 'fetchLatestNav').mockResolvedValueOnce({
      schemeCode: '123456', schemeName: 'Test Fund', nav: 52,
      date: observationDay, receipt: navReceipt, checkedAt: Date.now()
    });
    await fundStore.fetchSchemeNav('123456', { force: true });
    snapshot = healthStore.getSnapshot();
    expect(snapshot.sourceStates.mfapi.providerAsOf).toBe(observationDay);
    expect(snapshot.sourceStates.mfapi.lastResult).toBe('SUCCESS');
    expect(snapshot.receiptsSummary.validReceiptCount).toBe(2);
  });

  it('logs a failed refresh without losing the last qualified provider date', async () => {
    const date = new Date().toISOString().slice(0, 10);
    vi.spyOn(fxClient, 'fetchLatestRate')
      .mockResolvedValueOnce({
        base: 'OMR', quote: 'INR', rate: 220, date,
        payload: { base: 'OMR', quote: 'INR', rate: 220, date },
        checkedAt: Date.now(), receipt: receiptFor('frankfurter', date)
      })
      .mockRejectedValueOnce(Object.assign(new Error('HTTP 429'), { status: 429 }));
    await macroStore.fetchRate('OMR', 'INR', { force: true });
    await expect(macroStore.fetchRate('OMR', 'INR', { force: true })).rejects.toThrow();
    const snapshot = healthStore.getSnapshot();
    const state = snapshot.sourceStates.frankfurter;
    expect(state.lastResult).toBe('REQUEST_FAILED');
    expect(state.reasonCode).toBe('HTTP_429');
    expect(state.providerAsOf).toBe(date);
    expect(snapshot.receipts[0].receipt.state).toBe('FAILED');
    expect(snapshot.qualityEvaluation.dimensions.functionalHealth.status).toBe('WARN');
  });

  it('retains authentic dated history and marks undated searches unverified', () => {
    const today = new Date().toISOString().slice(0, 10);
    const historic = recordMarketSourceObservation({
      sourceId: 'frankfurter', state: 'HISTORICAL', providerAsOf: today,
      sourceUrl: 'https://api.frankfurter.dev/v2/rates?base=omr&quotes=inr'
    });
    expect(historic.ok).toBe(true);
    const list = recordMarketSourceObservation({
      sourceId: 'mfapi', state: 'UNVERIFIED',
      sourceUrl: 'https://api.mfapi.in/mf/search?q=Private%20User%20Query'
    });
    expect(list.ok).toBe(true);
    const state = healthStore.getSnapshot().sourceStates.mfapi;
    expect(state.observationStatus).toBe('UNVERIFIED');
    expect(state.providerAsOf).toBeNull();
    expect(JSON.stringify(healthStore.getSnapshot().receipts)).not.toContain('Private%20User%20Query');
  });

  it('keeps aborted requests out of provider failure metrics', () => {
    const result = recordMarketSourceFailure('frankfurter', { name: 'AbortError' });
    expect(result.skipped).toBe('ABORTED');
    expect(healthStore.getSnapshot().receipts).toHaveLength(0);
  });

  it('records a provider 429 once and skips fund searches blocked by local cooldown', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 429, headers: new Headers() });
    try {
      const providerError = await fundClient.searchFunds('Index Fund', { fetchImpl }).catch(error => error);
      expect(recordMarketSourceFailure('mfapi', providerError).ok).toBe(true);
      const blockedError = await fundClient.searchFunds('Index Fund', { fetchImpl }).catch(error => error);
      expect(blockedError.status).toBe(429);
      expect(recordMarketSourceFailure('mfapi', blockedError)).toEqual({ ok: false, skipped: 'LOCAL_COOLDOWN' });

      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const snapshot = healthStore.getSnapshot();
      expect(snapshot.receipts).toHaveLength(1);
      expect(snapshot.sourceStates.mfapi.lastTransportStatus).toBe(429);
    } finally {
      fundClient.clearCooldown();
    }
  });

  it('handles blocked receipt storage access without throwing', () => {
    const storage = { getItem: () => { throw new Error('SecurityError'); } };
    expect(readReceiptsLog(storage)).toEqual({ records: [], corrupt: true });
  });
});
