// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { fundClient } from './fundClient.js';
import { FUND_HISTORY_STORAGE_KEY, fundStore } from './fundStore.js';

describe('Market R3A — MFapi cooldown and NAV recovery', () => {
  beforeEach(() => {
    localStorage.clear();
    fundClient.clearCooldown();
    fundStore.init();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fundClient.clearCooldown();
    localStorage.clear();
    fundStore.init();
  });

  it('prevents fund-name searches while provider cooldown is active', async () => {
    const now = Date.now();
    fundClient.setCooldown(120, now);
    const fetchImpl = vi.fn();
    await expect(fundClient.searchFunds('Axis Bluechip', { fetchImpl }))
      .rejects.toMatchObject({ status: 429 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('retains the dated NAV when an explicit refresh fails', async () => {
    const verified = {
      schemeCode: '123456', schemeName: 'Test Fund', nav: 52.13,
      date: '2026-11-20', delivery: 'provider', checkedAt: Date.now()
    };
    const transport = vi.spyOn(fundClient, 'fetchLatestNav');
    transport.mockResolvedValueOnce(verified).mockRejectedValueOnce(new Error('offline'));
    await fundStore.fetchSchemeNav('123456', { force: true });
    await expect(fundStore.fetchSchemeNav('123456', { force: true })).rejects.toThrow('offline');
    const item = fundStore.getSnapshot().navByCode['123456'];
    expect(item.status).toBe('error');
    expect(item.value).toEqual(verified);
    expect(item.value.date).toBe('2026-11-20');
    expect(item.error).toContain('offline');
  });

  it('retains the newer NAV after a CORS failure and an older bounded history response', async () => {
    const now = Date.UTC(2026, 10, 23, 12);
    const code = '125497';
    const prior = {
      schemeCode: code, schemeName: 'Test Fund', nav: 120,
      date: '2026-11-22', delivery: 'provider', checkedAt: now
    };
    const original = fundClient.fetchLatestNav.bind(fundClient);
    const latest = vi.spyOn(fundClient, 'fetchLatestNav');
    const historyFetch = vi.fn(async url => {
      if (url.endsWith('/latest')) throw new TypeError('Failed to fetch');
      return { ok: true, status: 200, json: async () => ({
        status: 'SUCCESS', meta: { scheme_code: Number(code), scheme_name: 'Test Fund' },
        data: [{ date: '18-11-2026', nav: '118' }]
      }) };
    });
    latest.mockResolvedValueOnce(prior)
      .mockImplementationOnce(() => original(code, { now, fetchImpl: historyFetch }))
      .mockResolvedValueOnce({ ...prior, date: '2026-11-23', nav: 121 });

    await fundStore.fetchSchemeNav(code, { force: true });
    await expect(fundStore.fetchSchemeNav(code, { force: true })).rejects.toThrow('older NAV');
    expect(historyFetch).toHaveBeenCalledTimes(2);
    expect(fundStore.getSnapshot().navByCode[code]).toMatchObject({ status: 'error', value: prior });
    await expect(fundStore.fetchSchemeNav(code)).resolves.toMatchObject({ date: '2026-11-23', nav: 121 });
  });

  it('honors a newer durable history date when the scheme has no in-memory NAV', async () => {
    const code = '125497';
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const cached = { schemeName: 'Test Fund', latestDate: today, latestNav: 122, checkedAt: Date.now() };
    localStorage.setItem(FUND_HISTORY_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, schemes: { [code]: cached } }));
    fundStore.init();
    vi.spyOn(fundClient, 'fetchLatestNav').mockResolvedValue({
      schemeCode: code, date: yesterday, nav: 117, checkedAt: Date.now()
    });

    await expect(fundStore.fetchSchemeNav(code, { force: true })).rejects.toThrow('older NAV');
    expect(fundStore.getSnapshot().navByCode[code]).toMatchObject({
      status: 'error', value: { date: today, nav: 122, checkedAt: cached.checkedAt }
    });
  });
});
