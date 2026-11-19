import React from 'react';
import { DataStatePill } from './Header';
import MarketTicker from './MarketTicker';
import { formatMarketTimestamp, getMarketSessionState, isMarketSeedRow, isUsableMarketQuoteRow } from '../utils/marketSession';
import { summarizeMarketSourceHealth } from '../services/marketTrust';

function getToneClass(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed === 0) return 'market-tone--neutral';
    return parsed > 0 ? 'market-tone--positive' : 'market-tone--negative';
}

const MarketStickyHeader = ({ marketData, indices = [], onRefresh, loading, sessionState, tradingHolidays = [] }) => {
    const displayIndices = (Array.isArray(indices) ? indices : []).filter(isUsableMarketQuoteRow).slice(0, 4);
    const session = sessionState || getMarketSessionState({ tradingHolidays });
    const sourceTime = isMarketSeedRow(marketData) ? null : formatMarketTimestamp(marketData?.fetchedAt);
    const sourceSummary = summarizeMarketSourceHealth(marketData || {});
    const { modeStr, modeLabel } = sourceSummary;
    const counts = sourceSummary.counts;


    return (
        <div className="market-sticky-header">
            <div className="market-sticky-header__top">
                <div className="market-sticky-header__heading">
                    <div className="market-sticky-header__eyebrow">India Market Desk</div>
                    <div className="market-sticky-header__title-row">
                        <h2 className="market-sticky-header__title">Markets</h2>
                        <DataStatePill mode={modeStr} label={modeLabel} />
                        <span className={`market-status-pill market-status-pill--${session.tone}`} title={session.reason}>
                            {loading ? 'Refreshing' : session.label}
                        </span>
                    </div>
                    <div className="market-sticky-header__meta">
                        Feed timestamp {sourceTime || 'unavailable'}
                    </div>
                </div>

                <div className="market-sticky-header__actions">
                    <div className="market-source-summary">
                        <span>{counts.live || 0} updated</span>
                        <span>{counts.snapshot || 0} snapshot</span>
                        <span>{counts.stale || 0} stale</span>
                        <span>{counts.seed || 0} seed</span>
                        <span>{counts.failed || 0} failed</span>
                    </div>
                    <button
                        onClick={onRefresh}
                        disabled={loading}
                        className={`market-refresh-btn ${loading ? 'is-loading' : ''}`}
                        aria-label="Refresh market data"
                        title="Refresh market data"
                    >
                        {loading ? '↻' : '⟳'}
                    </button>
                </div>
            </div>

            <div className="market-sticky-header__ticker">
                <MarketTicker />
            </div>

            <div className="market-sticky-header__rail">
                {displayIndices.map((index) => {
                    const isUp = index.direction === 'up' || Number(index.change) >= 0;
                    return (
                        <div key={`${index.name}-${index.symbol || index.value}`} className={`market-sticky-header__rail-item ${getToneClass(index.changePercent)}`}>
                            <div className="market-sticky-header__rail-name">{index.name}</div>
                            <div className="market-sticky-header__rail-value">{index.value}</div>
                            <div className={`market-sticky-header__rail-change ${isUp ? 'text-success' : 'text-danger'}`}>
                                {isUp ? '▲' : '▼'} {Math.abs(Number(index.changePercent || 0)).toFixed(2)}%
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default MarketStickyHeader;
