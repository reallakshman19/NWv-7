/**
 * NWv7 Market Desk R2.1 - WP-06 Frankfurter v2 Transport Client
 * Handles on-demand reference rates, historical series acquisition,
 * two-tier freshness enforcement (36h/72h), and immutable source receipts.
 */

import { acquireQualifiedReference, projectReferenceObservation } from '../../services/referenceAcquisition.js';
import { isAllowedMarketSourceUrl } from '../../contracts/index.js';
import { createSourceReceipt, isSourceClock } from '../../contracts/sourceReceipt.js';
import { evaluateFxObservation } from './fxFreshness.js';
export { FRESHNESS_WINDOW_MS, EXPIRY_WINDOW_MS } from './fxFreshness.js';

export const FRANKFURTER_SOURCE_ID = 'frankfurter';

export class FxClient {
  /**
   * Fetches latest benchmark exchange rate for a currency pair from Frankfurter v2.
   *
   * @param {string} base e.g. 'OMR' or 'USD'
   * @param {string} quote e.g. 'INR'
   * @param {{ signal?: AbortSignal, fetchImpl?: typeof fetch, now?: number }} options
   * @returns {Promise<object>}
   */
  async fetchLatestRate(base = 'OMR', quote = 'INR', { signal, fetchImpl = fetch, now = Date.now() } = {}) {
    const b = String(base).trim().toUpperCase(), q = String(quote).trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(b) || !/^[A-Z]{3}$/.test(q) || b === q) throw new Error('Invalid currency pair');
    const endpoint = 'https://api.frankfurter.dev/v2/rate/' + b.toLowerCase() + '/' + q.toLowerCase();
    const request = {
      sourceId:FRANKFURTER_SOURCE_ID,action:'BROWSER_FETCH',kind:'FX_REFERENCE',
      instrument:{instrumentId:'FX:' + b + '/' + q,type:'FX',currency:q,displayName:b + '/' + q},
      url:b === 'USD' && q === 'INR' ? endpoint + '?providers=ecb' : endpoint
    };
    return acquireQualifiedReference(request, deadline => this.acquireLatestRate(b,q,{signal:deadline,fetchImpl,now}), {
      signal, project:item => projectReferenceObservation(request,item,item.rate)
    });
  }

  async acquireLatestRate(base = 'OMR', quote = 'INR', { signal, fetchImpl = fetch, now = Date.now() } = {}) {
    const canonicalBase = String(base).trim().toUpperCase();
    const canonicalQuote = String(quote).trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(canonicalBase) || !/^[A-Z]{3}$/.test(canonicalQuote) || canonicalBase === canonicalQuote) {
      throw new Error('Invalid currency pair');
    }

    const requestStartedMs = now;
    const requestStartedIso = new Date(requestStartedMs).toISOString();

    const referenceProvider = canonicalBase === 'USD' && canonicalQuote === 'INR' ? 'ecb' : null;
    const endpoint = `https://api.frankfurter.dev/v2/rate/${canonicalBase.toLowerCase()}/${canonicalQuote.toLowerCase()}`;
    const url = referenceProvider ? endpoint + '?providers=' + referenceProvider : endpoint;
    if (!isAllowedMarketSourceUrl(FRANKFURTER_SOURCE_ID, url)) {
      throw new Error(`Disallowed source URL host for Frankfurter: ${url}`);
    }

    const res = await fetchImpl(url, { signal: signal ?? AbortSignal.timeout(8000) });
    const transportStatus = res.status;

    if (!res.ok) {
      const err = new Error(`Frankfurter rate transport failed with HTTP ${transportStatus}`);
      err.status = transportStatus;
      throw err;
    }

    const payload = await res.json();

    // Verify payload schema
    const rate = Number(payload?.rate);
    const date = payload?.date;
    const returnedBase = String(payload?.base || '').toUpperCase();
    const returnedQuote = String(payload?.quote || '').toUpperCase();

    if (returnedBase !== canonicalBase || returnedQuote !== canonicalQuote) {
      throw new Error(`Currency pair mismatch: requested ${canonicalBase}/${canonicalQuote} but received ${returnedBase}/${returnedQuote}`);
    }

    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error(`Invalid non-positive exchange rate returned for ${canonicalBase}/${canonicalQuote}`);
    }

    const classification = evaluateFxObservation(date, now);
    if (!classification) {
      const candidateAsOf = typeof date === 'string' ? Date.parse(`${date}T00:00:00Z`) : NaN;
      if (Number.isFinite(candidateAsOf) && candidateAsOf > now + 300000) {
        throw new Error(`Provider clock is in the future: ${date}`);
      }
      throw new Error(`Invalid or malformed provider observation date: ${date}`);
    }
    const { asOf, freshness, stale, isHistorical, warning, receiptState } = classification;

    const checkedAtIso = new Date().toISOString();

    const receiptResult = createSourceReceipt({
      sourceId: FRANKFURTER_SOURCE_ID,
      publisher: 'Frankfurter',
      accessMode: 'DIRECT_ON_DEMAND',
      rights: 'BROWSER_DIRECT_CONDITIONAL',
      state: receiptState,
      validity: 'VALID',
      providerClockGranularity: 'day',
      providerAsOf: date,
      requestedAt: requestStartedIso,
      checkedAt: checkedAtIso,
      originalUrl: url,
      transportStatus: 200,
      dataVersion: 'frankfurter-v2'
    });

    return {
      base: canonicalBase,
      quote: canonicalQuote,
      rate,
      date,
      referenceProvider,
      asOf,
      freshness,
      stale,
      isHistorical,
      warning,
      receipt: receiptResult.ok ? receiptResult.receipt : null,
      checkedAt: requestStartedMs,
      payload: {
        date,
        base: canonicalBase,
        quote: canonicalQuote,
        rate,
        ...(referenceProvider && { referenceProvider })
      }
    };
  }

  /**
   * Fetches historical exchange rate time series from Frankfurter v2.
   * Expects a flat array of `{ date, base, quote, rate }` objects.
   *
   * @param {string} startDate YYYY-MM-DD
   * @param {string} endDate YYYY-MM-DD
   * @param {string} base e.g. 'OMR' or 'USD'
   * @param {string} quote e.g. 'INR'
   * @param {{ signal?: AbortSignal, fetchImpl?: typeof fetch, now?: number }} options
   * @returns {Promise<Array<{ date: string, rate: number }>>}
   */
  async fetchRateHistory(startDate, endDate, base = 'OMR', quote = 'INR', { signal, fetchImpl = fetch } = {}) {
    const canonicalBase = String(base).trim().toUpperCase();
    const canonicalQuote = String(quote).trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(canonicalBase) || !/^[A-Z]{3}$/.test(canonicalQuote) || canonicalBase === canonicalQuote) {
      throw new Error('Invalid currency pair');
    }

    if (!isSourceClock(startDate,'day') || !isSourceClock(endDate,'day') || startDate > endDate) {
      throw new Error('Invalid FX history date range');
    }
    const url = `https://api.frankfurter.dev/v2/rates?from=${startDate}&to=${endDate}&base=${canonicalBase.toLowerCase()}&quotes=${canonicalQuote.toLowerCase()}`;
    if (!isAllowedMarketSourceUrl(FRANKFURTER_SOURCE_ID, url)) {
      throw new Error(`Disallowed source URL host for Frankfurter: ${url}`);
    }

    const res = await fetchImpl(url, { signal });
    if (!res.ok) {
      throw new Error(`Frankfurter history transport failed with HTTP ${res.status}`);
    }

    const raw = await res.json();
    if (!Array.isArray(raw)) {
      throw new Error('Frankfurter v2 historical response is not a valid array');
    }

    const validByDate = new Map();

    for (const row of raw) {
      if (!row || typeof row !== 'object') continue;
      const d = String(row.date || '').trim();
      const r = Number(row.rate);

      if (row.base !== canonicalBase || row.quote !== canonicalQuote) throw new Error('Historical currency pair mismatch');
      if (!isSourceClock(d,'day') || d < startDate || d > endDate) throw new Error('Historical rate outside qualified date range');
      if (!Number.isFinite(r) || r <= 0) continue;

      // Deduplicate identical dates, reject conflicting duplicates
      if (validByDate.has(d)) {
        const existingRate = validByDate.get(d);
        if (Math.abs(existingRate - r) > 0.0001) {
          throw new Error(`Conflicting rates returned for date ${d}: ${existingRate} vs ${r}`);
        }
        continue;
      }

      validByDate.set(d, r);
    }

    if (validByDate.size === 0) {
      throw new Error(`No valid historical rates returned for interval ${startDate} to ${endDate}`);
    }

    // Sort chronologically date ASC
    const sorted = Array.from(validByDate.entries())
      .map(([date, rate]) => ({ date, rate }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    return sorted;
  }
}

export const fxClient = new FxClient();
