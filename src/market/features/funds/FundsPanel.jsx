/**
 * NWv7 Market Desk R2.1 - WP-05 Mutual Funds Panel Workspace
 * Comprehensive Mutual Funds Research, NAV Acquisition, Risk Analytics & Comparison.
 *
 * Conforms to:
 * - Strict scheme identity (meta.scheme_code verification)
 * - 7-day lookback window algorithm for trailing returns & 365.25 CAGR
 * - 4,000-point truncation semantics & Available-period CAGR
 * - Multi-scheme common-date comparative analysis
 * - WP-08 calcSip contract delegation
 * - Formula-injection protected JSON/CSV import/export
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useFundStore } from './fundStore.js';
import { fundClient } from './fundClient.js';
import {
  calculateTrailingReturns,
  calculateMaxDrawdown,
  calculateAnnualizedVolatility
} from './fundMath.js';
import { FundNavChart } from './FundNavChart.jsx';
import { FundCompareModal } from './FundCompareModal.jsx';
import { FundSipModal } from './FundSipModal.jsx';
import './funds.css';

export function FundsPanel({ initialCode = null, onNavigateWorkspace = null }) {
  const { state, actions } = useFundStore();

  const [activeTab, setActiveTab] = useState(() => (initialCode ? 'RESEARCH' : 'SAVED')); // 'SAVED' | 'RESEARCH' | 'SEARCH'
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState(null);

  const [selectedResearchCode, setSelectedResearchCode] = useState(() => initialCode || state.selectedCode || state.savedCodes[0] || null);
  const [historyRange, setHistoryRange] = useState('1Y');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);

  // Modals
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [isSipOpen, setIsSipOpen] = useState(false);

  // Sync initialCode prop change during render
  const [prevInitialCode, setPrevInitialCode] = useState(initialCode);
  if (initialCode && initialCode !== prevInitialCode) {
    setPrevInitialCode(initialCode);
    setSelectedResearchCode(initialCode);
    setActiveTab('RESEARCH');
  }

  // Load history when entering research view or changing selected scheme
  const loadActiveHistory = useCallback(async (code, force = false) => {
    if (!code) return;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      await actions.fetchSchemeHistory(code, { force });
    } catch (err) {
      setHistoryError(err.message || 'Failed to load historical observations');
    } finally {
      setHistoryLoading(false);
    }
  }, [actions]);

  useEffect(() => {
    if (activeTab === 'RESEARCH' && selectedResearchCode) {
      loadActiveHistory(selectedResearchCode);
    }
  }, [activeTab, selectedResearchCode, loadActiveHistory]);

  // Active researched scheme data
  const currentHistory = state.historyCache[selectedResearchCode];

  // Compute live financial analytics for active scheme
  const analytics = useMemo(() => {
    if (!currentHistory || !Array.isArray(currentHistory.observations) || currentHistory.observations.length < 2) {
      return null;
    }
    const obs = currentHistory.observations;
    const trailing = calculateTrailingReturns(obs);
    const mdd = calculateMaxDrawdown(obs);
    const vol = calculateAnnualizedVolatility(obs);

    return { trailing, mdd, vol };
  }, [currentHistory]);

  // Debounced search
  useEffect(() => {
    if (activeTab !== 'SEARCH' || searchQuery.trim().length < 3) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearchBusy(true);
      setSearchError(null);
      try {
        const rows = await fundClient.searchFunds(searchQuery, { signal: controller.signal });
        setSearchResults(rows);
      } catch (err) {
        if (!controller.signal.aborted) {
          setSearchError(err.message || 'Search failed');
        }
      } finally {
        if (!controller.signal.aborted) setSearchBusy(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery, activeTab]);

  const handleSaveCode = (code) => {
    const res = actions.saveFund(code);
    if (!res.ok) {
      alert(res.error);
    }
  };

  const handleInspectScheme = (code) => {
    setSelectedResearchCode(code);
    setActiveTab('RESEARCH');
  };

  const handleRefreshAll = () => {
    actions.batchFetchSaved(null, { force: true });
  };

  const handleExportCsv = () => {
    const csv = actions.exportCsv();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mutual_funds_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJson = () => {
    const json = actions.exportJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mutual_funds_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="funds-workspace">
      {/* Top Header Bar */}
      <div className="funds-header">
        <div className="funds-title-group">
          <div className="funds-title-row">
            {onNavigateWorkspace && (
              <button
                type="button"
                className="portfolio-btn portfolio-btn-secondary btn-xs"
                onClick={() => onNavigateWorkspace('overview')}
                title="Return to Market Overview"
              >
                &larr; Overview
              </button>
            )}
            <h2 className="funds-title">Mutual Funds Desk</h2>
            <span className="funds-count-badge">
              {state.savedCodes.length} / 12 Saved Schemes
            </span>
          </div>
          <span className="funds-subtitle">
            Direct on-demand NAV acquisition, 365.25-day CAGR analytics, and multi-scheme comparison.
          </span>
        </div>

        <div className="funds-header-actions">
          <button
            type="button"
            className="portfolio-btn portfolio-btn-secondary"
            onClick={handleExportJson}
            title="Full JSON backup including history cache"
          >
            Backup JSON
          </button>
          <button
            type="button"
            className="portfolio-btn portfolio-btn-secondary"
            onClick={handleExportCsv}
            title="Export saved funds CSV"
          >
            Export CSV
          </button>
          {state.savedCodes.length >= 2 && (
            <button
              type="button"
              className="portfolio-btn portfolio-btn-outline"
              onClick={() => setIsCompareOpen(true)}
            >
              Compare Funds
            </button>
          )}
          <button
            type="button"
            className="portfolio-btn portfolio-btn-primary"
            onClick={() => setActiveTab('SEARCH')}
          >
            + Find Fund
          </button>
        </div>
      </div>

      {/* Mandatory Regulatory / Budget Banner */}
      <div className="funds-disclaimer-banner" role="note">
        <strong>$0 Budget & Free Direct Source:</strong> NAVs are fetched on-demand directly from MFapi with zero background boot polling.
        All metrics use true calendar dates and 365.25-day CAGR annualization.
      </div>

      {/* Cooldown or Storage Warnings */}
      {fundClient.isCoolingDown() && (
        <div className="portfolio-alert portfolio-alert-warning" role="alert">
          Provider rate limit reached. Local cooldown active for {fundClient.getCooldownRemainingSeconds()}s. Existing cached NAVs remain available.
        </div>
      )}
      {state.storageWarning && (
        <div className="portfolio-alert portfolio-alert-warning" role="alert">
          {state.storageWarning}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="portfolio-tabs-bar">
        <button
          type="button"
          className={`portfolio-tab-btn ${activeTab === 'SAVED' ? 'active' : ''}`}
          onClick={() => setActiveTab('SAVED')}
        >
          My Saved Funds ({state.savedCodes.length})
        </button>
        <button
          type="button"
          className={`portfolio-tab-btn ${activeTab === 'RESEARCH' ? 'active' : ''}`}
          onClick={() => setActiveTab('RESEARCH')}
          disabled={!selectedResearchCode}
        >
          Scheme Research {selectedResearchCode ? `(${selectedResearchCode})` : ''}
        </button>
        <button
          type="button"
          className={`portfolio-tab-btn ${activeTab === 'SEARCH' ? 'active' : ''}`}
          onClick={() => setActiveTab('SEARCH')}
        >
          Find a Fund
        </button>
      </div>

      {/* TAB 1: SAVED FUNDS */}
      {activeTab === 'SAVED' && (
        <div className="funds-tab-content">
          <div className="funds-toolbar">
            <span className="toolbar-info">
              Saved schemes ({state.savedCodes.length} / 12). Changes persist to <code>nw7.market-saved-funds.v1</code>.
            </span>
            {state.savedCodes.length > 0 && (
              <button
                type="button"
                className="portfolio-btn portfolio-btn-secondary btn-sm"
                onClick={handleRefreshAll}
              >
                Refresh All NAVs
              </button>
            )}
          </div>

          {state.savedCodes.length === 0 ? (
            <div className="portfolio-empty-state">
              <h4>No saved funds</h4>
              <p>Search by fund house or scheme name to track up to 12 schemes.</p>
              <button
                type="button"
                className="portfolio-btn portfolio-btn-primary"
                onClick={() => setActiveTab('SEARCH')}
              >
                Search Schemes &rarr;
              </button>
            </div>
          ) : (
            <div className="portfolio-table-container">
              <table className="portfolio-table" aria-label="Saved mutual funds table">
                <thead>
                  <tr>
                    <th>Scheme Code & Name</th>
                    <th>Plan / Option</th>
                    <th className="num">Latest NAV</th>
                    <th>Source Date</th>
                    <th>Status / Source</th>
                    <th className="actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {state.savedCodes.map((code) => {
                    const status = state.navByCode[code];
                    const known = status?.value || actions.readCachedNav(code);
                    const isLoading = status?.status === 'loading';
                    const isError = status?.status === 'error';
                    const isCooldown = status?.status === 'cooldown';

                    return (
                      <tr key={code}>
                        <td>
                          <div className="scheme-name-cell">
                            <span className="instrument-key-badge font-mono">{code}</span>
                            <strong>{known?.schemeName || `Scheme ${code}`}</strong>
                            <div className="text-muted"><small>{known?.category || 'Mutual Fund'}</small></div>
                          </div>
                        </td>
                        <td>
                          <div className="scheme-plan-tags">
                            <span className="badge-tag tag-neutral">{known?.plan || 'Direct'}</span>
                            <span className={`badge-tag ${known?.isIdcw ? 'tag-warning' : 'tag-success'}`}>
                              {known?.option || 'Growth'}
                            </span>
                          </div>
                        </td>
                        <td className="num font-mono">
                          {known?.nav ? `₹${Number(known.nav).toFixed(2)}` : '—'}
                        </td>
                        <td className="font-mono">
                          {known?.date || 'Unavailable'}
                        </td>
                        <td>
                          {isLoading ? (
                            <span className="portfolio-badge badge-warning">Loading…</span>
                          ) : isCooldown ? (
                            <span className="portfolio-badge badge-warning">Cooldown</span>
                          ) : isError ? (
                            <span className="portfolio-badge badge-error">Failed</span>
                          ) : known?.delivery === 'cache' ? (
                            <span className="portfolio-badge badge-neutral" title={`Checked on ${new Date(known.checkedAt).toLocaleDateString()}`}>Cache IST</span>
                          ) : known?.delivery === 'provider' ? (
                            <span className="portfolio-badge badge-success">Live Provider</span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="actions">
                          <div className="action-buttons-wrap">
                            <button
                              type="button"
                              className="portfolio-btn portfolio-btn-secondary btn-xs"
                              onClick={() => handleInspectScheme(code)}
                              title="Inspect NAV trajectory and CAGR analytics"
                            >
                              Inspect
                            </button>
                            <button
                              type="button"
                              className="portfolio-btn portfolio-btn-secondary btn-xs"
                              onClick={() => actions.fetchSchemeNav(code, { force: true })}
                              title="Force fresh network check"
                            >
                              Refresh
                            </button>
                            <button
                              type="button"
                              className="portfolio-btn portfolio-btn-danger btn-xs"
                              onClick={() => actions.removeFund(code)}
                              title="Remove from saved funds"
                            >
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SCHEME RESEARCH & ANALYTICS */}
      {activeTab === 'RESEARCH' && selectedResearchCode && (
        <div className="funds-tab-content">
          {historyLoading && (
            <div className="fund-loading-status" role="status">
              Loading historical series for scheme {selectedResearchCode}…
            </div>
          )}
          {historyError && (
            <div className="portfolio-alert portfolio-alert-error" role="alert">
              {historyError}
            </div>
          )}

          {currentHistory && (
            <>
              {/* Scheme Metadata Card */}
              <div className="fund-research-header-card">
                <div className="research-title-col">
                  <div className="scheme-tag-row">
                    <span className="instrument-key-badge font-mono">{currentHistory.schemeCode}</span>
                    <span className="badge-tag tag-neutral">{currentHistory.plan}</span>
                    <span className={`badge-tag ${currentHistory.isIdcw ? 'tag-warning' : 'tag-success'}`}>
                      {currentHistory.option}
                    </span>
                    {currentHistory.fundHouse && (
                      <span className="badge-tag tag-neutral">{currentHistory.fundHouse}</span>
                    )}
                  </div>
                  <h3 className="research-scheme-name">{currentHistory.schemeName}</h3>
                  <div className="research-subtext">
                    Category: <strong>{currentHistory.category}</strong> · Type: {currentHistory.schemeType}
                  </div>
                </div>

                <div className="research-actions-col">
                  <button
                    type="button"
                    className="portfolio-btn portfolio-btn-outline btn-sm"
                    onClick={() => setIsSipOpen(true)}
                  >
                    Simulate SIP
                  </button>
                  <button
                    type="button"
                    className="portfolio-btn portfolio-btn-secondary btn-sm"
                    onClick={() => loadActiveHistory(selectedResearchCode, true)}
                  >
                    Refresh History
                  </button>
                </div>
              </div>

              {/* IDCW Distribution Exclusion Notice */}
              {currentHistory.isIdcw && (
                <div className="portfolio-alert portfolio-alert-info">
                  <strong>IDCW Distribution Notice:</strong> This scheme operates under the Income Distribution cum Capital Withdrawal (IDCW) option.
                  Historical changes represent NAV price variation only and exclude cash payouts or dividend reinvestments.
                </div>
              )}

              {/* SVG Trajectory Chart */}
              <FundNavChart
                observations={currentHistory.observations}
                activeRange={historyRange}
                onRangeChange={(range) => setHistoryRange(range)}
              />

              {/* Trailing Returns & Risk Metrics Grid */}
              {analytics && (
                <div className="portfolio-metrics-grid">
                  <div className="portfolio-metric-card">
                    <span className="metric-title">1 Year Return</span>
                    <span className={`metric-value ${analytics.trailing['1Y'].available ? (analytics.trailing['1Y'].returnPercent >= 0 ? 'profit' : 'loss') : 'unavailable'}`}>
                      {analytics.trailing['1Y'].available ? `${analytics.trailing['1Y'].returnPercent >= 0 ? '+' : ''}${analytics.trailing['1Y'].returnPercent.toFixed(2)}%` : 'Unavailable'}
                    </span>
                    <span className="metric-subtext">Point-to-point simple return</span>
                  </div>

                  <div className="portfolio-metric-card">
                    <span className="metric-title" title="Annualized compound growth using 365.25-day convention">
                      3 Year CAGR
                    </span>
                    <span className={`metric-value ${analytics.trailing['3Y'].available ? (analytics.trailing['3Y'].returnPercent >= 0 ? 'profit' : 'loss') : 'unavailable'}`}>
                      {analytics.trailing['3Y'].available ? `${analytics.trailing['3Y'].returnPercent >= 0 ? '+' : ''}${analytics.trailing['3Y'].returnPercent.toFixed(2)}%` : 'Unavailable'}
                    </span>
                    <span className="metric-subtext">Annualized CAGR (365.25 d/yr)</span>
                  </div>

                  <div className="portfolio-metric-card">
                    <span className="metric-title" title="Annualized compound growth using 365.25-day convention">
                      5 Year CAGR
                    </span>
                    <span className={`metric-value ${analytics.trailing['5Y'].available ? (analytics.trailing['5Y'].returnPercent >= 0 ? 'profit' : 'loss') : 'unavailable'}`}>
                      {analytics.trailing['5Y'].available ? `${analytics.trailing['5Y'].returnPercent >= 0 ? '+' : ''}${analytics.trailing['5Y'].returnPercent.toFixed(2)}%` : 'Unavailable'}
                    </span>
                    <span className="metric-subtext">Annualized CAGR (365.25 d/yr)</span>
                  </div>

                  <div className="portfolio-metric-card">
                    <span className="metric-title" title="CAGR across retained observations window">
                      Available-Period CAGR
                    </span>
                    <span className={`metric-value ${analytics.trailing['ALL'].available ? (analytics.trailing['ALL'].returnPercent >= 0 ? 'profit' : 'loss') : 'unavailable'}`}>
                      {analytics.trailing['ALL'].available ? `${analytics.trailing['ALL'].returnPercent >= 0 ? '+' : ''}${analytics.trailing['ALL'].returnPercent.toFixed(2)}%` : 'Unavailable'}
                    </span>
                    <span className="metric-subtext">
                      {analytics.trailing['ALL'].startDate} &rarr; {analytics.trailing['ALL'].endDate}
                    </span>
                  </div>

                  <div className="portfolio-metric-card">
                    <span className="metric-title">Maximum Drawdown</span>
                    <span className="metric-value loss">
                      {analytics.mdd.mddPercent.toFixed(2)}%
                    </span>
                    <span className="metric-subtext">Peak to trough drop</span>
                  </div>

                  <div className="portfolio-metric-card">
                    <span className="metric-title" title="Sample standard deviation scaled by sqrt(252)">
                      NAV Volatility
                    </span>
                    <span className="metric-value">
                      {analytics.vol.available ? `${analytics.vol.volatilityPercent.toFixed(2)}%` : '—'}
                    </span>
                    <span className="metric-subtext">Annualized (&radic;252, gap-filtered)</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* TAB 3: SEARCH */}
      {activeTab === 'SEARCH' && (
        <div className="funds-tab-content">
          <div className="fund-search-bar">
            <label htmlFor="fund-search-input" className="sr-only">Search Schemes</label>
            <input
              id="fund-search-input"
              type="text"
              className="portfolio-input fund-search-input"
              placeholder="Search scheme name or fund house (e.g. Parag Parikh, HDFC Large Cap)…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
            {searchBusy && <span className="search-spinner">Searching…</span>}
          </div>

          {searchError && (
            <div className="portfolio-alert portfolio-alert-error" role="alert">
              {searchError}
            </div>
          )}

          {searchResults.length > 0 ? (
            <div className="portfolio-table-container">
              <table className="portfolio-table" aria-label="Search results table">
                <thead>
                  <tr>
                    <th>Scheme Code</th>
                    <th>Scheme Name</th>
                    <th className="actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {searchResults.map((item) => {
                    const isSaved = state.savedCodes.includes(item.schemeCode);
                    return (
                      <tr key={item.schemeCode}>
                        <td className="font-mono">{item.schemeCode}</td>
                        <td><strong>{item.schemeName}</strong></td>
                        <td className="actions">
                          <div className="action-buttons-wrap">
                            <button
                              type="button"
                              className="portfolio-btn portfolio-btn-secondary btn-xs"
                              onClick={() => handleInspectScheme(item.schemeCode)}
                            >
                              Inspect
                            </button>
                            <button
                              type="button"
                              className="portfolio-btn portfolio-btn-primary btn-xs"
                              onClick={() => handleSaveCode(item.schemeCode)}
                              disabled={isSaved || state.savedCodes.length >= 12}
                            >
                              {isSaved ? 'Saved' : '+ Save'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            searchQuery.trim().length >= 3 && !searchBusy && (
              <div className="portfolio-empty-state">
                <p>No mutual fund schemes match your query.</p>
              </div>
            )
          )}
        </div>
      )}

      {/* Modals */}
      <FundCompareModal
        isOpen={isCompareOpen}
        onClose={() => setIsCompareOpen(false)}
        savedCodes={state.savedCodes}
        historyCache={state.historyCache}
        onFetchHistory={(code) => actions.fetchSchemeHistory(code)}
      />

      <FundSipModal
        isOpen={isSipOpen}
        onClose={() => setIsSipOpen(false)}
        selectedFund={currentHistory ? {
          schemeCode: currentHistory.schemeCode,
          schemeName: currentHistory.schemeName,
          trailingReturns: analytics?.trailing
        } : null}
      />
    </div>
  );
}
