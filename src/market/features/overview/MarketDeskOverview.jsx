/**
 * Market R3C — compact, action-first landing page.
 *
 * Deliberately does not synthesize native exchange quotes. All actual figures
 * derive from qualified user-local state or explicit provider receipts.
 * Provider widgets remain opt-in and no data request runs on mount.
 */
import React, { useMemo, useState, useSyncExternalStore } from 'react';
import { FiClock, FiExternalLink } from 'react-icons/fi';
import { canonicalIndexId, getQualifiedIndexRows } from '../../../services/marketQuotePolicy.js';
import { qualifyTrackedEquities } from '../../../services/marketEquityPolicy.js';
import { TRACKED_NSE_METADATA, getNseQuoteUrl } from '../equity/equityMetadata.js';
import { formatMarketTimestamp, isMarketSeedRow } from '../../../utils/marketSession.js';
import { MarketNav } from './MarketNav.jsx';
import { MarketSessionHeader } from './MarketSessionHeader.jsx';
import { OverviewSlotErrorBoundary } from './OverviewSlotErrorBoundary.jsx';
import { useWatchlist } from '../equity/index.js';
import { usePortfolioStore } from '../portfolio/portfolioStore.js';
import { useFundStore } from '../funds/fundStore.js';
import { useMacroStore } from '../macro/macroStore.js';
import { evaluateFxObservation, canConvertFxRate } from '../macro/fxFreshness.js';
import { healthStore } from '../health/healthStore.js';
import { OPEN_SOURCE_REFERENCE_LINKS } from '../../../services/marketFreeOpenPolicy.js';
import { safeGetJson } from '../../../data/safeStorage.js';
import { MARKET_LEGACY_STORAGE_KEYS, MARKET_R21_STORAGE_KEYS, R21_MARKET_WORKSPACE_IDS } from '../../contracts/index.js';
import equityUniverse from '../../../config/marketEquityUniverse.json' with { type: 'json' };
import './MarketDeskOverview.css';
import { MarketIndexProviderBoard } from './MarketIndexProviderBoard.jsx';

const PULSE = [
  { id: 'nifty', name: 'NIFTY 50', symbol: '^NSEI', url: OPEN_SOURCE_REFERENCE_LINKS.nseIndices, source: 'NSE' },
  { id: 'sensex', name: 'SENSEX', symbol: '^BSESN', url: 'https://www.bseindices.com/indices-details/code/16', source: 'BSE Indices' },
  { id: 'bank', name: 'NIFTY Bank', symbol: '^NSEBANK', url: OPEN_SOURCE_REFERENCE_LINKS.nseIndices, source: 'NSE' },
  { id: 'bse500', name: 'BSE 500', symbol: '^BSE500', url: 'https://www.bseindices.com/indices-details/code/17/', source: 'BSE Indices' }
];

const DEFAULT_SLOTS = Object.freeze({
  providerBoard: null, watchlist: null, portfolio: null,
  fundSearch: null, currency: null, events: null,
  marketBriefing: null, sourceHealth: null, investmentLab: null
});

function QualifiedSlot({ title, workspace, onNavigate, children, fallback }) {
  return (
    <OverviewSlotErrorBoundary
      slotTitle={title}
      workspaceId={workspace}
      workspaceTitle={title}
      onNavigate={onNavigate}
    >
      {children || fallback}
    </OverviewSlotErrorBoundary>
  );
}

function Metric({ label, value, detail, destination, onNavigate }) {
  return (
    <button type="button" className="md3-metric" onClick={() => onNavigate(destination)}>
      <span className="md3-metric-label">{label}</span>
      <strong className="md3-metric-value">{value}</strong>
      <span className="md3-metric-detail">{detail}</span>
    </button>
  );
}

function jumpToSection(id) {
  const heading = document.getElementById(id);
  if (!heading) return;
  heading.focus({ preventScroll: true });
  heading.scrollIntoView?.({ block: 'start' });
}

function DeskCard({ id, title, action, destination, onNavigate, wide = false, children }) {
  return (
    <section className={'md3-card' + (wide ? ' md3-card--wide' : '')} aria-labelledby={id}>
      <div className="md3-card-head">
        <h2 id={id} tabIndex={-1}>{title}</h2>
        {destination && (
          <button type="button" className="md3-card-action" onClick={() => onNavigate(destination)}>
            {action || 'Open workspace'}
          </button>
        )}
      </div>
      <div className="md3-card-content">{children}</div>
    </section>
  );
}

const DISPLAY_QUOTE_MODES = new Set(['live', 'snapshot', 'cache', 'stale-snapshot', 'stale-cache']);

function getDatedIndexObservations(data) {
  if (!DISPLAY_QUOTE_MODES.has(data?.sourceMode)) return [];
  return getQualifiedIndexRows(data)
    .filter(({ row }) => row.quoteAt != null && (row.sourceProvider || row.source) && !isMarketSeedRow(row))
    .sort((a, b) => b.time - a.time);
}

function MarketPulse({ data }) {
  const observations = getDatedIndexObservations(data);
  const isLastAvailable = data?.sourceMode !== 'live';
  // An empty native quote feed is not four useful market cards. Fall back to
  // a branded provider-hosted index board rather than four blank placeholders.
  if (observations.length === 0) return <MarketIndexProviderBoard />;

  return (
    <div className="md3-pulse-list">
      {PULSE.map(index => {
        const indexId = canonicalIndexId(index);
        const observation = observations.find(({ id, row }) =>
          id === indexId || row.symbol === index.symbol || (!row.symbol && row.name === index.name)
        );

        return (
          <a key={index.id} className="md3-pulse-row" href={index.url}
            target="_blank" rel="noopener noreferrer">
            <span className="md3-pulse-identity">
              <strong>{index.name}</strong>
              <small className="md3-pulse-caption">
                {index.source} <FiExternalLink aria-hidden="true" />
              </small>
            </span>
            <span className="md3-pulse-observation">
              {observation ? (
                <>
                  <strong>{observation.value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong>
                  {isLastAvailable && (
                    <small className="md3-pulse-caption md3-pulse-history">
                      <FiClock aria-hidden="true" /> Last available
                    </small>
                  )}
                  <small>
                    <time dateTime={new Date(observation.time).toISOString()}>
                      {formatMarketTimestamp(observation.time)}
                    </time>
                  </small>
                </>
               ) : <small>View original source</small>}
            </span>
          </a>
        );
      })}
    </div>
  );
}

const CANONICAL_SECTORS = Object.freeze([
  {
    id: 'banking',
    name: 'Banking & Financials',
    benchmark: 'NIFTY Bank',
    symbol: '^NSEBANK',
    url: 'https://www.niftyindices.com/indices/equity/sectoral-indices/nifty-bank',
    classification: /Banking|Financial Services/i,
  },
  {
    id: 'it',
    name: 'Information Technology',
    benchmark: 'NIFTY IT',
    symbol: '^CNXIT',
    url: 'https://www.niftyindices.com/indices/equity/sectoral-indices/nifty-it',
    classification: /Information Technology/i,
  },
  {
    id: 'auto',
    name: 'Automobiles',
    benchmark: 'NIFTY Auto',
    symbol: '^CNXAUTO',
    url: 'https://www.niftyindices.com/indices/equity/sectoral-indices/nifty-auto',
    classification: /Automobile/i,
  },
  {
    id: 'pharma',
    name: 'Pharma & Healthcare',
    benchmark: 'NIFTY Pharma',
    symbol: '^CNXPHARMA',
    url: 'https://www.niftyindices.com/indices/equity/sectoral-indices/nifty-pharma',
    classification: /Pharma|Healthcare/i,
  },
  {
    id: 'fmcg',
    name: 'Consumer Goods (FMCG)',
    benchmark: 'NIFTY FMCG',
    symbol: '^CNXFMCG',
    url: 'https://www.niftyindices.com/indices/equity/sectoral-indices/nifty-fmcg',
    classification: /Consumer Goods/i,
  },
  {
    id: 'energy',
    name: 'Energy',
    benchmark: 'NIFTY Energy',
    symbol: '^CNXENERGY',
    url: 'https://www.niftyindices.com/indices/equity/thematic-indices/nifty-energy',
    classification: /Energy|Petrochemicals/i,
  },
]);

function SectorQuote({ value, time, source, isLastAvailable, currency = '' }) {
  return (
    <div className="md3-sector-value">
      <strong>{currency}{value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong>
      {isLastAvailable && <small className="md3-pulse-caption"><FiClock aria-hidden="true" /> Last available</small>}
      <small>{source} · <time dateTime={new Date(time).toISOString()}>{formatMarketTimestamp(time)}</time></small>
    </div>
  );
}

function SectorBreakdown({ data, onNavigate }) {
  const [activeSector, setActiveSector] = useState(CANONICAL_SECTORS[0]);
  const canDisplayQuotes = DISPLAY_QUOTE_MODES.has(data?.sourceMode);
  const isLastAvailable = data?.sourceMode !== 'live';
  const sectorId = canonicalIndexId({ ...activeSector, exchange: 'NSE' });
  const benchmark = getDatedIndexObservations(data).find(({ id }) => id === sectorId);
  const equities = canDisplayQuotes ? qualifyTrackedEquities(data.equities) : [];
  const equityBySymbol = new Map(equities.map(quote => [quote.symbol, quote]));
  const stocks = Object.values(TRACKED_NSE_METADATA)
    .filter(({ sector }) => activeSector.classification.test(sector));

  return (
    <div className="md3-sector-explorer">
      <div className="md3-sector-tabs" role="group" aria-label="Select market sector">
        {CANONICAL_SECTORS.map(sector => (
          <button
            key={sector.id}
            type="button"
            aria-pressed={activeSector === sector}
            className={'md3-sector-tab' + (activeSector === sector ? ' is-active' : '')}
            onClick={() => setActiveSector(sector)}
          >
            {sector.name}
          </button>
        ))}
      </div>

      <div className="md3-sector-panel">
        <div className="md3-sector-summary">
          <div>
            <div className="md3-sector-benchmark-line">
              <span className="md3-sector-title">Benchmark</span>
              <a href={activeSector.url} target="_blank" rel="noopener noreferrer" className="md3-sector-benchmark-badge">
                {activeSector.benchmark} <FiExternalLink aria-hidden="true" />
              </a>
            </div>
            {benchmark && (
              <SectorQuote value={benchmark.value} time={benchmark.time}
                source={benchmark.row.sourceProvider || benchmark.row.source}
                isLastAvailable={isLastAvailable} />
            )}
          </div>
          <button type="button" className="md3-secondary md3-sector-fund-btn" onClick={() => onNavigate?.('funds')}>
            Find mutual funds →
          </button>
        </div>

        <div>
          <div className="md3-compact-caption">Tracked stocks by industry · {stocks.length}</div>
          <div className="md3-sector-stock-grid">
            {stocks.map(({ symbol, name, exchange }) => {
              const quote = equityBySymbol.get(symbol);
              return (
                <div key={symbol} className="md3-stock-card">
                  <div className="md3-stock-card-top">
                    <a href={getNseQuoteUrl(symbol)} target="_blank" rel="noopener noreferrer" className="md3-stock-symbol">
                      {symbol} <FiExternalLink aria-hidden="true" />
                    </a>
                    <span className="md3-stock-exchange">{exchange}</span>
                  </div>
                  <span className="md3-stock-name">{name}</span>
                  {quote && (
                    <SectorQuote value={quote.value} time={Date.parse(quote.quoteAt)}
                      source={quote.sourceProvider || quote.provider || quote.source}
                      isLastAvailable={isLastAvailable} currency="₹" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MarketDeskOverview({
  onNavigate, data = {}, settings = {}, slots: customSlots = {},
  onRefresh = null, refreshing = false, currentWorkspace = 'overview', hideNav = false, showSessionHeader = true
}) {
  const slots = { ...DEFAULT_SLOTS, ...customSlots };
  const health = useSyncExternalStore(healthStore.subscribe, healthStore.getSnapshot);
  const { keys: watchlistKeys } = useWatchlist();
  const { state: portfolioState, actions: portfolioActions } = usePortfolioStore();
  const { state: fundState } = useFundStore();
  const { state: macroState } = useMacroStore();
  const [healthExpanded, setHealthExpanded] = useState(false);
  const marketNav = id => {
    if (R21_MARKET_WORKSPACE_IDS.includes(id) && typeof onNavigate === 'function') onNavigate(id);
  };

  const savedSymbols = useMemo(() => {
    if (Array.isArray(watchlistKeys) && watchlistKeys.length) return watchlistKeys;
    const v2 = safeGetJson(MARKET_R21_STORAGE_KEYS.watchlistV2, null);
    if (Array.isArray(v2)) return v2;
    if (Array.isArray(v2?.keys)) return v2.keys;
    const legacy = safeGetJson(MARKET_LEGACY_STORAGE_KEYS.watchlist, []);
    return Array.isArray(legacy) ? legacy : [];
  }, [watchlistKeys]);

  const portfolio = useMemo(
    () => portfolioActions.getReplayedPortfolio(),
    [portfolioActions, portfolioState]
  );
  const fx = macroState.ratesByPair['OMR/INR']?.value || null;
  const fxState = evaluateFxObservation(fx?.date);
  const validRate = canConvertFxRate(fx);
  const recentReceipts = health.receiptsSummary?.totalRetained || 0;
  const datedSources = Object.values(health.sourceStates || {})
    .filter(item => item.providerAsOf);
  const knownSymbols = Array.isArray(equityUniverse?.symbols) ? equityUniverse.symbols : [];
  const holdingsStatus = portfolio?.valuationStatus === 'COMPLETE'
    ? 'Complete manual marks'
    : portfolio?.valuationStatus === 'PARTIAL'
      ? 'Marks needed for valuation' : 'Local trade ledger';

  return (
    <div className="market-desk-r3c" data-testid="market-desk-r3c">
      {showSessionHeader && (
        <MarketSessionHeader
          sessionState={data?.sessionState}
          sourceMode={data?.sourceMode || 'free-open-only'}
          onNavigate={marketNav}
          onRefresh={data?.sourceMode === 'free-open-only' ? null : onRefresh}
          refreshing={refreshing}
          tradingHolidays={settings?.tradingHolidays}
        />
      )}
      {!hideNav && <MarketNav currentWorkspace={currentWorkspace} onNavigate={marketNav} />}

      <div className="md3-body">
        <nav className="md3-jump-links" aria-label="Jump to a Market section">
          <button type="button" onClick={() => jumpToSection('md3-pulse')}>Indices</button>
          <button type="button" onClick={() => jumpToSection('md3-currency')}>Rates</button>
          <button type="button" onClick={() => jumpToSection('md3-funds')}>Find fund</button>
          <button type="button" onClick={() => jumpToSection('md3-briefing')}>News</button>
          <button type="button" onClick={() => jumpToSection('md3-sectors')}>Sectors</button>
        </nav>

        <div className="md3-grid">
          <DeskCard id="md3-pulse" title="India Market Pulse" wide
            action="All indices" destination="indices" onNavigate={marketNav}>
            <MarketPulse data={data} />
            {slots.providerBoard && getDatedIndexObservations(data).length > 0 && (
              <button type="button" className="md3-secondary md3-bse-jump"
                onClick={() => jumpToSection('md3-provider')}>BSE closing prices</button>
            )}
          </DeskCard>

          <DeskCard id="md3-currency" title="Currency Rates"
            action="All rates" destination="currency-macro" onNavigate={marketNav}>
            <QualifiedSlot title="Currency Tool" workspace="currency-macro" onNavigate={marketNav}
              fallback={<button type="button" className="md3-primary" onClick={() => marketNav('currency-macro')}>
                Check dated reference rate
              </button>}>
              {slots.currency}
            </QualifiedSlot>
          </DeskCard>

          <DeskCard id="md3-funds" title="Mutual Fund Quick Search"
            action="Research funds" destination="funds" onNavigate={marketNav}>
            <div className="md3-compact-caption">Saved: {fundState.savedCodes?.length || 0}/12 · Direct scheme lookup</div>
            <QualifiedSlot title="Mutual Funds" workspace="funds" onNavigate={marketNav}
              fallback={<button type="button" className="md3-primary" onClick={() => marketNav('funds')}>
                Find a fund by name or scheme code
              </button>}>
              {slots.fundSearch}
            </QualifiedSlot>
          </DeskCard>

          <DeskCard id="md3-briefing" title="Market Briefing"
            action="All Events & News" destination="ipo-events" onNavigate={marketNav}>
            <QualifiedSlot title="Events" workspace="ipo-events" onNavigate={marketNav}
              fallback={<button type="button" className="md3-primary" onClick={() => marketNav('ipo-events')}>
                View dated events
              </button>}>
              {slots.marketBriefing}
            </QualifiedSlot>
          </DeskCard>

          <DeskCard id="md3-provider" title="BSE Provider Board" wide
            action="Provider choices" destination="indices" onNavigate={marketNav}>
            <QualifiedSlot title="Provider Board" workspace="indices" onNavigate={marketNav}
              fallback={<a className="md3-provider-link" href="https://www.tradingview.com/markets/stocks-india/"
                target="_blank" rel="noopener noreferrer">
                Open TradingView India market boards
              </a>}>
              {slots.providerBoard}
            </QualifiedSlot>
          </DeskCard>

          <DeskCard id="md3-watchlist" title="My Watchlist" action="Manage Watchlist"
            destination="equity" onNavigate={marketNav}>
            <div className="md3-compact-caption">Saved: {savedSymbols.length}/12 · Tracked NSE Universe: {knownSymbols.length}</div>
            <QualifiedSlot title="My Watchlist" workspace="equity" onNavigate={marketNav}
              fallback={<div className="md3-symbols">
                {(savedSymbols.length ? savedSymbols : knownSymbols.slice(0, 4)).map((item, i) => {
                  const raw = String(item).replace(/^NSE:/i, '');
                  return (
                    <a key={String(item) + i}
                      href={'https://www.nseindia.com/get-quotes/equity?symbol=' + encodeURIComponent(raw)}
                      rel="noopener noreferrer" target="_blank">
                      {'NSE:' + raw}
                    </a>
                  );
                })}
              </div>}>
              {slots.watchlist}
            </QualifiedSlot>
          </DeskCard>

          <DeskCard id="md3-portfolio" title="Portfolio & Investment Lab"
            action="Open Portfolio" destination="portfolio" onNavigate={marketNav}>
            <QualifiedSlot title="Portfolio" workspace="portfolio" onNavigate={marketNav}
              fallback={<p className="md3-muted">Local holdings · Moving-average P&amp;L · Manual marks</p>}>
              {slots.portfolio}
            </QualifiedSlot>
            <div className="md3-card-bottom">
              <button type="button" className="md3-secondary" onClick={() => marketNav('lab')}>
                Launch Calculators
              </button>
            </div>
          </DeskCard>

          <DeskCard id="md3-sectors" title="Movers & Sector References" wide
            action="Explore sectors" destination="indices" onNavigate={marketNav}>
            <SectorBreakdown data={data} onNavigate={marketNav} />
            <div className="md3-link-grid">
              <a href={OPEN_SOURCE_REFERENCE_LINKS.nseIndices} target="_blank" rel="noopener noreferrer">NSE breadth & sectors</a>
              <a href={OPEN_SOURCE_REFERENCE_LINKS.bseIndices} target="_blank" rel="noopener noreferrer">BSE index boards</a>
              <button type="button" onClick={() => marketNav('indices')}>Compare index references</button>
            </div>
            <p className="md3-muted">Native gainers/losers unavailable under current source rights.</p>
          </DeskCard>

          <DeskCard id="md3-events" title="IPO / NFO / Verified Events" wide
            action="Open IPO & Events Workspace" destination="ipo-events" onNavigate={marketNav}>
            <div className="md3-event-actions">
              <a href={OPEN_SOURCE_REFERENCE_LINKS.nseIpo || 'https://www.nseindia.com/market-data/all-upcoming-issues-ipo'}
                target="_blank" rel="noopener noreferrer">NSE official IPO</a>
              <a href="https://www.bseindia.com/markets/PublicIssues/IPOIssues_new.aspx"
                target="_blank" rel="noopener noreferrer">BSE official IPO</a>
              <button type="button" onClick={() => marketNav('ipo-events')}>Upcoming events calendar</button>
            </div>
            {slots.events && (
              <QualifiedSlot title="Market Events" workspace="ipo-events" onNavigate={marketNav}>
                {slots.events}
              </QualifiedSlot>
            )}
          </DeskCard>
        </div>

        <div className="md3-metrics" aria-label="Your market desk metrics">
          <Metric label="Watchlist" value={String(savedSymbols.length) + ' / 12'}
            detail="Saved equities" destination="equity" onNavigate={marketNav} />
          <Metric label="Portfolio" value={String(portfolio?.activeHoldingsCount || 0)}
            detail={holdingsStatus} destination="portfolio" onNavigate={marketNav} />
          <Metric label="Funds" value={String(fundState.savedCodes?.length || 0)}
            detail="Saved schemes" destination="funds" onNavigate={marketNav} />
          <Metric label="OMR / INR" value={validRate ? fx.rate.toFixed(2) : fxState?.freshness === 'EXPIRED' ? 'Expired' : 'Check rate'}
            detail={fx?.date ? 'Provider date: ' + fx.date : 'On-demand reference'} destination="currency-macro" onNavigate={marketNav} />
          <Metric label="Source evidence" value={String(recentReceipts)}
            detail="Local request receipts" destination="health" onNavigate={marketNav} />
        </div>

        <section className="md3-health" aria-labelledby="md3-health-title">
          <div className="md3-health-main">
            <div>
              <h2 id="md3-health-title">Data Provenance & Source Health</h2>
              <div className="md3-health-meta">
                {recentReceipts} recorded checks · {datedSources.length} dated sources ·
                Freshness: {health.qualityEvaluation?.dimensions?.freshness?.status || 'NOT_CHECKED'}
              </div>
            </div>
            <div className="md3-health-actions">
              <button type="button" className="md3-secondary" aria-label="Inspect Health"
                aria-expanded={healthExpanded} onClick={() => setHealthExpanded(value => !value)}>
                {healthExpanded ? 'Hide source details' : 'Inspect Health'}
              </button>
              <button type="button" className="md3-primary" onClick={() => marketNav('health')}>
                Full Health Workspace
              </button>
            </div>
          </div>
          {healthExpanded && (
            <div className="md3-health-expanded">
              <p>MARKET_FREE_OPEN_ONLY = true · Provider dates are not request dates.</p>
              <p>PROVIDER_EMBED · Free branded widget · Isolated iframe</p>
              <QualifiedSlot title="Source Rights" workspace="health" onNavigate={marketNav}
                fallback={<div className="md3-muted">No source activity available on this device.</div>}>
                {slots.sourceHealth}
              </QualifiedSlot>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default MarketDeskOverview;
