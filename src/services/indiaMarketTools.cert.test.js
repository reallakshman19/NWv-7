import { describe, expect, it, vi } from 'vitest';
import { normalizeOmrRate, loadOmrRate, convertOmrInr, equityQuoteUrl, searchIndianFunds, loadFundNav, calculateSip, currentNfoRows } from './indiaMarketTools.js';

const NOW = Date.parse('2026-11-16T10:00:00Z');
const fxPayload = { date: '2026-11-16', base: 'OMR', quote: 'INR', rate: 225 };
const ok = value => ({ ok: true, json: async () => value });

describe('India Market free-source tools', () => {
  it('converts in both directions, including zero without accepting invalid inputs', () => {
    expect(convertOmrInr(100, 225)).toBe(22500);
    expect(convertOmrInr(22500, 225, 'INR')).toBe(100);
    expect(convertOmrInr(0, 225)).toBe(0);
    ['', -1, 'bad'].forEach(value => expect(convertOmrInr(value, 225)).toBeNull());
    expect(convertOmrInr(100, undefined)).toBeNull();
  });
  it('rejects incorrect base, negative, undated, future and expired rates', () => {
    expect(normalizeOmrRate(fxPayload, NOW)).toEqual({ rate: 225, asOf: Date.parse('2026-11-16T00:00:00Z'), rateDate:'2026-11-16', stale: false });
    [
      { ...fxPayload, base: 'USD' }, { ...fxPayload, quote:'USD' }, { ...fxPayload, rate:-225 },
      { ...fxPayload, date: 'invalid' },
      { ...fxPayload, date: '2026-11-17' },
      { ...fxPayload, date: '2026-11-12' },
    ].forEach(value => expect(() => normalizeOmrRate(value, NOW)).toThrow());
  });
  it('uses the daily browser cache without extra provider calls', async () => {
    const fetchImpl = vi.fn();
    const result = await loadOmrRate({ now: NOW, fetchImpl, read: () => ({ checkedAt: NOW - 1000, payload: fxPayload }) });
    expect(result.rate).toBe(225); expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('records provider time and caches a successful response', async () => {
    const write = vi.fn(), fetchImpl = vi.fn().mockResolvedValue(ok(fxPayload));
    const result = await loadOmrRate({ now: NOW, fetchImpl, read: () => null, write });
    expect(result.asOf).toBe(Date.parse('2026-11-16T00:00:00Z'));
    expect(write).toHaveBeenCalledWith('nw7.omr-inr.frankfurter.v1', { payload: fxPayload, checkedAt: NOW });
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.frankfurter.dev/v2/rate/omr/inr');
  });
  it('labels retained data stale on source failure and rejects unusably old fallback', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'));
    const result = await loadOmrRate({ now: NOW, fetchImpl, read: () => ({ checkedAt: NOW - 86400001, payload: fxPayload }) });
    expect(result).toMatchObject({ stale: true, warning: expect.stringContaining('failed') });
    await expect(loadOmrRate({ now: NOW, fetchImpl, read: () => null })).rejects.toThrow('offline');
  });
  it('builds only validated NSE symbol links', () => {
    expect(equityQuoteUrl('m&m.ns')).toContain('symbol=M%26M');
    expect(equityQuoteUrl('INFY')).toContain('symbol=INFY');
    ['javascript:alert(1)', 'abc def', '', '../x'].forEach(symbol => expect(equityQuoteUrl(symbol)).toBeNull());
  });
  it('searches only on meaningful input and caps the returned choices', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok(Array.from({ length: 30 }, (_, i) => ({ schemeCode: 100000 + i, schemeName: `Fund ${i}` }))));
    await expect(searchIndianFunds('ab', { fetchImpl })).rejects.toThrow('three');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await searchIndianFunds('HDFC & SBI', { fetchImpl })).toHaveLength(20);
    expect(fetchImpl.mock.calls[0][0]).toContain('HDFC%20%26%20SBI');
  });
  it('uses the real NAV date and flags historical quotes without retimestamping', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ status: 'SUCCESS', meta: { scheme_name: 'Fixture Fund', scheme_category: 'Equity' }, data: [{ nav: '123.4', date: '13-11-2026' }] }));
    expect(await loadFundNav(125497, { fetchImpl, now: NOW })).toMatchObject({ nav: 123.4, date: '13-11-2026', stale: false });
    expect(await loadFundNav(125497, { fetchImpl, now: NOW + 10 * 86400000 })).toMatchObject({ date: '13-11-2026', stale: true });
  });
  it('does not display empty or malformed NAV responses as current prices', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ status: 'SUCCESS', meta: { scheme_name: 'Bad fund' }, data: [{ nav: '-5', date: '31-02-2026' }] }));
    await expect(loadFundNav(125497, { fetchImpl, now: NOW })).rejects.toThrow('valid published NAV');
  });
  it('SIP computes contributed principal correctly and handles zero growth', () => {
    expect(calculateSip(5000, 10, 0)).toEqual({ invested: 600000, value: 600000, gain: 0 });
    const scenario = calculateSip(5000, 1, 12);
    expect(scenario.invested).toBe(60000);
    expect(scenario.value).toBeCloseTo(63412.52, 2);
    expect(calculateSip(-1, 10, 8)).toBeNull();
  });
  it('keeps a closing-day NFO active until India midnight and drops past or undated rows', () => {
    const rows = [
      { name: 'Open', openDate: '2026-11-01', closeDate: '2026-11-16' },
      { name: 'Upcoming', openDate: '17-11-2026', closeDate: '30-11-2026' },
      { name: 'Old', openDate: '2026-07-01', closeDate: '2026-07-31' },
      { name: 'Undated' },
    ];
    expect(currentNfoRows(rows, NOW).map(row => [row.name, row.offerState])).toEqual([['Open', 'Open'], ['Upcoming', 'Upcoming']]);
    expect(currentNfoRows(rows, Date.parse('2026-11-16T18:30:00Z')).map(row => row.name)).toEqual(['Upcoming']);
  });

  it('shows recent dated AMFI announcements without asserting an open subscription', () => {
    const item = { name: 'An AMFI announcement', openDate: '2026-11-15', closeDate: null, source: 'AMFI', status: 'announced' };
    expect(currentNfoRows([item], NOW)[0].offerState).toContain('verify availability');
    expect(currentNfoRows([{ ...item, openDate: '2026-10-01' }], NOW)).toEqual([]);
  });
});


describe('bounded independent Market source requests', () => {
  it('retains provider 429 status without repeated requests', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 429 });
    await expect(loadFundNav('100001', { fetchImpl, now: NOW })).rejects.toMatchObject({ status: 429 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('rejects HTML SPA fallback presented as a successful NAV source', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, headers: { get: () => 'text/html' }, json: async () => ({}) });
    await expect(loadFundNav('100001', { fetchImpl, now: NOW })).rejects.toThrow(/HTML rather than JSON/);
  });
  it('honors cancellation of a pending fund search', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));
    const pending = searchIndianFunds('Nifty Direct', { fetchImpl, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
