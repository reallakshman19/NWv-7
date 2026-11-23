import React from 'react';
import { evaluateFxObservation } from './fxFreshness.js';
import { SUPPORTED_CURRENCY_PAIRS, formatRateBenchmark } from './fxMath.js';
import { useMacroStore } from './macroStore.js';

const CBO_URL = 'https://cbo.gov.om/Pages/DFESearch.aspx';
const ECB_URL = 'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html';

export function MarketFxRates() {
  const { state, actions } = useMacroStore();
  return (
    <ul className="md3-source-list" aria-label="Dated currency references">
      {SUPPORTED_CURRENCY_PAIRS.map(({ id, base, quote, label }) => {
        const item = state.ratesByPair[id];
        const rate = item?.value;
        const isChecking = item?.status === 'loading';
        const freshness = evaluateFxObservation(rate?.date);
        const source = base === 'OMR' ? CBO_URL : ECB_URL;
        return (
          <li key={id} className="md3-source-observation">
            <strong>{label}</strong>
            {rate && (
              <span>
                {formatRateBenchmark(rate.rate, base, quote)} ·{' '}
                <time dateTime={rate.date}>{rate.date}</time>
                {' · '}{rate.referenceProvider === 'ecb' ? 'ECB-derived cross via Frankfurter' : 'Frankfurter blended reference'}
                {freshness?.freshness === 'EXPIRED' && ' · Historical only'}
                {freshness?.freshness === 'DATED_WARNING' && ' · Dated reference'}
              </span>
            )}
            {item?.error && <span role="status">{rate ? 'Refresh failed. Showing the retained rate.' : 'Rate unavailable.'}</span>}
            <div className="md3-source-actions">
              <button type="button" className="portfolio-btn portfolio-btn-secondary btn-xs" disabled={isChecking}
                onClick={() => actions.fetchRate(base, quote, { force: true }).catch(() => {})}>
                {isChecking ? 'Checking ' + label + '…' : (item?.error ? 'Retry ' : rate ? 'Refresh ' : 'Check ') + label}
              </button>
              <a href={source} target="_blank" rel="noopener noreferrer">
                {base === 'OMR' ? 'Official CBO rates' : 'Official ECB references'}
              </a>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
