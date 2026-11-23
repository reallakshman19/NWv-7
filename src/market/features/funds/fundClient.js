/**
 * NWv7 Market Desk R2.1 - WP-05 MFapi Transport Client & Source Receipts
 * Direct-from-browser on-demand HTTP client for MFapi.
 *
 * Rules:
 * 1. Strictly validates host against MARKET_SOURCE_HOSTS['mfapi'] (api.mfapi.in, www.mfapi.in).
 * 2. Strict scheme identity verification: meta.scheme_code MUST match requested code.
 * 3. Immutable WP-00 source receipt generation with original providerAsOf clock.
 * 4. HTTP 429 defensive cooldown management (respects Retry-After or 15m default).
 * 5. Rejects future-dated or non-positive NAV observations fail-closed.
 */

import { canonicalFundCode } from '../../contracts/instrumentIdentity.js';
import { isAllowedMarketSourceUrl } from '../../registry/sourceRegistry.js';
import { createSourceReceipt } from '../../contracts/sourceReceipt.js';
import { normalizeDateToIso, sanitizeAndSortNavHistory } from './fundMath.js';

export const MFAPI_SOURCE_ID = 'mfapi';
export const DEFAULT_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes local fallback
export const MAX_HISTORY_OBSERVATIONS = 4000;

class FundClient {
  constructor() {
    this.cooldownUntil = 0;
  }

  isCoolingDown(now = Date.now()) {
    return now < this.cooldownUntil;
  }

  getCooldownRemainingSeconds(now = Date.now()) {
    return Math.max(0, Math.ceil((this.cooldownUntil - now) / 1000));
  }

  setCooldown(retryAfterSeconds = null, now = Date.now()) {
    const duration = (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0)
      ? retryAfterSeconds * 1000
      : DEFAULT_COOLDOWN_MS;
    this.cooldownUntil = now + duration;
  }

  clearCooldown() {
    this.cooldownUntil = 0;
  }

  /**
   * Search Indian mutual fund schemes by name or fund house.
   * @param {string} query 
   * @param {{ signal?: AbortSignal, fetchImpl?: typeof fetch }} options 
   * @returns {Promise<Array<{ schemeCode: string, schemeName: string }>>}
   */
  async searchFunds(query, { signal, fetchImpl = fetch } = {}) {
    if (this.isCoolingDown()) {
      const err = new Error(`NAV provider cooldown active for ${this.getCooldownRemainingSeconds()}s.`);
      err.status = 429;
      err.isLocalCooldown = true;
      throw err;
    }
    const cleaned = String(query || '').trim().replace(/\s+/g, ' ').slice(0, 120);
    if (cleaned.length < 3) {
      throw new Error('Enter at least three characters to search funds');
    }

    const url = `https://api.mfapi.in/mf/search?q=${encodeURIComponent(cleaned)}`;
    if (!isAllowedMarketSourceUrl(MFAPI_SOURCE_ID, url)) {
      throw new Error('Disallowed source URL host for MFapi search');
    }

    const res = await fetchImpl(url, { signal });
    if (res.status === 429) {
      const retryAfter = Number(res.headers?.get?.('Retry-After')) || null;
      this.setCooldown(retryAfter);
      const err = new Error('NAV provider rate-limited requests. Retry later.');
      err.status = 429;
      throw err;
    }

    if (!res.ok) {
      throw new Error(`Fund search transport failure (HTTP ${res.status})`);
    }

    const data = await res.json();
    if (!Array.isArray(data)) {
      throw new Error('Malformed search response from MFapi');
    }

    const validRows = [];
    for (const row of data) {
      const code = canonicalFundCode(row?.schemeCode);
      const name = typeof row?.schemeName === 'string' ? row.schemeName.trim() : '';
      if (code && name) {
        validRows.push({ schemeCode: code, schemeName: name });
      }
      if (validRows.length >= 20) break;
    }

    return validRows;
  }

  /**
   * Fetches latest NAV for a scheme code and builds an immutable source receipt.
   * Enforces strict scheme identity check: meta.scheme_code must equal requested code.
   *
   * @param {string} code 
   * @param {{ signal?: AbortSignal, fetchImpl?: typeof fetch, now?: number }} options 
   * @returns {Promise<object>}
   */
  async fetchLatestNav(code, { signal, fetchImpl = fetch, now = Date.now() } = {}) {
    const canonicalCode = canonicalFundCode(code);
    if (!canonicalCode) {
      throw new Error(`Invalid fund scheme code format: ${code}`);
    }

    if (this.isCoolingDown(now)) {
      const remaining = this.getCooldownRemainingSeconds(now);
      const err = new Error(`NAV provider rate-limited requests. Cooldown active for ${remaining}s.`);
      err.status = 429;
      err.isLocalCooldown = true;
      throw err;
    }

    const url = `https://api.mfapi.in/mf/${canonicalCode}/latest`;
    if (!isAllowedMarketSourceUrl(MFAPI_SOURCE_ID, url)) {
      throw new Error(`Disallowed source URL host for scheme ${canonicalCode}`);
    }

    const res = await fetchImpl(url, { signal });
    if (res.status === 429) {
      const retryAfter = Number(res.headers?.get?.('Retry-After')) || null;
      this.setCooldown(retryAfter, now);
      const err = new Error('NAV provider rate-limited requests. Retry later.');
      err.status = 429;
      throw err;
    }

    if (!res.ok) {
      throw new Error(`NAV transport request failed (HTTP ${res.status})`);
    }

    const payload = await res.json();
    if (payload?.status !== 'SUCCESS' || !payload?.meta) {
      throw new Error(`MFapi returned unsuccessful payload status for scheme ${canonicalCode}`);
    }

    // STRICT IDENTITY VERIFICATION (P0-01)
    const returnedMetaCode = canonicalFundCode(payload.meta.scheme_code);
    if (returnedMetaCode !== canonicalCode) {
      throw new Error(
        `SCHEME_CODE_MISMATCH: Requested scheme code ${canonicalCode} but provider returned ${returnedMetaCode}`
      );
    }

    const row = payload.data?.[0];
    if (!row) {
      throw new Error(`No NAV data row returned for scheme ${canonicalCode}`);
    }

    const nav = typeof row.nav === 'number' ? row.nav : Number(row.nav);
    if (!Number.isFinite(nav) || nav <= 0) {
      throw new Error(`Invalid or non-positive NAV value (${row.nav}) for scheme ${canonicalCode}`);
    }

    const isoDate = normalizeDateToIso(row.date);
    if (!isoDate) {
      throw new Error(`Invalid calendar date format (${row.date}) for scheme ${canonicalCode}`);
    }

    const [y, m, d] = isoDate.split('-').map(Number);
    const dateUtcMs = Date.UTC(y, m - 1, d);
    if (dateUtcMs > now + 5 * 60 * 1000) {
      throw new Error(`NAV source date is in the future (${isoDate}) for scheme ${canonicalCode}`);
    }

    const schemeName = String(payload.meta.scheme_name || '').trim();
    if (!schemeName) {
      throw new Error(`Missing scheme name in provider metadata for ${canonicalCode}`);
    }

    // Detect plan and option
    const nameUpper = schemeName.toUpperCase();
    const plan = nameUpper.includes('DIRECT') ? 'Direct' : (nameUpper.includes('REGULAR') ? 'Regular' : 'Standard');
    const isIdcw = nameUpper.includes('IDCW') || nameUpper.includes('DIVIDEND') || nameUpper.includes('INCOME DISTRIBUTION');
    const option = isIdcw ? 'IDCW' : 'Growth';

    // Build immutable WP-00 source receipt
    const receiptOutcome = createSourceReceipt({
      sourceId: MFAPI_SOURCE_ID,
      accessMode: 'DIRECT_ON_DEMAND',
      rights: 'BROWSER_DIRECT_CONDITIONAL',
      publisher: 'MFapi',
      state: 'READY',
      validity: 'VALID',
      providerClockGranularity: 'day',
      providerAsOf: isoDate,
      requestedAt: new Date(now).toISOString(),
      checkedAt: new Date().toISOString(),
      transportStatus: 200,
      originalUrl: url,
      dataVersion: 'v1'
    });

    return {
      schemeCode: canonicalCode,
      schemeName,
      category: payload.meta.scheme_category || 'Mutual Fund',
      fundHouse: payload.meta.fund_house || '',
      schemeType: payload.meta.scheme_type || 'Open Ended Schemes',
      plan,
      option,
      isIdcw,
      nav: Math.round(nav * 10000) / 10000,
      date: isoDate,
      rawDate: row.date,
      receipt: receiptOutcome.ok ? receiptOutcome.receipt : null,
      delivery: 'provider',
      checkedAt: now
    };
  }

  /**
   * Fetches full historical NAV series from MFapi.
   * Enforces strict scheme identity verification, parses chronological observations,
   * and caps retention at MAX_HISTORY_OBSERVATIONS (4,000 points, newest retained).
   *
   * @param {string} code 
   * @param {{ signal?: AbortSignal, fetchImpl?: typeof fetch, now?: number }} options 
   * @returns {Promise<object>}
   */
  async fetchFundHistory(code, { signal, fetchImpl = fetch, now = Date.now() } = {}) {
    const canonicalCode = canonicalFundCode(code);
    if (!canonicalCode) {
      throw new Error(`Invalid fund scheme code format: ${code}`);
    }

    if (this.isCoolingDown(now)) {
      const remaining = this.getCooldownRemainingSeconds(now);
      const err = new Error(`NAV provider rate-limited requests. Cooldown active for ${remaining}s.`);
      err.status = 429;
      err.isLocalCooldown = true;
      throw err;
    }

    const url = `https://api.mfapi.in/mf/${canonicalCode}`;
    if (!isAllowedMarketSourceUrl(MFAPI_SOURCE_ID, url)) {
      throw new Error(`Disallowed source URL host for scheme ${canonicalCode}`);
    }

    const res = await fetchImpl(url, { signal });
    if (res.status === 429) {
      const retryAfter = Number(res.headers?.get?.('Retry-After')) || null;
      this.setCooldown(retryAfter, now);
      const err = new Error('NAV provider rate-limited requests. Retry later.');
      err.status = 429;
      throw err;
    }

    if (!res.ok) {
      throw new Error(`Historical NAV transport request failed (HTTP ${res.status})`);
    }

    const payload = await res.json();
    if (payload?.status !== 'SUCCESS' || !payload?.meta) {
      throw new Error(`MFapi returned unsuccessful status for historical scheme ${canonicalCode}`);
    }

    // STRICT IDENTITY VERIFICATION (P0-01)
    const returnedMetaCode = canonicalFundCode(payload.meta.scheme_code);
    if (returnedMetaCode !== canonicalCode) {
      throw new Error(
        `SCHEME_CODE_MISMATCH: Requested scheme code ${canonicalCode} but provider returned ${returnedMetaCode}`
      );
    }

    const rawData = Array.isArray(payload.data) ? payload.data : [];
    if (rawData.length === 0) {
      throw new Error(`Empty historical NAV series returned for scheme ${canonicalCode}`);
    }

    // Parse and sanitize observations (chronological date ASC)
    const sorted = sanitizeAndSortNavHistory(rawData);
    if (sorted.length === 0) {
      throw new Error(`No valid historical NAV observations found for scheme ${canonicalCode}`);
    }

    // Enforce 4,000-point ceiling: retain newest 4,000 points
    let observations = sorted;
    let truncated = false;
    if (observations.length > MAX_HISTORY_OBSERVATIONS) {
      observations = observations.slice(observations.length - MAX_HISTORY_OBSERVATIONS);
      truncated = true;
    }

    const schemeName = String(payload.meta.scheme_name || '').trim();
    const nameUpper = schemeName.toUpperCase();
    const plan = nameUpper.includes('DIRECT') ? 'Direct' : (nameUpper.includes('REGULAR') ? 'Regular' : 'Standard');
    const isIdcw = nameUpper.includes('IDCW') || nameUpper.includes('DIVIDEND') || nameUpper.includes('INCOME DISTRIBUTION');
    const option = isIdcw ? 'IDCW' : 'Growth';

    const latestObs = observations[observations.length - 1];
    const firstObs = observations[0];

    // Build immutable WP-00 source receipt with HISTORICAL state
    const receiptOutcome = createSourceReceipt({
      sourceId: MFAPI_SOURCE_ID,
      accessMode: 'DIRECT_ON_DEMAND',
      rights: 'BROWSER_DIRECT_CONDITIONAL',
      publisher: 'MFapi',
      state: 'HISTORICAL',
      validity: 'VALID',
      providerClockGranularity: 'day',
      providerAsOf: latestObs.date,
      requestedAt: new Date(now).toISOString(),
      checkedAt: new Date().toISOString(),
      transportStatus: 200,
      originalUrl: url,
      dataVersion: 'v1'
    });

    return {
      schemeCode: canonicalCode,
      schemeName,
      category: payload.meta.scheme_category || 'Mutual Fund',
      fundHouse: payload.meta.fund_house || '',
      schemeType: payload.meta.scheme_type || 'Open Ended Schemes',
      plan,
      option,
      isIdcw,
      observations,
      firstCachedDate: firstObs.date,
      lastCachedDate: latestObs.date,
      latestNav: latestObs.nav,
      latestDate: latestObs.date,
      totalReturnedObservations: rawData.length,
      cachedObservationCount: observations.length,
      truncated,
      fullHistoryVerified: !truncated && rawData.length < MAX_HISTORY_OBSERVATIONS,
      receipt: receiptOutcome.ok ? receiptOutcome.receipt : null,
      delivery: 'provider',
      checkedAt: now
    };
  }
}

export const fundClient = new FundClient();
