import React, { useCallback, useEffect, useRef, useState } from 'react';
import { safeGetJson, safeSetJson } from '../../data/safeStorage.js';
import {
  INDIA_MARKET_SOURCES, equityQuoteUrl, loadOmrRate, convertOmrInr,
  searchIndianFunds, loadFundNav, calculateSip, currentNfoRows,
} from '../../services/indiaMarketTools.js';
import { canonicalEquitySymbol, TRACKED_EQUITY_SYMBOLS, qualifyTrackedEquities } from '../../services/marketEquityPolicy.js';

const WATCHLIST_KEY = 'nw7.india-watchlist.v1';
const SAVED_FUNDS_KEY = 'nw7.market-saved-funds.v1';
const rupees = number => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(number);
const external = (url, label) => <a href={url} target="_blank" rel="noopener noreferrer">{label} ↗</a>;

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

export function EquityWorkspace({ data, settings = {}, loading, onRefresh }) {
  const [section, setSection] = useState('saved');
  const [input, setInput] = useState('');
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState(() => {
    const stored = safeGetJson(WATCHLIST_KEY, []);
    return Array.isArray(stored) ? [...new Set(stored.map(canonicalEquitySymbol).filter(Boolean))].slice(0, 12) : [];
  });
  const quotes = qualifyTrackedEquities(data.equities || []);
  const bySymbol = new Map(quotes.map(row => [row.symbol, row]));
  const coverage = data.equityCoverage || {};
  const sourceCount = typeof coverage.sourceAcquiredCount === 'number' ? coverage.sourceAcquiredCount : quotes.length;
  const saveSymbol = event => {
    event.preventDefault();
    const symbol = canonicalEquitySymbol(input);
    if (!symbol || !equityQuoteUrl(symbol)) { setMessage('Enter a valid NSE ticker symbol.'); return; }
    if (saved.includes(symbol)) { setMessage(`${symbol} is already saved.`); return; }
    if (saved.length >= 12) { setMessage('The 12-symbol watchlist is full. Remove a symbol first.'); return; }
    const next = [...saved, symbol]; setSaved(next); safeSetJson(WATCHLIST_KEY, next);
    setInput(''); setMessage(`${symbol} saved. Quotes are available only within the tracked universe.`);
  };
  const removeSymbol = symbol => { const next = saved.filter(item => item !== symbol); setSaved(next); safeSetJson(WATCHLIST_KEY, next); };
  return <section id="market-equity" aria-labelledby="equity-heading" className="market-workspace__panel">
    <div className="market-workspace__panel-header"><div><h2 id="equity-heading">Equity</h2><p>16 tracked NSE symbols; source-dated observations, not an exchange-wide quote service.</p></div><button type="button" onClick={onRefresh} disabled={loading}>Refresh tracked shares</button></div>
    <p className="market-workspace__muted">Qualified quotes: {quotes.length}/{TRACKED_EQUITY_SYMBOLS.length} · Acquired this publication: {sourceCount} · Retained: {coverage.retainedCount ?? 'Unknown'}</p>
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
          {quote ? <><span>{rupees(quote.value)} · {quote.changePercent ?? 'Change unavailable'}%</span><span className="market-workspace__muted">Quote as of {new Date(quote.quoteAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST · {quote.sourceProvider || quote.source || 'Source unavailable'}</span></> : <span className="market-workspace__muted">{TRACKED_EQUITY_SYMBOLS.includes(symbol) ? 'No qualified quote in this publication.' : 'Outside the free tracked quote universe.'}</span>}</div>
        <div className="market-workspace__field-row">{external(equityQuoteUrl(symbol), `Verify ${symbol} on NSE`)}<button type="button" onClick={() => removeSymbol(symbol)}>Remove</button></div>
      </li>;
      })}</ul> : <p className="market-workspace__empty">No saved shares. Add a symbol above or browse the tracked universe.</p>}
    </>}
    {section === 'all' && (quotes.length ? <ul className="market-workspace__list">{quotes.map(row => <PriceRow key={row.id} row={row} />)}</ul> : <p role="status">No qualified tracked equity quotes available. Saved symbols remain preserved.</p>)}
    {section === 'offers' && (settings.showIPO === false ? <p>IPO/FPO is hidden in Market settings.</p> : <>
      <p className="market-workspace__muted">IPO schedules are separate from share prices. Provider failures are not evidence of zero issues.</p>
      {['live','upcoming','recent'].some(group => (data.ipo?.[group] || []).length) ? <ul className="market-workspace__list">{['live','upcoming','recent'].flatMap(group => (data.ipo?.[group] || []).map((row,index) => <li className="market-workspace__row" key={`${group}-${row.name}-${index}`}><div><strong>{row.name}</strong><p>{group} · {row.openDate || 'Opening unknown'} – {row.closeDate || 'Closing unknown'}</p></div></li>))}</ul>
      : <p role="status">{data.sourceHealth?.ipo?.status === 'failed' ? 'IPO/FPO source unavailable.' : 'No verified current issue rows in this publication.'}</p>}
      {external(INDIA_MARKET_SOURCES.ipo, 'Verify current public issues')}
    </>)}
  </section>;
}

export function FundsWorkspace({ data, settings = {} }) {
  const [section, setSection] = useState('saved');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selectedCode, setSelectedCode] = useState(null);
  const [nav, setNav] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(() => {
    const stored = safeGetJson(SAVED_FUNDS_KEY, []);
    return Array.isArray(stored) ? stored.filter(value => /^\d{3,8}$/.test(String(value))).map(String).slice(0, 12) : [];
  });
  const latestRequest = useRef(0);
  useEffect(() => () => { latestRequest.current += 1; }, []);
  const begin = () => { latestRequest.current += 1; setBusy(true); setError(''); return latestRequest.current; };
  const find = async event => {
    event.preventDefault(); const id = begin(); setResults([]); setNav(null); setSelectedCode(null);
    try { const rows = await searchIndianFunds(query); if (id === latestRequest.current) setResults(rows); }
    catch (failure) { if (id === latestRequest.current) setError(failure?.message || 'Fund search failed.'); }
    finally { if (id === latestRequest.current) setBusy(false); }
  };
  const select = async code => {
    const id = begin(); setSelectedCode(String(code)); setNav(null);
    try { const item = await loadFundNav(code); if (id === latestRequest.current) setNav(item); }
    catch (failure) { if (id === latestRequest.current) setError(failure?.message || 'NAV lookup failed.'); }
    finally { if (id === latestRequest.current) setBusy(false); }
  };
  const save = code => {
    const value = String(code); if (saved.includes(value) || saved.length >= 12) return;
    const next = [...saved, value]; setSaved(next); safeSetJson(SAVED_FUNDS_KEY, next);
  };
  const remove = code => { const next = saved.filter(item => item !== String(code)); setSaved(next); safeSetJson(SAVED_FUNDS_KEY, next); };
  const publicationNav = new Map((data.mutualFunds || []).map(row => [String(row.code || row.schemeCode), row]));
  const offers = currentNfoRows(data.nfo || []);
  const [monthly, setMonthly] = useState('5000');
  const [years, setYears] = useState('10');
  const [annual, setAnnual] = useState('8');
  const scenario = calculateSip(monthly, years, annual);
  return <section id="market-funds" aria-labelledby="funds-heading" className="market-workspace__panel">
    <div className="market-workspace__panel-header"><div><h2 id="funds-heading">Funds</h2><p>Source-dated NAVs; Direct/Regular and Growth/IDCW schemes remain distinct.</p></div></div>
    {settings.showMutualFunds === false ? <p>Mutual funds are hidden in Market settings.</p> : <>
    <div className="market-workspace__section-switch" aria-label="Fund sections">{[['saved','My funds'],['search','Find a fund'],['offers','NFOs']].map(([id,label]) => <button key={id} type="button" aria-pressed={section === id} onClick={() => setSection(id)}>{label}</button>)}</div>
    {section === 'saved' && <>{saved.length ? <ul className="market-workspace__list">{saved.map(code => {
      const known = publicationNav.get(code);
      return <li className="market-workspace__row" key={code}><div className="market-workspace__name"><strong>{known?.name || `Scheme ${code}`}</strong><span className="market-workspace__muted">{known ? `NAV ${rupees(Number(known.nav))} · Date ${known.navDate || 'unavailable'}` : 'No dated NAV loaded. Select to request the latest.'}</span></div><div className="market-workspace__field-row"><button type="button" onClick={() => select(code)}>Load NAV</button><button type="button" onClick={() => remove(code)}>Remove</button></div></li>;
    })}</ul> : <p className="market-workspace__empty">No saved funds. Search by scheme name and save its exact scheme code.</p>}
      <details className="market-workspace__nested"><summary>Published NAV collection ({publicationNav.size})</summary>
        {publicationNav.size ? <ul className="market-workspace__list">{[...publicationNav.entries()].slice(0, 50).map(([code, row]) => <li className="market-workspace__row" key={code}>
          <div className="market-workspace__name"><strong>{row.name || `Scheme ${code}`}</strong><span className="market-workspace__muted">NAV {Number.isFinite(Number(row.nav)) && Number(row.nav) > 0 ? rupees(Number(row.nav)) : 'Unavailable'} · Date {row.navDate || 'Unavailable'} · {row.category || 'Category unknown'}</span></div>
          <button type="button" onClick={() => save(code)} disabled={saved.includes(code) || saved.length >= 12}>{saved.includes(code) ? 'Saved' : 'Save'}</button>
        </li>)}</ul> : <p className="market-workspace__empty">No qualified NAV rows in the Market publication. Search for a scheme to retrieve its NAV.</p>}
      </details>
    </>}
    {section === 'search' && <><form className="market-workspace__field-row" onSubmit={find}><label>Scheme or fund house<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Nifty 50 Direct Growth" maxLength={120} /></label><button type="submit" disabled={busy}>Search funds</button></form><ul className="market-workspace__list">{results.map(item => <li className="market-workspace__row" key={item.schemeCode}><div className="market-workspace__name"><strong>{item.schemeName}</strong><span className="market-workspace__muted">Scheme {item.schemeCode}</span></div><div className="market-workspace__field-row"><button type="button" disabled={busy} onClick={() => select(item.schemeCode)}>Load NAV</button><button type="button" disabled={saved.includes(String(item.schemeCode)) || saved.length >= 12} onClick={() => save(item.schemeCode)}>{saved.includes(String(item.schemeCode)) ? 'Saved' : 'Save'}</button></div></li>)}</ul></>}
    {section === 'offers' && <>{offers.length ? <ul className="market-workspace__list">{offers.map((item,index)=><li className="market-workspace__row" key={`${item.name}-${index}`}><div><strong>{item.name}</strong><p>{item.offerState} · Launch {item.openDate} · Close {item.closeDate || 'unavailable'}</p></div></li>)}</ul> : <p role="status">{data.sourceHealth?.nfo?.status === 'failed' ? 'NFO source unavailable.' : 'No currently qualified NFO schedule in this publication.'}</p>}{external(INDIA_MARKET_SOURCES.nfo,'AMFI NFO verification')}</>}
    {busy && <p role="status">Loading selected fund data…</p>}{error && <p role="alert">{error}</p>}
    {nav && selectedCode === nav.code && <div className="market-workspace__nested"><strong>{nav.name}</strong><p>NAV {rupees(nav.nav)} · NAV date {nav.date} · {nav.category || 'Category unknown'}</p><p>{nav.stale ? 'Historical NAV — not current' : 'Source-dated NAV'} · {external(INDIA_MARKET_SOURCES.nav,'AMFI verification')}</p></div>}
    <details className="market-workspace__nested"><summary>SIP scenario (offline calculator)</summary><p>End-of-month payments; nominal annual assumed return divided by 12. This is an illustration, not an investment forecast.</p><div className="market-workspace__filters"><label>Monthly INR<input type="number" min="1" value={monthly} onChange={event => setMonthly(event.target.value)} /></label><label>Years<input type="number" min="0" max="50" step="any" value={years} onChange={event => setYears(event.target.value)} /></label><label>Assumed annual %<input type="number" min="0" max="50" value={annual} onChange={event => setAnnual(event.target.value)} /></label></div><output>{scenario ? `Invested ${rupees(scenario.invested)} · Illustrative value ${rupees(scenario.value)}` : 'Enter valid scenario inputs.'}</output></details>
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
    try { const result = await loadOmrRate(); if (generation.current === request) setRate(result); }
    catch (failure) { if (generation.current === request) setError(failure?.message || 'Currency rate unavailable.'); }
    finally { if (generation.current === request) setLoading(false); }
  }, []);
  useEffect(() => {
    if (settings.showCurrency !== false) void reload();
    return () => { generation.current += 1; };
  }, [reload, settings.showCurrency]); // Browser-held daily cache survives workspace changes.
  const converted = convertOmrInr(amount, rate?.rate, base);
  return <section id="market-currency" aria-labelledby="currency-heading" className="market-workspace__panel">
    <div className="market-workspace__panel-header"><div><h2 id="currency-heading">Currency conversion</h2><p>Daily OMR/INR reference rate; not a bank transfer quote.</p></div></div>
    {settings.showCurrency === false ? <p>Currency is hidden in Market settings.</p> : <>
      <div className="market-workspace__filters"><label>From<select value={base} onChange={event => setBase(event.target.value)}><option value="OMR">OMR</option><option value="INR">INR</option></select></label><label>Amount<input inputMode="decimal" type="number" min="0" value={amount} onChange={event => setAmount(event.target.value)} /></label><label>To<input value={base === 'OMR' ? 'INR' : 'OMR'} readOnly aria-label="Conversion destination" /></label></div>
      <button type="button" onClick={() => setBase(value => value === 'OMR' ? 'INR' : 'OMR')}>Swap pair</button>
      <output className="market-workspace__result">{amount === '' ? '' : converted == null ? 'Result unavailable' : base === 'OMR' ? rupees(converted) : `${converted.toFixed(3)} OMR`}</output>
      {rate ? <p>1 OMR = {rate.rate.toPrecision(8)} INR · {rate.stale ? 'Stale reference' : 'Daily reference'} · As of {new Date(rate.asOf).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST{rate.warning ? ` · ${rate.warning}` : ''}</p> : <p role="status">{loading ? 'Loading daily reference rate…' : 'No rate available.'}</p>}
      {error && <p role="alert">{error}</p>}
      <p className="market-workspace__muted">{external(INDIA_MARKET_SOURCES.fx,'Rate provider')} · Transfer fees and spreads excluded.</p>
      {!loading && error && <button type="button" onClick={() => void reload()}>Retry rate acquisition</button>}
    </>}
  </section>;
}
