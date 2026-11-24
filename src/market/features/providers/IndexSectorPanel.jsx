import React from 'react';
import { BSE_GROUPS } from './bseCoverage.js';
import { OPEN_SOURCE_REFERENCE_LINKS } from '../../../services/marketFreeOpenPolicy.js';

import { SECTOR_RESEARCH_CATALOG, selectSectorResearch, selectMarketBreadth } from '../indices/sectorResearchResolution.js';

/**
 * IndexSectorPanel (WP-02)
 *
 * Source-aware benchmark and sectoral display panel.
 * Disambiguates group selection from navigation and avoids fake performance figures.
 */
export function IndexSectorPanel({
  compact = false,
  activeGroup = 'indices',
  onSelectProviderGroup,
  onNavigate,
  className = '',
}) {
  const normalizedGroup = BSE_GROUPS.includes(activeGroup) ? activeGroup : 'indices';
  const sectors = SECTOR_RESEARCH_CATALOG.map(item => selectSectorResearch(item.id));
  const breadth = selectMarketBreadth();

  const handleGroupSelect = (group) => {
    if (typeof onSelectProviderGroup === 'function') {
      onSelectProviderGroup(group);
    }
  };

  const handleNav = (id) => {
    if (typeof onNavigate === 'function') {
      onNavigate(id);
    }
  };

  return (
    <div
      className={`index-sector-panel ${compact ? 'index-sector-panel--compact' : ''} ${className}`.trim()}
      aria-label="India Market Board and Sector References"
    >
      <div className="index-sector-panel__header">
        <div>
          <h2 className="index-sector-panel__title">India Market Board</h2>
          <p className="index-sector-panel__subtitle">
            Benchmark indices, sector references, and verified exchange boards
          </p>
        </div>
        {typeof onNavigate === 'function' && (
          <button
            type="button"
            className="index-sector-panel__nav-btn"
            onClick={() => handleNav('indices')}
          >
            Indices Workspace →
          </button>
        )}
      </div>

      {/* 1. MARKET BENCHMARKS */}
      <section className="index-sector-panel__section" aria-labelledby="heading-benchmarks">
        <h3 id="heading-benchmarks" className="index-sector-panel__section-title">
          Market Benchmarks
        </h3>
        <div className="benchmark-grid">
          <div className="benchmark-card">
            <div className="benchmark-card__top">
              <strong>NIFTY 50</strong>
              <span className="benchmark-card__badge benchmark-card__badge--nse">NSE Official</span>
            </div>
            <p className="benchmark-card__desc">National Stock Exchange 50-stock index</p>
            <a
              href={OPEN_SOURCE_REFERENCE_LINKS?.nseIndices || 'https://www.nseindia.com/market-data/live-market-indices'}
              target="_blank"
              rel="noopener noreferrer"
              className="benchmark-card__link"
            >
              Open Exchange Board ↗
            </a>
          </div>

          <div className="benchmark-card">
            <div className="benchmark-card__top">
              <strong>SENSEX</strong>
              <span className="benchmark-card__badge benchmark-card__badge--bse">BSE Provider EOD</span>
            </div>
            <p className="benchmark-card__desc">BSE 30-stock sensitive index</p>
            <button
              type="button"
              className="benchmark-card__action-btn"
              onClick={() => handleGroupSelect('indices')}
              aria-label="Select BSE Indices for provider board"
            >
              Select Provider Group
            </button>
          </div>

          <div className="benchmark-card">
            <div className="benchmark-card__top">
              <strong>BANK NIFTY</strong>
              <span className="benchmark-card__badge benchmark-card__badge--nse">NSE Official</span>
            </div>
            <p className="benchmark-card__desc">12 major Indian banking equities</p>
            <a
              href={OPEN_SOURCE_REFERENCE_LINKS?.nseIndices || 'https://www.nseindia.com/market-data/live-market-indices'}
              target="_blank"
              rel="noopener noreferrer"
              className="benchmark-card__link"
            >
              Open Exchange Board ↗
            </a>
          </div>

          <div className="benchmark-card">
            <div className="benchmark-card__top">
              <strong>BSE 500</strong>
              <span className="benchmark-card__badge benchmark-card__badge--bse">BSE Provider EOD</span>
            </div>
            <p className="benchmark-card__desc">Broad market index of top 500 BSE listings</p>
            <button
              type="button"
              className="benchmark-card__action-btn"
              onClick={() => handleGroupSelect('indices')}
              aria-label="Select BSE Indices for provider board"
            >
              Select Provider Group
            </button>
          </div>
        </div>
      </section>

      {/* 2. PROVIDER DISPLAY GROUP SELECTOR (Does NOT auto-fetch) */}
      <section className="index-sector-panel__section" aria-labelledby="heading-provider-selector">
        <div className="provider-group-selector">
          <span id="heading-provider-selector" className="provider-group-selector__label">
            BSE Reference Display:
          </span>
          <div className="provider-group-selector__btn-group" role="group" aria-label="Select provider display group">
            <button
              type="button"
              className={`provider-group-btn ${normalizedGroup === 'indices' ? 'is-active' : ''}`.trim()}
              aria-pressed={normalizedGroup === 'indices'}
              onClick={() => handleGroupSelect('indices')}
            >
              BSE Indices
            </button>
            <button
              type="button"
              className={`provider-group-btn ${normalizedGroup === 'equities' ? 'is-active' : ''}`.trim()}
              aria-pressed={normalizedGroup === 'equities'}
              onClick={() => handleGroupSelect('equities')}
            >
              BSE Equities
            </button>
          </div>
          <span className="provider-group-selector__note">
            (Selecting a group prepares the board; loading requires explicit consent)
          </span>
        </div>
      </section>

      {/* 3. NSE SECTOR REFERENCES */}
      <section className="index-sector-panel__section" aria-labelledby="heading-sectors">
        <h3 id="heading-sectors" className="index-sector-panel__section-title">
          NSE Sector References
        </h3>
        <p className="index-sector-panel__section-desc">
          Verified benchmark paths on the National Stock Exchange live market platform:
        </p>
        <div className="sector-link-grid">
          {sectors.map((sector) => (
            <a
              key={sector.id}
              href={sector.referenceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="sector-link-chip"
            >
              {sector.displayName} ↗
            </a>
          ))}
        </div>
      </section>

      {/* 4. MARKET MOVERS */}
      <section className="index-sector-panel__section" aria-labelledby="heading-movers">
        <h3 id="heading-movers" className="index-sector-panel__section-title">
          Market Movers & Live Exchange Overviews
        </h3>
        {breadth.state === 'UNAVAILABLE' && <p role="status">Market breadth unavailable — no qualified exchange-wide dataset. Tracked shares are not exchange-wide advances or declines.</p>}
        <div className="movers-links-row">
          <a
            href={OPEN_SOURCE_REFERENCE_LINKS?.nseEquities || 'https://www.nseindia.com/market-data/live-equity-market'}
            target="_blank"
            rel="noopener noreferrer"
            className="movers-btn"
          >
            Official NSE Gainers ↗
          </a>
          <a
            href={OPEN_SOURCE_REFERENCE_LINKS?.nseEquities || 'https://www.nseindia.com/market-data/live-equity-market'}
            target="_blank"
            rel="noopener noreferrer"
            className="movers-btn"
          >
            Official NSE Losers ↗
          </a>
          <a
            href="https://www.bseindia.com/markets/equity/EQReports/mktwatch_gainloser.aspx"
            target="_blank"
            rel="noopener noreferrer"
            className="movers-btn"
          >
            BSE Market Overview ↗
          </a>
        </div>
        <p className="index-sector-panel__disclaimer">
          <strong>Notice:</strong> No invented price changes, synthesized rankings, or quote observation times.
          Verify all figures directly on official exchange boards before investment decisions.
        </p>
      </section>
    </div>
  );
}

export default IndexSectorPanel;
