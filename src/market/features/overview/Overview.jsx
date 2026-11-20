import React, { useState, useMemo } from 'react';
import { MarketNav } from './MarketNav.jsx';
import { MarketSessionHeader } from './MarketSessionHeader.jsx';
import { OverviewSlotErrorBoundary } from './OverviewSlotErrorBoundary.jsx';
import equityUniverseConfig from '../../../config/marketEquityUniverse.json' with { type: 'json' };
import { OPEN_SOURCE_REFERENCE_LINKS } from '../../../services/marketFreeOpenPolicy.js';
import { safeGetJson } from '../../../data/safeStorage.js';
import { MARKET_LEGACY_STORAGE_KEYS } from '../../contracts/index.js';
import './overview.css';
import './print.css';

/**
 * Default empty slot mapping (P0-02).
 * Each slot accepts a React node (or null if unintegrated).
 */
export const DEFAULT_OVERVIEW_SLOTS = Object.freeze({
  providerBoard: null,  // WP-02
  watchlist: null,      // WP-03
  fundSearch: null,     // WP-05
  currency: null,       // WP-06
  marketBriefing: null, // WP-07
  events: null,         // WP-07
  portfolio: null,      // WP-04
  investmentLab: null,  // WP-08
  sourceHealth: null,   // WP-09
});

/**
 * 16 Authoritative Tracked Symbols (P0-03)
 * Reused from src/config/marketEquityUniverse.json.
 */
const TRACKED_SYMBOLS = Object.freeze(
  Array.isArray(equityUniverseConfig?.symbols) ? equityUniverseConfig.symbols : []
);

/**
 * Overview Component
 *
 * Dense, responsive, India-first Market Desk landing workspace.
 * Features 8 content sections + 1 global source health strip.
 */
export function Overview({
  compact = false,
  onNavigate,
  data = {},
  settings = {},
  slots: customSlots = {},
  onRefresh,
  refreshing = false,
  currentWorkspace = 'overview',
  hideNav = false,
}) {
  const slots = { ...DEFAULT_OVERVIEW_SLOTS, ...customSlots };
  const [omrInput, setOmrInput] = useState('100');
  const [fundQuery, setFundQuery] = useState('');
  const [healthExpanded, setHealthExpanded] = useState(false);

  // Non-destructive read-only preference counts (WP01-T09)
  const savedWatchlist = useMemo(() => {
    const list = safeGetJson(MARKET_LEGACY_STORAGE_KEYS?.watchlist || 'nw7.india-watchlist.v1', []);
    return Array.isArray(list) ? list : [];
  }, []);

  const savedFunds = useMemo(() => {
    const list = safeGetJson(MARKET_LEGACY_STORAGE_KEYS?.funds || 'nw7.market-saved-funds.v1', []);
    return Array.isArray(list) ? list : [];
  }, []);

  const handleNav = (id) => {
    if (typeof onNavigate === 'function') {
      onNavigate(id);
    }
  };

  return (
    <div className={`market-overview ${compact ? 'market-overview--compact' : ''}`.trim()}>
      {/* Session status & indicative IST header */}
      <MarketSessionHeader
        sessionState={data?.sessionState}
        sourceMode={data?.sourceMode || 'free-open-only'}
        onNavigate={handleNav}
        onRefresh={onRefresh}
        refreshing={refreshing}
        tradingHolidays={settings?.tradingHolidays}
      />

      {/* Primary 9-workspace desktop / 4-control mobile navigation */}
      {!hideNav && (
        <MarketNav
          currentWorkspace={currentWorkspace}
          onNavigate={handleNav}
        />
      )}

      <div className="market-overview__grid">
        {/* ==================================================================== */}
        {/* SECTION 1: MARKET PULSE & SOURCE ACTIONS */}
        {/* ==================================================================== */}
        <section
          className="market-overview__card market-overview__card--full"
          aria-labelledby="section-market-pulse"
        >
          <div className="market-overview__card-header">
            <div>
              <h2 id="section-market-pulse" className="market-overview__card-title">
                India Market Pulse
              </h2>
              <p className="market-overview__card-subtitle">
                Official exchange reference links and EOD provider boards
              </p>
            </div>
            <button
              type="button"
              className="market-overview__link-btn"
              onClick={() => handleNav('indices')}
            >
              All Indices & Sectors →
            </button>
          </div>

          <div className="market-pulse-grid">
            <div className="market-pulse-tile">
              <div className="market-pulse-tile__top">
                <strong>NIFTY 50</strong>
                <span className="market-pulse-tile__badge market-pulse-tile__badge--official">
                  NSE Official
                </span>
              </div>
              <p className="market-pulse-tile__desc">Benchmark 50-stock index</p>
              <div className="market-pulse-tile__actions">
                <a
                  href={OPEN_SOURCE_REFERENCE_LINKS.nseIndices}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="market-pulse-tile__link"
                >
                  NSE Live Market ↗
                </a>
              </div>
            </div>

            <div className="market-pulse-tile">
              <div className="market-pulse-tile__top">
                <strong>SENSEX</strong>
                <span className="market-pulse-tile__badge market-pulse-tile__badge--provider">
                  BSE Provider (EOD)
                </span>
              </div>
              <p className="market-pulse-tile__desc">30-stock sensitive index</p>
              <div className="market-pulse-tile__actions">
                <a
                  href="https://www.tradingview.com/symbols/BSE-SENSEX/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="market-pulse-tile__link"
                >
                  TradingView BSE ↗
                </a>
              </div>
            </div>

            <div className="market-pulse-tile">
              <div className="market-pulse-tile__top">
                <strong>BANK NIFTY</strong>
                <span className="market-pulse-tile__badge market-pulse-tile__badge--official">
                  NSE Official
                </span>
              </div>
              <p className="market-pulse-tile__desc">12 major banking stocks</p>
              <div className="market-pulse-tile__actions">
                <a
                  href={OPEN_SOURCE_REFERENCE_LINKS.nseIndices}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="market-pulse-tile__link"
                >
                  NSE Sector Board ↗
                </a>
              </div>
            </div>

            <div className="market-pulse-tile">
              <div className="market-pulse-tile__top">
                <strong>BSE 500</strong>
                <span className="market-pulse-tile__badge market-pulse-tile__badge--provider">
                  BSE Provider (EOD)
                </span>
              </div>
              <p className="market-pulse-tile__desc">Broad market equity index</p>
              <div className="market-pulse-tile__actions">
                <a
                  href="https://www.tradingview.com/symbols/BSE-BSE500/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="market-pulse-tile__link"
                >
                  TradingView BSE ↗
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ==================================================================== */}
        {/* ROW 2: SECTION 2 (BSE PROVIDER BOARD) + SECTION 2B (MARKET BRIEFING) */}
        {/* ==================================================================== */}
        <section
          className="market-overview__card market-overview__card--half"
          aria-labelledby="section-bse-provider"
        >
          <div className="market-overview__card-header">
            <div>
              <h2 id="section-bse-provider" className="market-overview__card-title">
                BSE Provider Board
              </h2>
              <p className="market-overview__card-subtitle">
                TradingView India EOD Reference
              </p>
            </div>
          </div>

          <OverviewSlotErrorBoundary
            slotTitle="BSE Provider Board"
            workspaceId="indices"
            workspaceTitle="Indices & Sectors"
            onNavigate={handleNav}
          >
            {slots.providerBoard || (
              <div className="overview-fallback-card">
                <p className="overview-fallback-card__text">
                  Free, branded provider display of BSE equities and indices.
                  Provider scripts connect directly to TradingView CDN only upon user opt-in.
                </p>
                <div className="overview-fallback-card__notice">
                  Data level: End of Day (EOD) · No quote extraction or redistribution
                </div>
                <div className="overview-fallback-card__actions">
                  <button
                    type="button"
                    className="market-btn market-btn--primary"
                    onClick={() => handleNav('indices')}
                  >
                    Open Indices & Provider Board
                  </button>
                  <a
                    href="https://in.tradingview.com/widget-docs/markets/asia-pacific/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="market-btn market-btn--secondary"
                  >
                    Provider Coverage Docs ↗
                  </a>
                </div>
              </div>
            )}
          </OverviewSlotErrorBoundary>
        </section>

        <section
          className="market-overview__card market-overview__card--half"
          aria-labelledby="section-market-briefing"
        >
          <div className="market-overview__card-header">
            <div>
              <h2 id="section-market-briefing" className="market-overview__card-title">
                Market Briefing
              </h2>
              <p className="market-overview__card-subtitle">
                Source-dated financial news & verified events
              </p>
            </div>
            <button
              type="button"
              className="market-overview__link-btn"
              onClick={() => handleNav('ipo-events')}
            >
              All Events & News →
            </button>
          </div>

          <OverviewSlotErrorBoundary
            slotTitle="Market Briefing"
            workspaceId="ipo-events"
            workspaceTitle="IPO & Events"
            onNavigate={handleNav}
          >
            {slots.marketBriefing || (
              <div className="overview-fallback-card">
                <p className="overview-fallback-card__text">
                  Curated financial headlines and market schedules. Articles retain original
                  publication dates and publisher source identity without automated speculation.
                </p>
                <ul className="overview-bullet-list">
                  <li>Exchange trading holidays & settlement timetables</li>
                  <li>RBI monetary policy & macro event milestones</li>
                  <li>Verified corporate earnings call schedules</li>
                </ul>
                <div className="overview-fallback-card__actions">
                  <button
                    type="button"
                    className="market-btn market-btn--secondary"
                    onClick={() => handleNav('ipo-events')}
                  >
                    View Financial Briefing
                  </button>
                </div>
              </div>
            )}
          </OverviewSlotErrorBoundary>
        </section>

        {/* ==================================================================== */}
        {/* ROW 3: SECTION 3 (MY WATCHLIST) + SECTION 4 (MOVERS & SECTORS)      */}
        {/* ==================================================================== */}
        <section
          className="market-overview__card market-overview__card--half"
          aria-labelledby="section-watchlist"
        >
          <div className="market-overview__card-header">
            <div>
              <h2 id="section-watchlist" className="market-overview__card-title">
                My Watchlist
              </h2>
              <p className="market-overview__card-subtitle">
                Saved: {savedWatchlist.length}/12 (Tracked NSE Universe: {TRACKED_SYMBOLS.length})
              </p>
            </div>
            <button
              type="button"
              className="market-overview__link-btn"
              onClick={() => handleNav('equity')}
            >
              Manage Watchlist →
            </button>
          </div>

          <OverviewSlotErrorBoundary
            slotTitle="Watchlist"
            workspaceId="equity"
            workspaceTitle="Equity Research"
            onNavigate={handleNav}
          >
            {slots.watchlist || (
              <div className="overview-fallback-card">
                <p className="overview-fallback-card__text">
                  Track up to 12 Indian equities locally. Canonical exchange keys (e.g. <code>NSE:INFY</code>)
                  with direct links to official quote boards.
                </p>

                <div className="watchlist-preview-list">
                  {TRACKED_SYMBOLS.slice(0, 4).map((symbol) => (
                    <div key={symbol} className="watchlist-preview-row">
                      <div className="watchlist-preview-row__identity">
                        <strong>NSE:{symbol}</strong>
                        <span className="watchlist-preview-row__sub">National Stock Exchange</span>
                      </div>
                      <div className="watchlist-preview-row__actions">
                        <a
                          href={`https://www.nseindia.com/get-quotes/equity?symbol=${symbol}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="watchlist-preview-row__link"
                        >
                          NSE Quote ↗
                        </a>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="overview-fallback-card__actions">
                  <button
                    type="button"
                    className="market-btn market-btn--primary"
                    onClick={() => handleNav('equity')}
                  >
                    + Add / Edit Watchlist
                  </button>
                  <button
                    type="button"
                    className="market-btn market-btn--secondary"
                    onClick={() => handleNav('equity')}
                  >
                    Import / Export CSV
                  </button>
                </div>
              </div>
            )}
          </OverviewSlotErrorBoundary>
        </section>

        <section
          className="market-overview__card market-overview__card--half"
          aria-labelledby="section-movers-sectors"
        >
          <div className="market-overview__card-header">
            <div>
              <h2 id="section-movers-sectors" className="market-overview__card-title">
                Movers & Sector References
              </h2>
              <p className="market-overview__card-subtitle">
                Official exchange performance references
              </p>
            </div>
            <button
              type="button"
              className="market-overview__link-btn"
              onClick={() => handleNav('indices')}
            >
              Explore Sectors →
            </button>
          </div>

          <div className="overview-fallback-card">
            <p className="overview-fallback-card__text">
              Track key sector indices and verified top movers directly on exchange boards.
              We do not publish fabricated performance numbers without qualifying source rights.
            </p>

            <div className="sector-pill-list">
              <span className="sector-pill">NIFTY BANK</span>
              <span className="sector-pill">NIFTY IT</span>
              <span className="sector-pill">NIFTY PHARMA</span>
              <span className="sector-pill">NIFTY AUTO</span>
            </div>

            <div className="overview-fallback-card__notice">
              Official data sources: NSE Live Market & BSE India Archive
            </div>

            <div className="overview-fallback-card__actions">
              <a
                href={OPEN_SOURCE_REFERENCE_LINKS.nseEquities}
                target="_blank"
                rel="noopener noreferrer"
                className="market-btn market-btn--secondary"
              >
                Official NSE Gainers / Losers ↗
              </a>
              <button
                type="button"
                className="market-btn market-btn--secondary"
                onClick={() => handleNav('indices')}
              >
                View Sector Indices
              </button>
            </div>
          </div>
        </section>

        {/* ==================================================================== */}
        {/* ROW 4: SECTION 5 (MUTUAL FUND SEARCH) + SECTION 6 (CURRENCY QUICK)   */}
        {/* ==================================================================== */}
        <section
          className="market-overview__card market-overview__card--half"
          aria-labelledby="section-fund-search"
        >
          <div className="market-overview__card-header">
            <div>
              <h2 id="section-fund-search" className="market-overview__card-title">
                Mutual Fund Quick Search
              </h2>
              <p className="market-overview__card-subtitle">
                Direct on-demand NAV lookup via MFapi.in · Saved: {savedFunds.length}/12
              </p>
            </div>
            <button
              type="button"
              className="market-overview__link-btn"
              onClick={() => handleNav('funds')}
            >
              Fund Workspace →
            </button>
          </div>

          <OverviewSlotErrorBoundary
            slotTitle="Mutual Fund Search"
            workspaceId="funds"
            workspaceTitle="Mutual Funds"
            onNavigate={handleNav}
          >
            {slots.fundSearch || (
              <div className="overview-fallback-card">
                <form
                  className="quick-search-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleNav('funds');
                  }}
                >
                  <label htmlFor="overview-fund-query" className="quick-search-form__label">
                    Search scheme name or 6-digit AMFI code
                  </label>
                  <div className="quick-search-form__row">
                    <input
                      id="overview-fund-query"
                      type="text"
                      className="market-input"
                      value={fundQuery}
                      onChange={(e) => setFundQuery(e.target.value)}
                      placeholder="e.g. 120503 or Nifty 50"
                    />
                    <button type="submit" className="market-btn market-btn--primary">
                      Find in Funds
                    </button>
                  </div>
                </form>

                <p className="overview-fallback-card__caption">
                  Lookup latest NAV, historical CAGR, and max drawdown for individual schemes.
                  No bulk static AMFI dumps.
                </p>

                <div className="overview-fallback-card__actions">
                  <button
                    type="button"
                    className="market-btn market-btn--secondary"
                    onClick={() => handleNav('funds')}
                  >
                    View Saved Funds ({savedFunds.length})
                  </button>
                  <a
                    href={OPEN_SOURCE_REFERENCE_LINKS.amfiNAV}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="market-btn market-btn--secondary"
                  >
                    Official AMFI Portal ↗
                  </a>
                </div>
              </div>
            )}
          </OverviewSlotErrorBoundary>
        </section>

        <section
          className="market-overview__card market-overview__card--half"
          aria-labelledby="section-currency-tool"
        >
          <div className="market-overview__card-header">
            <div>
              <h2 id="section-currency-tool" className="market-overview__card-title">
                OMR / INR Currency Quick Tool
              </h2>
              <p className="market-overview__card-subtitle">
                Open-source exchange rates via Frankfurter API
              </p>
            </div>
            <button
              type="button"
              className="market-overview__link-btn"
              onClick={() => handleNav('currency-macro')}
            >
              Currency & Macro →
            </button>
          </div>

          <OverviewSlotErrorBoundary
            slotTitle="Currency Quick Tool"
            workspaceId="currency-macro"
            workspaceTitle="Currency & Macro"
            onNavigate={handleNav}
          >
            {slots.currency || (
              <div className="overview-fallback-card">
                <div className="currency-quick-row">
                  <label className="currency-quick-label">
                    <span>Amount (OMR)</span>
                    <input
                      type="number"
                      className="market-input"
                      value={omrInput}
                      min="1"
                      step="any"
                      onChange={(e) => setOmrInput(e.target.value)}
                      placeholder="100"
                    />
                  </label>
                  <div className="currency-quick-arrow" aria-hidden="true">→</div>
                  <div className="currency-quick-target">
                    <span className="currency-quick-target__label">Target Currency</span>
                    <strong className="currency-quick-target__val">INR (Indian Rupee)</strong>
                  </div>
                </div>

                <div className="overview-fallback-card__notice">
                  Source: Frankfurter API · Rates older than 3 days labeled HISTORICAL
                </div>

                <div className="overview-fallback-card__actions">
                  <button
                    type="button"
                    className="market-btn market-btn--primary"
                    onClick={() => handleNav('currency-macro')}
                  >
                    Fetch Latest Rate in Workspace
                  </button>
                  <a
                    href={OPEN_SOURCE_REFERENCE_LINKS.frankfurter}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="market-btn market-btn--secondary"
                  >
                    Frankfurter Docs ↗
                  </a>
                </div>
              </div>
            )}
          </OverviewSlotErrorBoundary>
        </section>

        {/* ==================================================================== */}
        {/* ROW 5: SECTION 7 (IPO / NFO / EVENTS) + SECTION 8 (PORTFOLIO / LAB)   */}
        {/* ==================================================================== */}
        <section
          className="market-overview__card market-overview__card--half"
          aria-labelledby="section-ipo-events"
        >
          <div className="market-overview__card-header">
            <div>
              <h2 id="section-ipo-events" className="market-overview__card-title">
                IPO / NFO / Verified Events
              </h2>
              <p className="market-overview__card-subtitle">
                Official issue calendars and economic milestones
              </p>
            </div>
            <button
              type="button"
              className="market-overview__link-btn"
              onClick={() => handleNav('ipo-events')}
            >
              Public Issues →
            </button>
          </div>

          <OverviewSlotErrorBoundary
            slotTitle="IPO & Events"
            workspaceId="ipo-events"
            workspaceTitle="IPO & Events"
            onNavigate={handleNav}
          >
            {slots.events || (
              <div className="overview-fallback-card">
                <p className="overview-fallback-card__text">
                  Direct links to verified primary market issues. We report source status as
                  <strong> UNVERIFIED</strong> when feeds are unreachable, never claiming zero issues.
                </p>

                <div className="ipo-official-links">
                  <a
                    href={OPEN_SOURCE_REFERENCE_LINKS.nseIPO}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ipo-link-item"
                  >
                    <span>NSE Public Issues / IPO</span>
                    <small>Official upcoming issue calendar ↗</small>
                  </a>
                  <a
                    href={OPEN_SOURCE_REFERENCE_LINKS.bseIPO}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ipo-link-item"
                  >
                    <span>BSE Public Issues</span>
                    <small>Official public issue schedule ↗</small>
                  </a>
                  <a
                    href="https://www.amfiindia.com/new-fund-offer"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ipo-link-item"
                  >
                    <span>AMFI New Fund Offers (NFO)</span>
                    <small>Official mutual fund NFO listings ↗</small>
                  </a>
                </div>

                <div className="overview-fallback-card__actions">
                  <button
                    type="button"
                    className="market-btn market-btn--secondary"
                    onClick={() => handleNav('ipo-events')}
                  >
                    Open IPO & Events Workspace
                  </button>
                </div>
              </div>
            )}
          </OverviewSlotErrorBoundary>
        </section>

        <section
          className="market-overview__card market-overview__card--half"
          aria-labelledby="section-portfolio-lab"
        >
          <div className="market-overview__card-header">
            <div>
              <h2 id="section-portfolio-lab" className="market-overview__card-title">
                Portfolio & Investment Lab
              </h2>
              <p className="market-overview__card-subtitle">
                Local private analytics and financial math
              </p>
            </div>
          </div>

          <OverviewSlotErrorBoundary
            slotTitle="Portfolio & Lab"
            workspaceId="portfolio"
            workspaceTitle="Portfolio"
            onNavigate={handleNav}
          >
            {slots.portfolio || slots.investmentLab ? (
              <div className="portfolio-lab-grid">
                {slots.portfolio || (
                  <div className="portfolio-lab-tile">
                    <strong>Private Portfolio</strong>
                    <p>
                      Offline transaction ledger. Weighted-average cost basis and manual price marks.
                      No data ever leaves your device.
                    </p>
                    <button
                      type="button"
                      className="market-btn market-btn--primary"
                      onClick={() => handleNav('portfolio')}
                    >
                      Open Portfolio
                    </button>
                  </div>
                )}
                {slots.investmentLab || (
                  <div className="portfolio-lab-tile">
                    <strong>Investment Lab</strong>
                    <p>
                      Pure mathematical tools: Standard SIP, Step-Up SIP, Lumpsum, CAGR, and robust
                      XIRR solvers.
                    </p>
                    <button
                      type="button"
                      className="market-btn market-btn--secondary"
                      onClick={() => handleNav('lab')}
                    >
                      Launch Calculators
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="overview-fallback-card">
                <div className="portfolio-lab-grid">
                  <div className="portfolio-lab-tile">
                    <strong>Private Portfolio</strong>
                    <p>
                      Offline transaction ledger. Weighted-average cost basis and manual price marks.
                      No data ever leaves your device.
                    </p>
                    <button
                      type="button"
                      className="market-btn market-btn--primary"
                      onClick={() => handleNav('portfolio')}
                    >
                      Open Portfolio
                    </button>
                  </div>

                  <div className="portfolio-lab-tile">
                    <strong>Investment Lab</strong>
                    <p>
                      Pure mathematical tools: Standard SIP, Step-Up SIP, Lumpsum, CAGR, and robust
                      XIRR solvers.
                    </p>
                    <button
                      type="button"
                      className="market-btn market-btn--secondary"
                      onClick={() => handleNav('lab')}
                    >
                      Launch Calculators
                    </button>
                  </div>
                </div>
              </div>
            )}
          </OverviewSlotErrorBoundary>
        </section>

        {/* ==================================================================== */}
        {/* GLOBAL SOURCE HEALTH STRIP (FOOTER)                                  */}
        {/* ==================================================================== */}
        <section
          className="market-overview__card market-overview__card--full market-health-strip"
          aria-labelledby="section-source-health"
        >
          <div className="market-health-strip__summary">
            <div className="market-health-strip__info">
              <h2 id="section-source-health" className="market-health-strip__title">
                Data Provenance & Source Health
              </h2>
              <p className="market-health-strip__subtitle">
                BSE widget: Opt-in | MFapi: On-demand | FX: Frankfurter | World Bank: Licensed Open Data | NSE: Official Link
              </p>
            </div>
            <div className="market-health-strip__actions">
              <button
                type="button"
                className="market-btn market-btn--secondary"
                aria-expanded={healthExpanded}
                aria-controls="overview-health-details"
                onClick={() => setHealthExpanded((prev) => !prev)}
              >
                {healthExpanded ? 'Hide Diagnostics ▲' : 'Inspect Health ▼'}
              </button>
              <button
                type="button"
                className="market-btn market-btn--primary"
                onClick={() => handleNav('health')}
              >
                Full Health Workspace →
              </button>
            </div>
          </div>

          {healthExpanded && (
            <div id="overview-health-details" className="market-health-strip__details">
              <OverviewSlotErrorBoundary
                slotTitle="Source Health Diagnostics"
                workspaceId="health"
                workspaceTitle="Data Health"
                onNavigate={handleNav}
              >
                {slots.sourceHealth || (
                  <dl className="health-dl">
                    <dt>Market Free Policy:</dt>
                    <dd><code>MARKET_FREE_OPEN_ONLY = true</code> (Zero unauthorized quote publishing)</dd>
                    <dt>BSE Display (TradingView):</dt>
                    <dd>PROVIDER_EMBED · Free branded widget · Isolated iframe</dd>
                    <dt>MFapi.in:</dt>
                    <dd>DIRECT_ON_DEMAND · User-selected schemes · Strict date verification</dd>
                    <dt>Frankfurter API:</dt>
                    <dd>DIRECT_ON_DEMAND · 3-day freshness guard · Reversible OMR/INR</dd>
                    <dt>World Bank:</dt>
                    <dd>LICENSED_OPEN_DATA · Annual reference years only · Explicit attribution</dd>
                    <dt>NSE & BSE Portals:</dt>
                    <dd>OFFICIAL_LINK · Verification links only · No quote scraping</dd>
                  </dl>
                )}
              </OverviewSlotErrorBoundary>
            </div>
          )}
        </section>
      </div>

      <footer className="market-overview__footer">
        Informational and reference data only. Original provider clocks and provenance preserved.
        Verify exchange or fund records before financial commitments.
      </footer>
    </div>
  );
}

export default Overview;
