/**
 * NWv7 Market Desk R2.1 - WP-06 World Bank WDI Transport Client
 * Direct on-demand integration with the World Bank Open Data API.
 * Validates country, indicator identity, CC BY-4.0 license metadata,
 * observation year granularity, and component-level error isolation.
 */

import { isAllowedMarketSourceUrl, getMarketSource } from '../../contracts/index.js';
import { createSourceReceipt } from '../../contracts/sourceReceipt.js';

export const WORLDBANK_SOURCE_ID = 'world-bank';

export const WDI_INDICATORS = Object.freeze({
  GDP_GROWTH: Object.freeze({
    id: 'NY.GDP.MKTP.KD.ZG',
    name: 'GDP Growth',
    unit: '%',
    frequency: 'Annual',
    description: 'Annual percentage growth rate of GDP at market prices based on constant local currency.',
    license: 'CC BY-4.0'
  }),
  INFLATION: Object.freeze({
    id: 'FP.CPI.TOTL.ZG',
    name: 'Consumer Price Inflation',
    unit: '%',
    frequency: 'Annual',
    description: 'Inflation measured by the consumer price index reflects annual percentage change in the cost to the average consumer.',
    license: 'CC BY-4.0'
  })
});

export const SUPPORTED_MACRO_COUNTRIES = Object.freeze([
  { code: 'IND', name: 'India', flag: '🇮🇳' },
  { code: 'OMN', name: 'Oman', flag: '🇴🇲' }
]);

export class MacroClient {
  /**
   * Fetches annual macroeconomic indicator observations from World Bank WDI API.
   *
   * @param {string} countryCode e.g. 'IND' or 'OMN'
   * @param {string} indicatorCode e.g. 'NY.GDP.MKTP.KD.ZG'
   * @param {{ signal?: AbortSignal, fetchImpl?: typeof fetch, now?: number }} options
   * @returns {Promise<object>}
   */
  async fetchIndicator(countryCode = 'IND', indicatorCode = WDI_INDICATORS.GDP_GROWTH.id, { signal, fetchImpl = fetch, now = Date.now() } = {}) {
    const cCode = String(countryCode).trim().toUpperCase();
    const indCode = String(indicatorCode).trim();

    const requestStartedIso = new Date(now).toISOString();

    const url = `https://api.worldbank.org/v2/country/${encodeURIComponent(cCode)}/indicator/${encodeURIComponent(indCode)}?format=json&per_page=50`;
    if (!isAllowedMarketSourceUrl(WORLDBANK_SOURCE_ID, url)) {
      throw new Error(`Disallowed source URL host for World Bank: ${url}`);
    }

    const res = await fetchImpl(url, { signal });
    const transportStatus = res.status;

    if (!res.ok) {
      const err = new Error(`World Bank API request failed with HTTP ${transportStatus}`);
      err.status = transportStatus;
      throw err;
    }

    const payload = await res.json();
    if (!Array.isArray(payload) || payload.length < 2) {
      throw new Error(`Invalid response structure from World Bank API for ${cCode}/${indCode}`);
    }

    const metadata = payload[0] || {};
    const rawRows = Array.isArray(payload[1]) ? payload[1] : [];

    if (rawRows.length === 0) {
      throw new Error(`No observations found for ${cCode}/${indCode}`);
    }

    const validRowsByYear = new Map();

    for (const row of rawRows) {
      if (!row || typeof row !== 'object') continue;

      // Verify exact country and indicator identity
      const rowCountry = String(row.countryiso3code || '').toUpperCase();
      const rowIndicator = String(row.indicator?.id || '');

      if (rowCountry !== cCode || rowIndicator !== indCode) {
        continue;
      }

      const yearStr = String(row.date || '').trim();
      if (!/^\d{4}$/.test(yearStr)) continue;

      const rawVal = row.value;
      if (rawVal === null || rawVal === undefined || rawVal === '') continue;

      const numVal = Number(rawVal);
      // Valid observations include negative values (e.g. GDP contraction, deflation) and zero
      if (!Number.isFinite(numVal)) continue;

      validRowsByYear.set(yearStr, {
        year: yearStr,
        value: Math.round(numVal * 100) / 100
      });
    }

    if (validRowsByYear.size === 0) {
      throw new Error(`No qualified observations found for ${cCode}/${indCode}`);
    }

    // Sort chronologically year ASC
    const observations = Array.from(validRowsByYear.values())
      .sort((a, b) => Number(a.year) - Number(b.year));

    const latestObs = observations[observations.length - 1];

    const sourceDef = getMarketSource(WORLDBANK_SOURCE_ID);
    const checkedAtIso = new Date().toISOString();

    // Check if contract has amended rights (OPEN_LICENSE_CONFIRMED) or frozen NO_PUBLICATION
    const isLicenseConfirmed = sourceDef?.rights === 'OPEN_LICENSE_CONFIRMED';
    const receiptState = isLicenseConfirmed ? 'READY' : 'NO_RIGHTS';
    const receiptRights = isLicenseConfirmed ? 'OPEN_LICENSE_CONFIRMED' : 'NO_PUBLICATION';
    const reasonCode = isLicenseConfirmed ? null : 'LICENSE_AMENDMENT_PENDING_WP10';

    const receiptResult = createSourceReceipt({
      sourceId: WORLDBANK_SOURCE_ID,
      publisher: 'World Bank',
      accessMode: 'LICENSED_OPEN_DATA',
      rights: receiptRights,
      state: receiptState,
      validity: 'VALID',
      providerClockGranularity: 'year',
      providerAsOf: latestObs.year,
      requestedAt: requestStartedIso,
      checkedAt: checkedAtIso,
      originalUrl: url,
      transportStatus: 200,
      reasonCode,
      dataVersion: metadata.lastupdated || 'wdi-v1'
    });

    const indicatorMeta = Object.values(WDI_INDICATORS).find(i => i.id === indCode) || {
      id: indCode,
      name: payload[1]?.[0]?.indicator?.value || indCode,
      unit: '%',
      frequency: 'Annual',
      license: 'CC BY-4.0'
    };

    return {
      countryCode: cCode,
      indicatorId: indCode,
      indicatorName: indicatorMeta.name,
      unit: indicatorMeta.unit,
      frequency: indicatorMeta.frequency,
      latestYear: latestObs.year,
      latestValue: latestObs.value,
      observations,
      lastUpdated: metadata.lastupdated || null,
      license: 'CC BY-4.0',
      sourceAttribution: 'World Bank, World Development Indicators',
      receipt: receiptResult.ok ? receiptResult.receipt : null,
      checkedAt: now
    };
  }
}

export const macroClient = new MacroClient();
