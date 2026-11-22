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
  payload: { base, quote: 'INR', rate: base === 'OMR' ? 220 : 88, date },
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
  ])('%s converter displays an expired observation but never computes with it', (_label, Component) => {
    localStorage.setItem('nw7.omr-inr.frankfurter.v1', JSON.stringify({
      payload: observation('OMR', '2026-11-13').payload, checkedAt: NOW - 60_000
    }));
    macroStore.init();
    const { container } = render(<Component />);
    expect(container.querySelector('.fx-result-box')?.textContent?.trim()).toBe('—');
    expect(container.textContent).toContain('Expired Rate');
  });
});
