// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { fundClient } from './fundClient.js';
import { fundStore } from './fundStore.js';

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
});
