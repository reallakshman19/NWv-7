import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { safeGetJson, safeSetJson } from '../../data/safeStorage.js';
import {
  INDIA_MARKET_SOURCES, equityQuoteUrl, loadOmrRate, convertOmrInr,
  searchIndianFunds, loadFundNav, calculateSip, currentNfoRows, parseIndiaDate,
} from '../../services/indiaMarketTools.js';
import { canonicalEquitySymbol, TRACKED_EQUITY_SYMBOLS, qualifyTrackedEquities } from '../../services/marketEquityPolicy.js';
import { createMarketFundNavStore, normalizeSavedFundCodes } from '../../services/marketFundRequests.js';
import { assessMarketIpo } from '../../services/marketIpoPolicy.js';
import BseMarketWidget from './BseMarketWidget.jsx';

const WATCHLIST_KEY = 'nw7.india-watchlist.v1';
const SAVED_FUNDS_KEY = 'nw7.market-saved-funds.v1';
const rupees = number => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(number);
const external = (url, label) => <a href={url} target="_blank" rel="noopener noreferrer">{label} <span aria-hidden="true">↗</span></a>;

function PriceRow({ row }) {
  const change = Number(row.changePercent);
  const validChange = (typeof row.changePercent === 'number' || (typeof row.changePercent === 'string' && row.changePercent.trim() !== '')) && Number.isFinite(change);
  return <li className="market-workspace__row">
    <div className="market-workspace__name"><strong>{row.name || row.symbol}</strong>
      <span className="market-workspace__muted">{row.symbol} · NSE · {row.quoteAt ? `Quote as of ${new Date(row.quoteAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST` : 'Source date unavailable'}</span>
      <span className="market-workspace__muted">{row.sourceProvider || row.source || 'Provider unavailable'} · Tracked NSE shares</span></div>
    <div className="market-workspace__numbers"><strong>{rupees(Number(row.value))}</strong><span className={validChange && change > 0 ? 'text-success' : validChange && change < 0 ? 'text-danger' : ''}>{validChange ? `${change > 0 ? '+' : ''}${change.toFixed(2)}%` : 'Change unavailable'}</span></div>
  </li>;
}

function IpoEvidencePanel({ data }) {
  const evidence = assessMarketIpo(data);
  return <div className="market-workspace__ipo-evidence" data-ipo-state={evidence.state}>
    <p className="market-workspace__muted">IPO schedules are separate from share prices. A failed source does not mean zero public issues.</p>
    <p role="status">{evidence.message}{evidence.checkedAt != null
      ? ' · Source checked ' + new Date(evidence.checkedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST' : ''}</p>
    {evidence.state === 'available' && <ul className="market-workspace__list">
      {['live','upcoming','recent'].flatMap(group => evidence.rows[group].map((row,index) =>
        <li className="market-workspace__row" key={group+'-'+row.name+'-'+index}>
          <div><strong>{row.name}</strong><p>{group} · {row.openDate} – {row.closeDate}</p></div>
        </li>
      ))}
    </ul>}
    <div className="market-workspace__field-row">
      {external(INDIA_MARKET_SOURCES.ipo, 'Verify current public issues')}
      {external(INDIA_MARKET_SOURCES.ipoBse, 'BSE public issues')}
    </div>
  </div>;
}

export function EquityWorkspace({ data, settings = {}, loading, onRefresh }) {
  const [section, setSection] = useState('saved');
  const [input, setInput] = useState('');
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState(() => {
    const stored = safeGetJson(WATCHLIST_KEY, []);
    return Array.isArray(stored) ? [...new Set(stored.map(canonicalEquitySymbol).filter(Boolean))].slice(0, 12) : [];
  });
  const freeOnly = data?.sourceMode === 'free-open-only';
  const quotes = freeOnly ? [] : qualifyTrackedEquities(data.equities || []);
  const bySymbol = new Map(quotes.map(row => [row.symbol, row]));
  const coverage = data.equityCoverage || {};
  const sourceCount = typeof coverage.sourceAcquiredCount === 'number' ? coverage.sourceAcquiredCount : quotes.length;
  const saveSymbol = event => {
    event.preventDefault();
    const symbol = canonicalEquitySymbol(input);
    if (!symbol || !equityQuoteUrl(symbol)) { setMessage('Enter a valid NSE ticker symbol.'); return; }
    if (saved.includes(symbol)) { setMessage(`${symbol} is already saved.`); return; }
    if (saved.length >= 12) { setMessage('The 12-symbol watchlist is full. Remove a symbol first.'); return; }
    const next = [...saved, symbol]; setSaved(next);
    const persisted = safeSetJson(WATCHLIST_KEY, next);
    setInput(''); setMessage(persisted ? (freeOnly ? `${symbol} saved. Use the NSE link to verify its quote.` : `${symbol} saved. Quotes are available only within the tracked universe.`) : 'Saved for this visit only. Browser storage is unavailable.');
  };
  const removeSymbol = symbol => { const next = saved.filter(item => item !== symbol); setSaved(next); if (!safeSetJson(WATCHLIST_KEY, next)) setMessage('Change applies to this visit only. Browser storage is unavailable.'); };
  return <section id="market-equity" aria-labelledby="equity-heading" className="market-workspace__panel">
    <div className="market-workspace__panel-header"><div><h2 id="equity-heading">Equity</h2><p>{freeOnly ? 'Free/open mode: 16 watchlist symbols and official NSE verification, no republished quote prices.' : '16 tracked NSE symbols; source-dated observations, not an exchange-wide quote service.'}</p></div><button type="button" onClick={onRefresh} disabled={loading || freeOnly}>Refresh tracked shares</button></div>
    <p className="market-workspace__muted">Qualified quotes: {quotes.length}/{TRACKED_EQUITY_SYMBOLS.length} · Acquired this publication: {sourceCount} · Retained: {coverage.retainedCount ?? 'Unknown'}</p>
    {freeOnly && <BseMarketWidget kind="equities" />}
    <div className="market-workspace__section-switch" aria-label="Equity sections">
      {[['saved','My shares'],['all','Tracked universe'],['offers','IPO / FPO']].map(([id,title]) => <button key={id} type="button" aria-pressed={section === id} onClick={() => setSection(id)}>{title}</button>)}
    </div>
    {section === 'saved' && <>
      <form onSubmit={saveSymbol} className="market-workspace__field-row"><label>Save an NSE symbol<input value={input} onChange={event => setInput(event.target.value)} maxLength={30} placeholder="INFY" /></label><button type="submit">Save symbol</button></form>
      {message && <p role="status">{message}</p>}
      {saved.length ? <ul className="market-workspace__list">{saved.map(symbol => {
        const quote = bySymbol.get(symbol);
        return <li className="market-workspace__row" key={symbol}>
        <div className="market-workspace__name"><strong>{symbol}</strong>
          {quote ? <><span>{rupees(quote.value)} · {quote.changePercent == null ? 'Change unavailable' : `${quote.changePercent}%`}</span><span className="market-workspace__muted">Quote as of {new Date(quote.quoteAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST · {quote.sourceProvider || quote.source || 'Source unavailable'}</span></> : <span className="market-workspace__muted">{TRACKED_EQUITY_SYMBOLS.includes(symbol) ? 'No qualified quote in this publication.' : 'Outside the free tracked quote universe.'}</span>}</div>
        <div className="market-workspace__field-row">{external(equityQuoteUrl(symbol), `Verify ${symbol} on NSE`)}<button type="button" onClick={() => removeSymbol(symbol)}>Remove</button></div>
      </li>;
      })}</ul> : <p className="market-workspace__empty">No saved shares. Add a symbol above or browse the tracked universe.</p>}
    </>}
    {section === 'all' && (freeOnly ? <><p role="status">Free/open-only: these 16 tracked symbols have official source links; no quote prices are republished.</p><ul className="market-workspace__list">{TRACKED_EQUITY_SYMBOLS.map(symbol => <li className="market-workspace__row" key={symbol}><strong>{symbol}</strong>{external(equityQuoteUrl(symbol), `Verify ${symbol} on NSE`)}</li>)}</ul></> : quotes.length ? <ul className="market-workspace__list">{quotes.map(row => <PriceRow key={row.id} row={row} />)}</ul> : <p role="status">No qualified tracked equity quotes available. Saved symbols remain preserved.</p>)}
    {section === 'offers' && (settings.showIPO === false
      ? <p>IPO/FPO is hidden in Market settings.</p>
      : <IpoEvidencePanel data={data} />)}
  </section>;
}

export function FundsWorkspace({ data, settings = {} }) {
  const [section, setSection] = useState('saved');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selectedCode, setSelectedCode] = useState(null);
  const [selectedBusy, setSelectedBusy] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [selectedError, setSelectedError] = useState('');
  const [storageError, setStorageError] = useState('');
  const [navByCode, setNavByCode] = useState({});
  const [saved, setSaved] = useState(() => normalizeSavedFundCodes(safeGetJson(SAVED_FUNDS_KEY, [])));
  const navStore = useMemo(() => createMarketFundNavStore({ load: loadFundNav, read: safeGetJson, write: safeSetJson }), []);
  const searchCache = useRef(new Map());
  const searchAbort = useRef(null);
  const selectionAbort = useRef(null);
  const latestSearch = useRef(0);
  const latestSelection = useRef(0);
  const publicationNav = useMemo(() => new Map(
    (data.mutualFunds || []).filter(row => /^\d{3,8}$/.test(String(row.code || row.schemeCode)) &&
      Number.isFinite(Number(row.nav)) && Number(row.nav) > 0 &&
      parseIndiaDate(row.navDate) != null && parseIndiaDate(row.navDate) <= Date.now() + 5 * 60_000)
      .map(row => [String(row.code || row.schemeCode), row])
  ), [data.mutualFunds]);

  // The Funds panel is the first request boundary: no saved NAV fetch on Market boot.
  // Each saved code has independent state, with at most three concurrent requests.
  useEffect(() => {
    if (settings.showMutualFunds === false || !saved.length) return undefined;
    const controller = new AbortController();
    const update = item => {
      if (controller.signal.aborted) return;
      setNavByCode(prev => ({ ...prev, [item.code]: { ...prev[item.code], ...item } }));
    };
    void navStore.batch(saved, { signal: controller.signal, onItem: update });
    return () => controller.abort();
  }, [navStore, saved, settings.showMutualFunds]); // stable saved array changes only when the watchlist changes

  useEffect(() => () => {
    latestSearch.current += 1;
    latestSelection.current += 1;
    searchAbort.current?.abort();
    selectionAbort.current?.abort();
  }, []);

  const persist = next => {
    setSaved(next);
    if (!safeSetJson(SAVED_FUNDS_KEY, next)) setStorageError('Saved scheme changes could not be persisted in this browser.');
    else setStorageError('');
  };
  const save = code => {
    const next = normalizeSavedFundCodes([...saved, String(code)]);
    if (next.length !== saved.length || next.some((value, index) => value !== saved[index])) persist(next);
  };
  const remove = code => {
    const next = saved.filter(value => value !== String(code));
    persist(next);
    if (selectedCode === String(code)) { latestSelection.current++; selectionAbort.current?.abort(); setSelectedCode(null); }
  };

  const find = async event => {
    event.preventDefault();
    const cleaned = query.trim().replace(/\s+/g, ' ').slice(0, 120);
    if (cleaned.length < 3) { setSearchError('Enter at least three characters'); return; }
    const key = cleaned.toLocaleLowerCase('en');
    const old = searchCache.current.get(key);
    latestSearch.current += 1;
    searchAbort.current?.abort();
    const request = latestSearch.current;
    setSearchError('');
    if (old && old.checkedAt <= Date.now() && Date.now() - old.checkedAt < 15 * 60 * 1000) {
      setResults(old.rows); setSearchBusy(false); return;
    }
    const controller = new AbortController();
    searchAbort.current = controller;
    setSearchBusy(true);
    setResults([]);
    try {
      const rows = await searchIndianFunds(cleaned, { signal: controller.signal });
      if (controller.signal.aborted || request !== latestSearch.current) return;
      searchCache.current.set(key, { rows, checkedAt: Date.now() });
      if (searchCache.current.size > 20) searchCache.current.delete(searchCache.current.keys().next().value);
      setResults(rows);
    } catch (failure) {
      if (!controller.signal.aborted && request === latestSearch.current)
        setSearchError(failure?.message || 'Fund search failed.');
    } finally {
      if (request === latestSearch.current) setSearchBusy(false);
    }
  };

  const select = async (code, force = false) => {
    const value = String(code);
    latestSelection.current += 1;
    selectionAbort.current?.abort();
    const request = latestSelection.current;
    const controller = new AbortController();
    selectionAbort.current = controller;
    setSelectedCode(value);
    setSelectedError('');
    setSelectedBusy(true);
    try {
      const item = await navStore.request(value, { signal: controller.signal, force });
      if (controller.signal.aborted || request !== latestSelection.current) return;
      setNavByCode(previous => ({ ...previous, [value]: { code: value, status: 'ready', value: item } }));
    } catch (failure) {
      if (controller.signal.aborted || request !== latestSelection.current) return;
      setSelectedError(failure?.status === 429 ? 'NAV provider rate-limited requests. Retry later.' : failure?.message || 'NAV lookup failed.');
    } finally {
      if (request === latestSelection.current) setSelectedBusy(false);
    }
  };

  const offers = currentNfoRows(data.nfo || []);
  const [monthly, setMonthly] = useState('5000');
  const [years, setYears] = useState('10');
  const [annual, setAnnual] = useState('8');
  const scenario = calculateSip(monthly, years, annual);
  const selected = selectedCode ? navByCode[selectedCode]?.value || publicationNav.get(selectedCode) : null;

  return <section id="market-funds" aria-labelledby="funds-heading" className="market-workspace__panel">
    <div className="market-workspace__panel-header"><div><h2 id="funds-heading">Funds</h2><p>Exact scheme IDs and source-dated NAVs. Saved funds load only when Funds is opened.</p></div></div>
    {settings.showMutualFunds === false ? <p>Mutual funds are hidden in Market settings.</p> : <>
      <div className="market-workspace__section-switch" aria-label="Fund sections">
        {[['saved','My funds'],['search','Find a fund'],['offers','NFOs']].map(([id,label]) => <button key={id} type="button" aria-pressed={section === id} onClick={() => setSection(id)}>{label}</button>)}
      </div>
      {storageError && <p role="alert">{storageError}</p>}
      {section === 'saved' && <>
        {saved.length ? <ul className="market-workspace__list">{saved.map(code => {
          const status = navByCode[code];
          const known = status?.value || publicationNav.get(code);
          const navValue = Number(known?.nav);
          const navDate = known?.date || known?.navDate;
          return <li className="market-workspace__row" key={code}>
            <div className="market-workspace__name"><strong>{known?.name || `Scheme ${code}`}</strong>
              <span className="market-workspace__muted">{Number.isFinite(navValue) && navValue > 0 && navDate ? `NAV ${rupees(navValue)} · Source date ${navDate}` : 'NAV unavailable — scheme remains saved'}</span>
              {status?.status === 'loading' && <span role="status">Checking NAV for scheme {code}…</span>}
              {status?.status === 'error' && <span role="alert">{status.error} · Other schemes remain available</span>}
              {status?.status === 'cooldown' && <span role="alert">Source rate limit reached. Please retry later.</span>}
              {status?.value?.delivery === 'cache' && <span className="market-workspace__muted">Browser-held source-dated NAV · Previously checked {new Date(status.value.checkedAt).toLocaleDateString('en-IN')}</span>}
              {status?.value?.stale && <span className="market-workspace__muted">Historical NAV, not current</span>}
            </div><div className="market-workspace__field-row">
              <button type="button" onClick={() => select(code)} disabled={selectedBusy && selectedCode === code}>{selectedCode === code && selectedBusy ? 'Loading…' : 'View NAV'}</button>
              <button type="button" onClick={() => select(code, true)} disabled={status?.status === 'cooldown' || (selectedBusy && selectedCode === code)}>Retry source</button>
              <button type="button" onClick={() => remove(code)}>Remove</button>
            </div>
          </li>;
        })}</ul> : <p className="market-workspace__empty">No saved funds. Search by scheme name and save its exact scheme code.</p>}
        <details className="market-workspace__nested"><summary>Published NAV collection ({publicationNav.size})</summary>
          {publicationNav.size ? <ul className="market-workspace__list">{[...publicationNav.entries()].slice(0, 50).map(([code, row]) => <li className="market-workspace__row" key={code}>
            <div className="market-workspace__name"><strong>{row.name || `Scheme ${code}`}</strong>
              <span className="market-workspace__muted">NAV {Number.isFinite(Number(row.nav)) && Number(row.nav) > 0 ? rupees(Number(row.nav)) : 'Unavailable'} · Date {row.navDate || 'Unavailable'} · {row.category || 'Category unknown'}</span></div>
            <button type="button" onClick={() => save(code)} disabled={saved.includes(code) || saved.length >= 12}>{saved.includes(code) ? 'Saved' : 'Save'}</button>
          </li>)}</ul> : <p className="market-workspace__empty">No qualified NAV rows in this publication. Search for the scheme directly.</p>}
        </details>
      </>}
      {section === 'search' && <>
        <form className="market-workspace__field-row" onSubmit={find}><label>Scheme or fund house<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Nifty 50 Direct Growth" maxLength={120} /></label>
          <button type="submit" disabled={searchBusy}>{searchBusy ? 'Searching…' : 'Search funds'}</button></form>
        {searchError && <p role="alert">{searchError} <button type="button" onClick={() => void find({ preventDefault() {} })}>Retry search</button></p>}
        <ul className="market-workspace__list">{results.map(item => <li className="market-workspace__row" key={item.schemeCode}>
          <div className="market-workspace__name"><strong>{item.schemeName}</strong><span className="market-workspace__muted">Scheme {item.schemeCode}</span></div>
          <div className="market-workspace__field-row"><button type="button" onClick={() => select(item.schemeCode)}>View NAV</button>
            <button type="button" disabled={saved.includes(String(item.schemeCode)) || saved.length >= 12} onClick={() => save(item.schemeCode)}>{saved.includes(String(item.schemeCode)) ? 'Saved' : 'Save'}</button></div>
        </li>)}</ul>
      </>}
      {section === 'offers' && <>
        {offers.length ? <ul className="market-workspace__list">{offers.map((item,index)=><li className="market-workspace__row" key={`${item.name}-${index}`}><div><strong>{item.name}</strong><p>{item.offerState} · Launch {item.openDate} · Close {item.closeDate || 'unavailable'}</p></div></li>)}</ul>
          : <p role="status">{data.sourceHealth?.nfo?.status === 'failed' ? 'NFO source unavailable.' : 'No currently qualified NFO schedule in this publication.'}</p>}
        {external(INDIA_MARKET_SOURCES.nfo,'AMFI NFO verification')}
      </>}
      {selectedBusy && <p role="status">Checking NAV for selected scheme {selectedCode}…</p>}
      {selectedError && <p role="alert">{selectedError}</p>}
      {selected && selectedCode && <div className="market-workspace__nested"><strong>{selected.name}</strong>
        <p>NAV {rupees(Number(selected.nav))} · Source NAV date {selected.date || selected.navDate} · {selected.category || 'Category unknown'}</p>
        <p>{selected.stale ? 'Historical NAV — not current' : 'Source-dated NAV'} · {external(INDIA_MARKET_SOURCES.nav,'AMFI verification')}</p>
      </div>}
      <details className="market-workspace__nested"><summary>SIP scenario (offline calculator)</summary><p>End-of-month payments; nominal annual assumed return divided by 12. This is an illustration, not an investment forecast.</p>
        <div className="market-workspace__filters"><label>Monthly INR<input type="number" min="1" value={monthly} onChange={event => setMonthly(event.target.value)} /></label>
          <label>Years<input type="number" min="0" max="50" step="any" value={years} onChange={event => setYears(event.target.value)} /></label>
          <label>Assumed annual %<input type="number" min="0" max="50" value={annual} onChange={event => setAnnual(event.target.value)} /></label></div>
        <output>{scenario ? `Invested ${rupees(scenario.invested)} · Illustrative value ${rupees(scenario.value)}` : 'Enter valid scenario inputs.'}</output>
      </details>
    </>}
  </section>;
}

export function CurrencyWorkspace({ settings = {} }) {
  const [rate, setRate] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('100');
  const [base, setBase] = useState('OMR');
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const request = ++generation.current; setLoading(true); setError('');
    try {
      const result = await loadOmrRate();
      if (generation.current === request) { setRate(result); setError(''); }
    }
    catch (failure) {
      if (generation.current === request) {
        // The loader has already considered any still-eligible cached rate.
        // Retaining the previous component value here can resurrect an expired rate.
        setRate(null);
        setError(failure?.message || 'Currency rate unavailable.');
      }
    }
    finally { if (generation.current === request) setLoading(false); }
  }, []);
  useEffect(() => {
    if (settings.showCurrency !== false) void reload();
    return () => { generation.current += 1; };
  }, [reload, settings.showCurrency]); // Browser-held daily cache survives workspace changes.
  useEffect(() => {
    if (!rate) return undefined;
    let timer;
    const recheck = () => {
      clearTimeout(timer);
      const age = Date.now() - rate.asOf;
      const staleAfter = 36 * 60 * 60 * 1000;
      const expiresAfter = 3 * 24 * 60 * 60 * 1000;
      if (!Number.isFinite(age) || age > expiresAfter) {
        setRate(null);
        setError('The reference rate has expired. Retry to get a current rate.');
        return;
      }
      if (age > staleAfter && !rate.stale) {
        setRate(previous => previous === rate ? { ...previous, stale: true } : previous);
        return;
      }
      const next = age <= staleAfter && !rate.stale ? staleAfter : expiresAfter;
      timer = setTimeout(recheck, Math.max(1, next - age + 1));
    };
    recheck();
    // Timers can be suspended while a browser tab is in the background.
    window.addEventListener('focus', recheck);
    document.addEventListener('visibilitychange', recheck);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', recheck);
      document.removeEventListener('visibilitychange', recheck);
    };
  }, [rate]);
  const converted = convertOmrInr(amount, rate?.rate, base);
  return <section id="market-currency" aria-labelledby="currency-heading" className="market-workspace__panel">
    <div className="market-workspace__panel-header"><div><h2 id="currency-heading">Currency conversion</h2><p>Daily OMR/INR reference rate; not a bank transfer quote.</p></div></div>
    {settings.showCurrency === false ? <p>Currency is hidden in Market settings.</p> : <>
      <div className="market-workspace__filters"><label>From<select value={base} onChange={event => setBase(event.target.value)}><option value="OMR">OMR</option><option value="INR">INR</option></select></label><label>Amount<input inputMode="decimal" type="number" min="0" value={amount} onChange={event => setAmount(event.target.value)} /></label><label>To<input value={base === 'OMR' ? 'INR' : 'OMR'} readOnly aria-label="Conversion destination" /></label></div>
      <button type="button" onClick={() => setBase(value => value === 'OMR' ? 'INR' : 'OMR')}>Swap pair</button>
      <output className="market-workspace__result">{amount === '' ? '' : converted == null ? 'Result unavailable' : base === 'OMR' ? rupees(converted) : `${converted.toFixed(3)} OMR`}</output>
      {rate ? <p>1 OMR = {rate.rate.toPrecision(8)} INR · {rate.stale ? 'Stale reference' : 'Daily reference'} · Reference date {rate.rateDate || new Date(rate.asOf).toISOString().slice(0,10)}{rate.warning ? ` · ${rate.warning}` : ''}</p> : <p role="status">{loading ? 'Loading daily reference rate…' : 'No rate available.'}</p>}
      {error && <p role="alert">{error}</p>}
      <p className="market-workspace__muted">{external(INDIA_MARKET_SOURCES.fx,'Frankfurter — open-source FX reference')} · Transfer fees and spreads excluded.</p>
      {!loading && error && <button type="button" onClick={() => void reload()}>Retry rate acquisition</button>}
    </>}
  </section>;
}
