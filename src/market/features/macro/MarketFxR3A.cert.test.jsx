// @vitest-environment jsdom
import React from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { macroStore } from './macroStore.js';
import { fxClient } from './fxClient.js';
import { canConvertFxRate, evaluateFxObservation } from './fxFreshness.js';
import { FXQuickConverter } from './FXQuickConverter.jsx';
import { CurrencyMacroPanel } from './CurrencyMacroPanel.jsx';

const NOW = Date.UTC(2026, 10, 22, 12);
const observation = (base, date = '2026-11-22') => ({
  base, quote: 'INR', rate: base === 'OMR' ? 220 : 88, date,
  ...(base === 'USD' ? { referenceProvider: 'ecb' } : {}),
  payload: { base, quote: 'INR', rate: base === 'OMR' ? 220 : 88, date,
    ...(base === 'USD' ? { referenceProvider: 'ecb' } : {}) },
  checkedAt: NOW
});

describe('Market R3A — FX freshness, conversion and concurrency regressions', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    localStorage.clear();
    macroStore.init();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    macroStore.init();
    vi.restoreAllMocks();
  });

  it('classifies based on the provider observation and rejects malformed/future dates', () => {
    expect(evaluateFxObservation('2026-11-22', NOW)?.freshness).toBe('FRESH');
    expect(evaluateFxObservation('2026-11-20', NOW)?.freshness).toBe('DATED_WARNING');
    expect(evaluateFxObservation('2026-11-13', NOW)?.freshness).toBe('EXPIRED');
    expect(evaluateFxObservation('2026-02-30', NOW)).toBeNull();
    expect(evaluateFxObservation('2026-11-24', NOW)).toBeNull();
    expect(canConvertFxRate(observation('OMR', '2026-11-13'), NOW)).toBe(false);
    expect(canConvertFxRate(observation('OMR', '2026-11-20'), NOW)).toBe(true);
  });

  it('does not upgrade an expired observation when its cache was checked minutes ago', () => {
    localStorage.setItem('nw7.omr-inr.frankfurter.v1', JSON.stringify({
      payload: observation('OMR', '2026-11-13').payload, checkedAt: NOW - 5 * 60_000
    }));
    macroStore.init();
    const entry = macroStore.getSnapshot().ratesByPair['OMR/INR'];
    expect(entry.status).toBe('ready');
    expect(entry.value.freshness).toBe('EXPIRED');
    expect(entry.value.isHistorical).toBe(true);
  });

  it.each([
    ['empty', null, 1],
    ['fresh ECB', { referenceProvider: 'ecb', date: '2026-11-22' }, 0],
    ['fresh legacy blend', { date: '2026-11-22' }, 1],
    ['fresh explicitly non-ECB', { referenceProvider: 'blend', date: '2026-11-22' }, 1],
    ['expired ECB', { referenceProvider: 'ecb', date: '2026-11-18' }, 1]
  ])('qualifies automatic USD/INR lookup with %s cache', async (_label, cached, expectedCalls) => {
    if (cached) localStorage.setItem('nw7.usd-inr.frankfurter.v1', JSON.stringify({
      payload: { base: 'USD', quote: 'INR', rate: 81, ...cached }, checkedAt: NOW - 1000
    }));
    macroStore.init();
    if (cached && cached.referenceProvider !== 'ecb') {
      expect(macroStore.getSnapshot().ratesByPair['USD/INR']).toBeUndefined();
    }
    const fetch = vi.spyOn(fxClient, 'fetchLatestRate').mockResolvedValue(observation('USD'));
    const result = await macroStore.fetchRate('USD', 'INR');
    expect(fetch).toHaveBeenCalledTimes(expectedCalls);
    expect(result.referenceProvider).toBe('ecb');
    expect(result.rate).toBe(expectedCalls ? 88 : 81);
    expect(macroStore.getSnapshot().ratesByPair['USD/INR'].value.referenceProvider).toBe('ecb');
  });

  it('never restores a legacy USD/INR blend if the authorized lookup fails', async () => {
    const raw = JSON.stringify({
      payload: { base: 'USD', quote: 'INR', rate: 81, date: '2026-11-22' }, checkedAt: NOW - 1000
    });
    localStorage.setItem('nw7.usd-inr.frankfurter.v1', raw);
    macroStore.init();
    const fetch = vi.spyOn(fxClient, 'fetchLatestRate').mockRejectedValue(new Error('offline'));
    await expect(macroStore.fetchRate('USD', 'INR')).rejects.toThrow('offline');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(macroStore.getSnapshot().ratesByPair['USD/INR']).toMatchObject({ status: 'error' });
    expect(macroStore.getSnapshot().ratesByPair['USD/INR'].value).toBeUndefined();
    // Do not rewrite legacy storage as an ECB-derived rate.
    expect(localStorage.getItem('nw7.usd-inr.frankfurter.v1')).toBe(raw);
  });

  it('rechecks in-memory provenance and excludes unqualified fallback data', async () => {
    // Seed the pre-fix in-memory shape independently of storage admission.
    const unqualified = { base: 'USD', quote: 'INR', rate: 81, date: '2026-11-22' };
    macroStore.state.ratesByPair['USD/INR'] = { status: 'ready', value: unqualified };
    const fetch = vi.spyOn(fxClient, 'fetchLatestRate').mockRejectedValue(new Error('offline'));
    await expect(macroStore.fetchRate('USD', 'INR')).rejects.toThrow('offline');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(macroStore.getSnapshot().ratesByPair['USD/INR'].value).toBeUndefined();
  });

  it('rejects an unqualified USD/INR response before storing it', async () => {
    const result = observation('USD');
    delete result.referenceProvider;
    delete result.payload.referenceProvider;
    vi.spyOn(fxClient, 'fetchLatestRate').mockResolvedValue(result);
    await expect(macroStore.fetchRate('USD', 'INR')).rejects.toThrow('ECB-derived reference');
    expect(macroStore.getSnapshot().ratesByPair['USD/INR'].value).toBeUndefined();
    expect(localStorage.getItem('nw7.usd-inr.frankfurter.v1')).toBeNull();
  });

  it('settles both FX pairs when independent responses complete out of order', async () => {
    const deferred = {};
    vi.spyOn(fxClient, 'fetchLatestRate').mockImplementation(base =>
      new Promise(resolve => { deferred[base] = resolve; })
    );
    const omr = macroStore.fetchRate('OMR', 'INR', { force: true });
    const usd = macroStore.fetchRate('USD', 'INR', { force: true });
    expect(macroStore.getSnapshot().ratesByPair['OMR/INR'].status).toBe('loading');
    deferred.USD(observation('USD'));
    await usd;
    deferred.OMR(observation('OMR'));
    await omr;
    const result = macroStore.getSnapshot().ratesByPair;
    expect(result['USD/INR'].status).toBe('ready');
    expect(result['OMR/INR'].status).toBe('ready');
    expect(result['OMR/INR'].value.rate).toBe(220);
  });

  it('retains original expired status after a failed refresh', async () => {
    const fetch = vi.spyOn(fxClient, 'fetchLatestRate');
    fetch.mockResolvedValueOnce(observation('OMR', '2026-11-13'))
      .mockRejectedValueOnce(new Error('offline'));
    await macroStore.fetchRate('OMR', 'INR', { force: true });
    await expect(macroStore.fetchRate('OMR', 'INR', { force: true })).rejects.toThrow('offline');
    const record = macroStore.getSnapshot().ratesByPair['OMR/INR'].value;
    expect(record.date).toBe('2026-11-13');
    expect(record.freshness).toBe('EXPIRED');
    expect(record.warning).toContain('Rate refresh failed');
  });

  it.each([
    ['quick', FXQuickConverter],
    ['desk', CurrencyMacroPanel]
  ])('%s converter displays an expired observation but never computes with it', (label, Component) => {
    localStorage.setItem('nw7.omr-inr.frankfurter.v1', JSON.stringify({
      payload: observation('OMR', '2026-11-13').payload, checkedAt: NOW - 60_000
    }));
    macroStore.init();
    const { container } = render(React.createElement(Component));
    expect(container.textContent).toContain(label === 'quick' ? 'Currency Reference' : 'Currency & FX Reference Desk');
    expect(container.querySelector('.fx-result-box')?.textContent?.trim()).toBe('—');
    expect(container.textContent).toContain('Expired Rate');
  });
});
