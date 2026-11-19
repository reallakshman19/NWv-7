import React, { useEffect, useState } from 'react';
import { safeGetJson, safeSetJson } from '../../data/safeStorage.js';
import { INDIA_MARKET_SOURCES as SOURCES, loadOmrRate, convertOmrInr, equityQuoteUrl, searchIndianFunds, loadFundNav, calculateSip, currentNfoRows } from '../../services/indiaMarketTools.js';
import './IndiaMarketTools.css';

const rupees = amount => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount);
const External = ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children} ↗</a>;

export function NewFundOffers({ rows = [], sourceStatus }) {
  const offers = currentNfoRows(rows);
  return <section id="nfo-tracker" className="market-section modern-card india-tools">
    <h2>Mutual fund NFOs</h2>
    <p>New fund subscriptions; company shares are listed under IPO / FPO.</p>
    {offers.length ? <ul>{offers.map((row, index) => <li key={row.id || `${row.name}-${index}`}>
      <strong>{row.name}</strong> · {row.offerState}<br />
      {row.closeDate || row.endDate
        ? `${row.openDate || row.startDate} – ${row.closeDate || row.endDate}`
        : `Launch ${row.openDate || row.startDate} · Closing date unavailable`}
    </li>)}</ul> : <p>{sourceStatus === 'failed' ? 'The AMFI schedule could not be reached. Check AMFI for open and upcoming offers.' : 'No verified current NFO schedule in this feed. Check the official source for open and upcoming offers.'}</p>}
    <External href={SOURCES.nfo}>AMFI new fund offers</External>
  </section>;
}

export default function IndiaMarketTools({ showCurrency = true, showMutualFunds = true }) {
  const [fx, setFx] = useState(null), [fxError, setFxError] = useState('');
  const [amount, setAmount] = useState('100'), [direction, setDirection] = useState('OMR');
  const [symbol, setSymbol] = useState('');
  const [watchlist, setWatchlist] = useState(() => {
    const saved = safeGetJson('nw7.india-watchlist.v1', []);
    return Array.isArray(saved) ? saved.filter(item => equityQuoteUrl(item)).slice(0, 12) : [];
  });
  const [query, setQuery] = useState(''), [funds, setFunds] = useState([]), [fund, setFund] = useState(null);
  const [fundError, setFundError] = useState(''), [busy, setBusy] = useState(false), [searched, setSearched] = useState(false);
  const [monthly, setMonthly] = useState('5000'), [years, setYears] = useState('10'), [annual, setAnnual] = useState('8');
  useEffect(() => {
    if (!showCurrency) return undefined;
    let active = true;
    loadOmrRate().then(value => { if (active) setFx(value); }).catch(() => { if (active) setFxError('OMR/INR reference rate unavailable. Try again on your next visit.'); });
    return () => { active = false; };
  }, [showCurrency]);
  const converted = convertOmrInr(amount, fx?.rate, direction);
  const scenario = calculateSip(monthly, years, annual);
  const addEquity = event => {
    event.preventDefault();
    if (!equityQuoteUrl(symbol)) return;
    const next = [...new Set([...watchlist, symbol.trim().toUpperCase().replace(/\.NS$/, '')])].slice(0, 12);
    setWatchlist(next); safeSetJson('nw7.india-watchlist.v1', next); setSymbol('');
  };
  const search = async event => {
    event.preventDefault(); setBusy(true); setFundError(''); setFund(null); setFunds([]); setSearched(false);
    try { setFunds(await searchIndianFunds(query)); setSearched(true); }
    catch (error) { setFundError(error.message); }
    finally { setBusy(false); }
  };
  const selectFund = async code => {
    setBusy(true); setFundError(''); setFund(null);
    try { setFund(await loadFundNav(code)); }
    catch (error) { setFundError(error.message); }
    finally { setBusy(false); }
  };
  return <section id="india-tools" className="market-section modern-card india-tools">
    <h2>India market tools</h2>
    <p>Free public sources. Daily/reference data; check the exchange before acting.</p>
    <div className="india-tools__grid">
      {showCurrency && <div>
        <h3>OMR ↔ INR</h3>
        <div className="india-tools__form">
          <label>Amount<input type="number" min="0" step="any" value={amount} onChange={event => setAmount(event.target.value)} /></label>
          <label>From<select value={direction} onChange={event => setDirection(event.target.value)}><option value="OMR">OMR</option><option value="INR">INR</option></select></label>
        </div>
        {converted != null && <output>{direction === 'OMR' ? rupees(converted) : `${converted.toFixed(3)} OMR`}</output>}
        {fx && <p>{fx.stale ? 'Stale reference' : 'Daily reference'} · 1 OMR = {rupees(fx.rate)}<br />As of {new Date(fx.asOf).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST{fx.warning && <><br />{fx.warning}</>}</p>}
        {!fx && <p role="status">{fxError || 'Loading reference rate…'}</p>}
        <small>Indicative rate. Bank spreads and transfer fees excluded. <External href={SOURCES.fx}>Frankfurter open-source FX</External></small>
      </div>}
      <div>
        <h3>Indices & equity watchlist</h3>
        <p><External href={SOURCES.indices}>NSE index board</External></p>
        <form className="india-tools__form" onSubmit={addEquity}>
          <label>NSE symbol<input value={symbol} maxLength={30} placeholder="e.g. INFY" onChange={event => setSymbol(event.target.value)} /></label>
          <button type="submit" disabled={!equityQuoteUrl(symbol) || watchlist.length >= 12}>Save symbol</button>
        </form>
        <small>Saved on this device; up to 12 official quote shortcuts.</small>
        <ul>{watchlist.map(item => <li key={item}><External href={equityQuoteUrl(item)}>{item}</External> <button type="button" aria-label={`Remove ${item}`} onClick={() => { const next = watchlist.filter(row => row !== item); setWatchlist(next); safeSetJson('nw7.india-watchlist.v1', next); }}>Remove</button></li>)}</ul>
      </div>
      {showMutualFunds && <div>
        <h3>Find a mutual fund NAV</h3>
        <form className="india-tools__form" onSubmit={search}>
          <label>Scheme name<input value={query} minLength={3} maxLength={120} placeholder="e.g. HDFC index direct" onChange={event => setQuery(event.target.value)} /></label>
          <button type="submit" disabled={busy || query.trim().length < 3}>Search</button>
        </form>
        {busy && <p role="status">Loading fund data…</p>}
        {fundError && <p role="status">{fundError}</p>}
        {searched && !funds.length && <p>No schemes match. Try a fund house or shorter name.</p>}
        {!!funds.length && <label>Choose scheme (first 20 matches)<select aria-label="Choose mutual fund scheme" value={fund?.code || ''} disabled={busy} onChange={event => selectFund(event.target.value)}><option value="" disabled>Select a scheme</option>{funds.map(row => <option key={row.schemeCode} value={row.schemeCode}>{row.schemeName}</option>)}</select></label>}
        {fund && <p><strong>{fund.name}</strong><br />{fund.category}<br />NAV {rupees(fund.nav)} · {fund.date}{fund.stale && <><br />Historical NAV: over seven days old; not a current quote.</>}</p>}
        <small><External href={SOURCES.funds}>MFapi.in (free third-party data)</External> · <External href={SOURCES.nav}>Verify with AMFI</External></small>
      </div>}
      {showMutualFunds && <div>
        <h3>SIP scenario</h3>
        <div className="india-tools__form">
          <label>Monthly ₹<input type="number" min="1" value={monthly} onChange={event => setMonthly(event.target.value)} /></label>
          <label>Years<input type="number" min="1" max="50" value={years} onChange={event => setYears(event.target.value)} /></label>
          <label>Assumed annual %<input type="number" min="0" max="50" step="0.5" value={annual} onChange={event => setAnnual(event.target.value)} /></label>
        </div>
        {scenario ? <p>Contributed {rupees(scenario.invested)}<br />Scenario value {rupees(scenario.value)}</p> : <p>Enter a positive contribution, 1–50 years and 0–50% assumption.</p>}
        <small>User-entered assumptions, end-of-month contributions. Not a return prediction; taxes, fees and inflation excluded.</small>
      </div>}
    </div>
  </section>;
}
