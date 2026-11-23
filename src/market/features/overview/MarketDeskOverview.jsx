/**
 * Market R3C — compact, action-first landing page.
 *
 * Deliberately does not synthesize native exchange quotes. All actual figures
 * derive from qualified user-local state or explicit provider receipts.
 * Provider widgets remain opt-in and no data request runs on mount.
 */
import React, { useMemo, useState, useSyncExternalStore } from 'react';
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
import { fetchPersonalMarketPulse } from './personalQuoteOverride.js';

const PULSE = [
  { id: 'nifty', name: 'NIFTY 50', symbol: '^NSEI', url: OPEN_SOURCE_REFERENCE_LINKS.nseIndices, source: 'NSE' },
  { id: 'sensex', name: 'SENSEX', symbol: '^BSESN', url: 'https://www.tradingview.com/symbols/BSE-SENSEX/', source: 'TradingView BSE' },
  { id: 'bank', name: 'BANK NIFTY', symbol: '^NSEBANK', url: OPEN_SOURCE_REFERENCE_LINKS.nseIndices, source: 'NSE' },
  { id: 'bse500', name: 'BSE 500', symbol: '^BSE500', url: 'https://www.tradingview.com/symbols/BSE-BSE500/', source: 'TradingView BSE' }
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

function DeskCard({ id, title, action, destination, onNavigate, wide = false, children }) {
  return (
    <section className={'md3-card' + (wide ? ' md3-card--wide' : '')} aria-labelledby={id}>
      <div className="md3-card-head">
        <h2 id={id}>{title}</h2>
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

function MarketPulse({ data, localQuotes = [] }) {
  const freeOnly = data?.sourceMode === 'free-open-only' || !data?.sourceMode;
  return (
    <div className="md3-pulse-list">
      {PULSE.map(index => {
        const row = localQuotes.find(item => item.symbol === index.symbol || item.name === index.name) ||
          (freeOnly ? null : (data?.indices || []).find(item =>
            item.symbol === index.symbol || item.name === index.name
          ));
        // Never display an undated or unowned exchange value.
        const value = Number(row?.value ?? row?.price);
        const qualified = row && Number.isFinite(value) && value > 0 && row.quoteAt &&
          (row.source || row.sourceProvider);
        return (
          <a key={index.id} className="md3-pulse-row" href={index.url}
            target="_blank" rel="noopener noreferrer">
            <span className="md3-pulse-identity">
              <strong>{index.name}</strong>
              <small>{index.source} · Original source</small>
            </span>
            <span className="md3-pulse-observation">
              {qualified ? (
                <>
                  <strong>{value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong>
                  <small>As of {row.quoteAt}</small>
                </>
              ) : <small>View at source</small>}
            </span>
          </a>
        );
      })}
    </div>
  );
}

export function MarketDeskOverview({
  onNavigate, data = {}, settings = {}, slots: customSlots = {},
  onRefresh = null, refreshing = false, currentWorkspace = 'overview', hideNav = false
}) {
  const slots = { ...DEFAULT_SLOTS, ...customSlots };
  const health = useSyncExternalStore(healthStore.subscribe, healthStore.getSnapshot);
  const { keys: watchlistKeys } = useWatchlist();
  const { state: portfolioState, actions: portfolioActions } = usePortfolioStore();
  const { state: fundState } = useFundStore();
  const { state: macroState } = useMacroStore();
  const [healthExpanded, setHealthExpanded] = useState(false);
  const [localQuotes, setLocalQuotes] = useState([]);
  const [quoteLookup, setQuoteLookup] = useState({ loading: false, error: '' });
  const checkPersonalQuotes = async () => {
    setQuoteLookup({ loading: true, error: '' });
    try {
      const indices = await fetchPersonalMarketPulse();
      setLocalQuotes(indices);
      setQuoteLookup({ loading: false, error: '' });
    } catch (error) {
      setLocalQuotes([]);
      setQuoteLookup({ loading: false, error: error?.message || 'Browser quote lookup failed.' });
    }
  };
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
      <MarketSessionHeader
        sessionState={data?.sessionState}
        sourceMode={data?.sourceMode || 'free-open-only'}
        onNavigate={marketNav}
        onRefresh={data?.sourceMode === 'free-open-only' ? null : onRefresh}
        refreshing={refreshing}
        tradingHolidays={settings?.tradingHolidays}
      />
      {!hideNav && <MarketNav currentWorkspace={currentWorkspace} onNavigate={marketNav} />}

      <div className="md3-body">
        <div className="md3-lead">
          <div>
            <p className="md3-eyebrow">YOUR MARKET WORKSPACE</p>
            <h2>Market at a glance</h2>
          </div>
          <span className="md3-source-note">
            Free/open · Source-dated · No redistributed quotes
          </span>
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

        <div className="md3-grid">
          <DeskCard id="md3-pulse" title="India Market Pulse" wide
            action="All Indices & Sectors" destination="indices" onNavigate={marketNav}>
            <MarketPulse data={data} localQuotes={localQuotes} />
            <div className="md3-personal-quotes">
              <button type="button" className="md3-secondary" onClick={checkPersonalQuotes}
                disabled={quoteLookup.loading}>
                {quoteLookup.loading ? 'Checking provider…' : 'Check browser-local quotes'}
              </button>
              <span>Explicit, one-time browser lookup; no shared quote publication. Provider access terms apply.</span>
            </div>
            {quoteLookup.error && <p role="alert" className="md3-quote-error">{quoteLookup.error}</p>}
            <div className="md3-inline-note">Prices appear only when the provider supplies a dated, qualified observation. Source links remain available.</div>
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

          <DeskCard id="md3-currency" title="OMR / INR Currency Quick Tool"
            action="Currency & Macro" destination="currency-macro" onNavigate={marketNav}>
            <QualifiedSlot title="Currency Tool" workspace="currency-macro" onNavigate={marketNav}
              fallback={<button type="button" className="md3-primary" onClick={() => marketNav('currency-macro')}>
                Check dated reference rate
              </button>}>
              {slots.currency}
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

          <DeskCard id="md3-briefing" title="Market Briefing"
            action="All Events & News" destination="ipo-events" onNavigate={marketNav}>
            <QualifiedSlot title="Events" workspace="ipo-events" onNavigate={marketNav}
              fallback={<button type="button" className="md3-primary" onClick={() => marketNav('ipo-events')}>
                View dated events
              </button>}>
              {slots.marketBriefing || slots.events}
            </QualifiedSlot>
          </DeskCard>

          <DeskCard id="md3-sectors" title="Movers & Sector References"
            action="Explore sectors" destination="indices" onNavigate={marketNav}>
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
          </DeskCard>
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
