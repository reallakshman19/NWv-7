// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { macroStore, OMR_INR_STORAGE_KEY } from './macro/macroStore.js';
import { fxClient } from './macro/fxClient.js';
import { evaluateFxObservation, canConvertFxRate } from './macro/fxFreshness.js';
import { fundClient } from './funds/fundClient.js';
import { fundStore } from './funds/fundStore.js';
import { healthStore } from './health/healthStore.js';

const NOW = Date.UTC(2026, 10, 22, 12, 0, 0);
const makeRate = (date = '2026-11-22', rate = 220) => ({
  base: 'OMR', quote: 'INR', date, rate, checkedAt: NOW,
  payload: { base: 'OMR', quote: 'INR', date, rate }
});
const navPayload = (nav = '892.45600', date = '20-11-2026') => ({
  status: 'SUCCESS',
  meta: {
    scheme_code: 125497,
    scheme_name: 'HDFC Top 100 Fund - Direct Plan - Growth',
    fund_house: 'HDFC Mutual Fund',
    scheme_category: 'Equity'
  },
  data: [{ nav, date }]
});
const fakeResponse = (payload, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => status === 429 ? '60' : null },
  json: async () => payload
});

describe('Market R3D source recovery and cache expiry controls', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    fundClient.clearCooldown();
    macroStore.init();
    fundStore.init();
    healthStore.refresh();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    fundClient.clearCooldown();
    macroStore.init();
    fundStore.init();
    healthStore.refresh();
  });

  it('does not promote an expired provider FX observation because it was checked minutes ago, then recovers', async () => {
    const stale = makeRate('2026-11-10');
    localStorage.setItem(OMR_INR_STORAGE_KEY, JSON.stringify({
      payload: stale.payload, checkedAt: NOW - 30000
    }));
    macroStore.init();
    const cached = macroStore.getSnapshot().ratesByPair['OMR/INR'].value;
    expect(cached.freshness).toBe('EXPIRED');
    expect(canConvertFxRate(cached, NOW)).toBe(false);
    const fetched = vi.spyOn(fxClient, 'fetchLatestRate').mockResolvedValueOnce(makeRate());
    await macroStore.fetchRate('OMR', 'INR');
    expect(fetched).toHaveBeenCalledOnce();
    const recovered = macroStore.getSnapshot().ratesByPair['OMR/INR'].value;
    expect(canConvertFxRate(recovered, NOW)).toBe(true);
    expect(recovered.date).toBe('2026-11-22');
  });

  it('fails closed for invalid or future provider dates, while dated warnings retain their true status', () => {
    expect(evaluateFxObservation('2026-11-22', NOW).freshness).toBe('FRESH');
    expect(evaluateFxObservation('2026-11-20', NOW).freshness).toBe('DATED_WARNING');
    expect(evaluateFxObservation('2026-11-17', NOW).freshness).toBe('EXPIRED');
    expect(evaluateFxObservation('2026-02-30', NOW)).toBeNull();
    expect(evaluateFxObservation('2026-11-24', NOW)).toBeNull();
  });

  it('validates real MFapi response schema for matching scheme identity and source date', async () => {
    const mock = vi.fn(async () => fakeResponse(navPayload()));
    const item = await fundClient.fetchLatestNav('125497', { fetchImpl: mock, now: NOW });
    expect(item.schemeCode).toBe('125497');
    expect(item.date).toBe('2026-11-20');
    expect(item.receipt?.providerAsOf).toBe('2026-11-20');
    expect(item.receipt?.state).toBe('READY');
    expect(item.delivery).toBe('provider');
    expect(mock).toHaveBeenCalledOnce();

    const mismatched = async () => fakeResponse({
      ...navPayload(), meta: { ...navPayload().meta, scheme_code: 125498 }
    });
    await expect(fundClient.fetchLatestNav('125497', { fetchImpl: mismatched, now: NOW }))
      .rejects.toThrow(/SCHEME_CODE_MISMATCH/);
  });

  it('honors HTTP 429 cooldown across NAV and search; recovery follows an explicit clear/expiry', async () => {
    const rateLimited = vi.fn(async () => fakeResponse({}, 429));
    await expect(fundClient.fetchLatestNav('125497', { fetchImpl: rateLimited, now: NOW }))
      .rejects.toMatchObject({ status: 429 });
    expect(fundClient.isCoolingDown(NOW)).toBe(true);
    const mustNotFetch = vi.fn();
    await expect(fundClient.searchFunds('HDFC', { fetchImpl: mustNotFetch }))
      .rejects.toMatchObject({ status: 429 });
    expect(mustNotFetch).not.toHaveBeenCalled();
    fundClient.clearCooldown();
    const recovered = await fundClient.fetchLatestNav('125497', {
      fetchImpl: async () => fakeResponse(navPayload()), now: NOW
    });
    expect(recovered.schemeCode).toBe('125497');
  });

  it('keeps the previous source-dated NAV after an error and replaces it only on successful recovery', async () => {
    const original = {
      schemeCode: '125497', schemeName: 'HDFC',
      nav: 100, date: '2026-11-19', checkedAt: NOW, delivery: 'provider'
    };
    const updated = { ...original, nav: 105, date: '2026-11-20' };
    const fetch = vi.spyOn(fundClient, 'fetchLatestNav');
    fetch.mockResolvedValueOnce(original).mockRejectedValueOnce(new Error('provider offline'))
      .mockResolvedValueOnce(updated);
    await fundStore.fetchSchemeNav('125497', { force: true });
    await expect(fundStore.fetchSchemeNav('125497', { force: true }))
      .rejects.toThrow('provider offline');
    const failed = fundStore.getSnapshot().navByCode['125497'];
    expect(failed.status).toBe('error');
    expect(failed.value.nav).toBe(100);
    expect(failed.value.date).toBe('2026-11-19');
    await fundStore.fetchSchemeNav('125497', { force: true });
    const recovered = fundStore.getSnapshot().navByCode['125497'];
    expect(recovered.status).toBe('ready');
    expect(recovered.value.nav).toBe(105);
    expect(recovered.value.date).toBe('2026-11-20');
  });

  it('does not reuse future-dated checkedAt from imported NAV history cache', () => {
    fundStore.state.historyCache['125497'] = {
      schemeCode: '125497', latestNav: 100,
      latestDate: '2026-11-19', checkedAt: NOW + 10000
    };
    expect(fundStore.readCachedNav('125497', NOW)).toBeNull();
    fundStore.state.historyCache['125497'].checkedAt = NOW - 1000;
    expect(fundStore.readCachedNav('125497', NOW)?.delivery).toBe('cache');
  });
});
