import React, { useEffect, useRef, useState } from 'react';
import { canonicalFundCode } from '../../contracts/instrumentIdentity.js';
import { fundClient } from '../funds/fundClient.js';
import { useFundStore } from '../funds/fundStore.js';
import { recordMarketSourceFailure } from '../health/marketSourceRecorder.js';

const AMFI_NAV_URL = 'https://www.amfiindia.com/net-asset-value/nav-download';

export function FundQuickSearch() {
  const { state, actions } = useFundStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [searchStatus, setSearchStatus] = useState('idle');
  const [selected, setSelected] = useState(null);
  const activeSearch = useRef(null);
  useEffect(() => () => activeSearch.current?.abort(), []);

  const load = (code, name, force = false) => {
    activeSearch.current?.abort();
    setSearchStatus('idle');
    setSelected({ code, name });
    void actions.fetchSchemeNav(code, { force, signal: AbortSignal.timeout(8000) }).catch(() => {});
  };

  const onSearch = async event => {
    event.preventDefault();
    const term = query.trim();
    if (term.length < 3) return;
    setResults(null);
    setSelected(null);
    const code = canonicalFundCode(term);
    if (code) {
      load(code, 'Scheme ' + code);
      return;
    }

    activeSearch.current?.abort();
    const controller = new AbortController();
    activeSearch.current = controller;
    setSearchStatus('loading');
    const startedAt = Date.now();
    try {
      const matches = await fundClient.searchFunds(term, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) });
      if (controller.signal.aborted) return;
      setResults(matches);
      setSearchStatus('ready');
    } catch (error) {
      if (controller.signal.aborted) return;
      recordMarketSourceFailure('mfapi', error, startedAt);
      setSearchStatus(error.status === 429 ? 'cooldown' : 'error');
    }
  };

  const navState = selected && state.navByCode[selected.code];
  const nav = navState?.value;
  const navFailed = navState?.status === 'error' || navState?.status === 'cooldown';
  return (
    <div className="md3-fund-search">
      <form onSubmit={onSearch}>
        <label htmlFor="md3-fund-query">Scheme name or code</label>
        <div className="md3-source-actions">
          <input id="md3-fund-query" value={query} onChange={event => setQuery(event.target.value)}
            maxLength={120} minLength={3} required />
          <button className="md3-primary" type="submit">Search funds</button>
        </div>
      </form>
      {searchStatus === 'loading' && <p role="status">Searching MFapi…</p>}
      {searchStatus === 'error' && <p role="status">Fund search is unavailable. Try again or open AMFI.</p>}
      {searchStatus === 'cooldown' && <p role="status">MFapi is rate-limiting lookups. Try later or open AMFI.</p>}
      {results?.length === 0 && <p role="status">No matching schemes.</p>}
      {results?.length > 0 && (
        <ul className="md3-source-list" aria-label="Matching fund schemes">
          {results.map(({ schemeCode, schemeName }) => (
            <li key={schemeCode}>
              <button type="button" className="md3-secondary" onClick={() => load(schemeCode, schemeName)}>
                {schemeName} ({schemeCode})
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected && (
        <div className="md3-source-observation" aria-live="polite">
          <strong>{nav?.schemeName || selected.name}</strong>
          {navState?.status === 'loading' && <span>Checking NAV…</span>}
          {nav && <span>₹{nav.nav.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
            {' · '}{navFailed ? 'Retained NAV' : 'Latest reported NAV'} · <time dateTime={nav.date}>{nav.date}</time> · MFapi</span>}
          {navFailed && (
            <>
              <span>{navState.status === 'cooldown' ? 'MFapi is rate-limiting lookups.' : 'The NAV check failed.'}</span>
              <button type="button" className="md3-secondary"
                onClick={() => load(selected.code, selected.name, true)}>Retry NAV</button>
            </>
          )}
        </div>
      )}
      {state.savedCodes.length > 0 && (
        <ul className="md3-source-list" aria-label="Saved fund schemes">
          {state.savedCodes.map(code => {
            const name = state.navByCode[code]?.value?.schemeName || state.historyCache[code]?.schemeName || 'Scheme ' + code;
            return <li key={code}><button type="button" className="md3-secondary" onClick={() => load(code, name)}>
              {name}
            </button></li>;
          })}
        </ul>
      )}
      <a href={AMFI_NAV_URL} target="_blank" rel="noopener noreferrer">Official AMFI NAVs</a>
    </div>
  );
}
