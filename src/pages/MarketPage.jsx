import React, { useEffect, useMemo, useState } from 'react';
import { useMarketPageViewModel } from '../viewModels/useMarketPageViewModel.js';
import { canonicalIndexId, mergeQualifiedIndices } from '../services/marketQuotePolicy.js';
import { formatMarketTimestamp } from '../utils/marketSession.js';
import { safeGetJson, safeSetJson } from '../data/safeStorage.js';
import { MARKET_WORKSPACE_IDS, getMarketWorkspaceFromHash, withMarketWorkspaceHash } from '../services/marketWorkspaceRoute.js';
import { EquityWorkspace, FundsWorkspace, CurrencyWorkspace } from '../components/market/MarketWorkspaceTools.jsx';
import BseMarketWidget from '../components/market/BseMarketWidget.jsx';
import { OPEN_SOURCE_REFERENCE_LINKS } from '../services/marketFreeOpenPolicy.js';
import './MarketPage.workspaces.css';

// useMarketTabViewModel is retained behind the existing page-scoped ViewModel alias.
const WORKSPACE_IDS = MARKET_WORKSPACE_IDS;
const INDEX_PINS_KEY = 'nw7.market-index-pins.v1';

function validChange(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(String(value).trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function quoteDate(row) {
  return row?.quoteAt ? formatMarketTimestamp(row.quoteAt) || 'Unavailable' : 'Unavailable';
}

function QuoteRow({ row, pinned, onPin, kind = 'index' }) {
  const change = validChange(row.changePercent);
  const value = Number(String(row.value ?? row.price ?? '').replace(/,/g, ''));
  const unit = kind === 'index' ? 'points' : 'INR';
  return <li className="market-workspace__row">
    <div className="market-workspace__name">
      <strong>{row.name || row.symbol}</strong>
      <span className="market-workspace__muted">{row.symbol || 'Index'} · Quote as of {quoteDate(row)}</span>
      <span className="market-workspace__muted">{row.source || row.sourceProvider || 'Source not provided'}</span>
    </div>
    <div className="market-workspace__numbers">
      <strong>{Number.isFinite(value) && value > 0 ? value.toLocaleString('en-IN', { maximumFractionDigits: 3 }) : 'Unavailable'} <small>{unit}</small></strong>
      <span className={change == null ? '' : change > 0 ? 'text-success' : change < 0 ? 'text-danger' : ''}>
        {change == null ? 'Change unavailable' : `${change > 0 ? '+' : ''}${change.toFixed(2)}%`}
      </span>
    </div>
    {onPin && <button type="button" className="market-workspace__pin" aria-label={`${pinned ? 'Unpin' : 'Pin'} ${row.name || row.symbol}`} aria-pressed={pinned} onClick={onPin}>{pinned ? '★' : '☆'}</button>}
  </li>;
}

function IndexWorkspace({ data, settings, loading, onRefresh }) {
  const [region, setRegion] = useState('india');
  const [scope, setScope] = useState('all');
  const [search, setSearch] = useState('');
  const [pins, setPins] = useState(() => {
    const saved = safeGetJson(INDEX_PINS_KEY, []);
    return Array.isArray(saved) ? saved.filter(item => typeof item === 'string').slice(0, 20) : [];
  });
  const freeOnly = data?.sourceMode === 'free-open-only';
  const merged = useMemo(() => mergeQualifiedIndices(null, data), [data]);
  const globalIds = new Set(merged.globalIndices.map(canonicalIndexId));
  const rows = merged.indices.filter(row => {
    const id = canonicalIndexId(row);
    if ((globalIds.has(id) ? 'global' : 'india') !== region) return false;
    const sector = ['^NSEBANK', '^CNXIT', '^CNXAUTO', '^CNXPHARMA'].includes(row.symbol);
    if (sector && settings.showSectorals === false) return false;
    if (scope === 'sector' && !sector) return false;
    if (scope === 'broad' && sector) return false;
    return `${row.name} ${row.symbol}`.toLowerCase().includes(search.trim().toLowerCase());
  }).sort((a, b) => Number(pins.includes(canonicalIndexId(b))) - Number(pins.includes(canonicalIndexId(a))));
  const regionAllowed = region === 'global' ? settings.showGlobalIndices !== false : settings.showIndices !== false;
  const togglePin = id => {
    const next = pins.includes(id) ? pins.filter(key => key !== id) : [...pins, id].slice(-20);
    setPins(next); safeSetJson(INDEX_PINS_KEY, next);
  };
  const breadth = rows.reduce((result, row) => {
    const change = validChange(row.change);
    result[change == null ? 'unknown' : change > 0 ? 'up' : change < 0 ? 'down' : 'flat']++;
    return result;
  }, { up: 0, down: 0, flat: 0, unknown: 0 });
  return <section aria-labelledby="indices-heading" className="market-workspace__panel" id="market-indices">
    <div className="market-workspace__panel-header"><div><h2 id="indices-heading">Indices</h2><p>{freeOnly ? 'Explore BSE reference prices below or verify directly with an exchange.' : 'Source-dated index points. One row per index.'}</p></div><button type="button" onClick={onRefresh} disabled={loading || freeOnly}>Refresh indices</button></div>
    <div className="market-workspace__filters">
      <label>Market<select aria-label="Market region" value={region} onChange={event => { setRegion(event.target.value); setScope('all'); }}><option value="india">India</option><option value="global">Global</option></select></label>
      {!freeOnly && <><label>Coverage<select aria-label="Index coverage" value={scope} onChange={event => setScope(event.target.value)}><option value="all">All indices</option><option value="broad">Broad indices</option><option value="sector">Sector indices</option></select></label>
      <label>Find an index<input type="search" aria-label="Find an index" value={search} onChange={event => setSearch(event.target.value)} placeholder="NIFTY, SENSEX…" /></label></>}
    </div>
    {freeOnly && <p className="market-workspace__muted">Official sources: <a href={OPEN_SOURCE_REFERENCE_LINKS.nseIndices} target="_blank" rel="noopener noreferrer">NSE indices</a> · <a href={OPEN_SOURCE_REFERENCE_LINKS.bseIndices} target="_blank" rel="noopener noreferrer">BSE indices</a>. No copied quote values.</p>}
    {freeOnly && regionAllowed && region === 'india' && <BseMarketWidget kind="indices" />}
    {!regionAllowed ? <p role="status">This market region is hidden in Market settings.</p> : rows.length ? <>
      <ul className="market-workspace__list">{rows.map(row => {
        const id = canonicalIndexId(row);
        return <QuoteRow key={id} row={row} pinned={pins.includes(id)} onPin={() => togglePin(id)} />;
      })}</ul>
      <p className="market-workspace__muted">Visible rows: {breadth.up} up · {breadth.down} down · {breadth.flat} flat · {breadth.unknown} change unavailable.</p>
    </> : <p role="status">No qualified {region === 'india' ? 'India' : 'Global'} index observations match these filters. Refresh or consult the source.</p>}
  </section>;
}

function MarketDataStatus({ data, error, loading, sourceHealth, sessionState }) {
  const [expanded, setExpanded] = useState(false);
  const time = formatMarketTimestamp(data?.fetchedAt);
  return <div className="market-workspace__status">
    <span>India session: {sessionState?.label || 'Estimated / unavailable'}</span>
    <span>Publication: {data?.sourceMode === 'free-open-only' ? 'Free/open mode — no redistributed quotes' : time || 'Unavailable'}</span>
    {loading && <span role="status">Refreshing quote publication…</span>}
    <button type="button" aria-expanded={expanded} aria-controls="market-data-status-details" onClick={() => setExpanded(value => !value)}>Data status</button>
    {expanded && <div id="market-data-status-details" className="market-workspace__diagnostics">
      <strong>Source health</strong>
      <p>Publication time does not change the quote time shown on individual rows. Cached observations retain their source dates.</p>
      {error && <p role="alert">{String(error)}</p>}
      <dl>{Object.entries(sourceHealth).map(([name, state]) => <React.Fragment key={name}><dt>{name}</dt><dd>{String(state?.status || state || 'unknown')}</dd></React.Fragment>)}</dl>
    </div>}
  </div>;
}

export default function MarketPage() {
  const viewModel = useMarketPageViewModel();
  const { marketData, rawMarketData, marketSettings = {}, sourceHealth = {}, sessionState, loading, error, refreshMarket } = viewModel;
  const [view, setView] = useState(() => getMarketWorkspaceFromHash(typeof window === 'undefined' ? '' : window.location.hash));
  const [refreshResult, setRefreshResult] = useState('');
  useEffect(() => {
    const onLocation = () => setView(getMarketWorkspaceFromHash(window.location.hash));
    window.addEventListener('hashchange', onLocation);
    window.addEventListener('popstate', onLocation);
    return () => { window.removeEventListener('hashchange', onLocation); window.removeEventListener('popstate', onLocation); };
  }, []);
  const changeView = next => {
    if (!WORKSPACE_IDS.includes(next)) return;
    setView(next);
    if (typeof window !== 'undefined') {
      const nextHash = withMarketWorkspaceHash(window.location.hash, next);
      if (window.location.hash !== nextHash) window.history.pushState(null, '', nextHash);
    }
  };
  const refresh = () => {
    setRefreshResult('Checking the quote publication…');
    void Promise.resolve(refreshMarket?.(true))
      .then(result => setRefreshResult(result?.ok === false ? `Refresh failed: ${result.error || 'Source unavailable'}` : 'Refresh check finished. Individual quotes retain their original source times.'))
      .catch(failure => setRefreshResult(`Refresh failed: ${failure?.message || 'Source unavailable'}`));
  };
  const data = rawMarketData || marketData || null;
  return <div className="page-container market-page-shell market-workspace" id="market-workspace">
    <header className="market-workspace__header">
      <div className="market-workspace__title"><h1>Markets</h1><MarketDataStatus data={data} error={error} loading={loading} sourceHealth={sourceHealth} sessionState={sessionState} /></div>
      <nav className="market-workspace__tabs" aria-label="Market workspaces">
        {WORKSPACE_IDS.map(id => <button key={id} type="button" className={view === id ? 'is-active' : ''} aria-current={view === id ? 'page' : undefined} onClick={() => changeView(id)}>{id[0].toUpperCase() + id.slice(1)}</button>)}
      </nav>
    </header>
    <main className="market-workspace__body" id={`market-${view}-content`}>
      {error && <p role="alert" className="market-workspace__empty">Market publication: {String(error)}</p>}
      {refreshResult && <p role="status" className="market-workspace__muted">{refreshResult}</p>}
      {view === 'indices' && <IndexWorkspace data={marketData || {}} settings={marketSettings} loading={loading} onRefresh={refresh} />}
      {view === 'equity' && <EquityWorkspace data={marketData || {}} settings={marketSettings} loading={loading} onRefresh={refresh} />}
      {view === 'funds' && <FundsWorkspace data={marketData || {}} settings={marketSettings} />}
      {view === 'currency' && <CurrencyWorkspace settings={marketSettings} />}
    </main>
    <footer className="market-workspace__footer">Informational and delayed/reference data. Verify original exchange or provider values before financial decisions.</footer>
  </div>;
}
