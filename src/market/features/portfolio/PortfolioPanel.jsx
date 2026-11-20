/**
 * NWv7 Market Desk R2.1 - WP-04 Portfolio Panel Workspace
 * Full portfolio management workspace featuring:
 * - Deterministic transaction ledger
 * - Moving weighted-average cost accounting & fail-closed oversell alerts
 * - Manual price mark valuation
 * - Cash-flow XIRR calculation with 365.25 annualization
 * - Full JSON backup & CSV ledger export/import with formula injection protection
 */

import React, { useState, useMemo } from 'react';
import { usePortfolioStore } from './portfolioStore.js';
import { replayPortfolio } from './portfolioAccounting.js';
import { buildPortfolioCashFlows } from './portfolioCashFlows.js';
import { computePortfolioXirr } from './portfolioXirrAdapter.js';
import { TransactionModal } from './TransactionModal.jsx';
import { PriceMarkModal } from './PriceMarkModal.jsx';
import { PortfolioImportModal } from './PortfolioImportModal.jsx';
import './portfolio.css';

export function PortfolioPanel({ initialKey = null, onNavigateWorkspace = null }) {
  const { state, actions } = usePortfolioStore();

  const [activeTab, setActiveTab] = useState('HOLDINGS'); // 'HOLDINGS' | 'TRANSACTIONS'
  const [filterSymbol, setFilterSymbol] = useState('');
  const [filterType, setFilterType] = useState('ALL');

  // Modals state
  const [isTxModalOpen, setIsTxModalOpen] = useState(() => Boolean(initialKey));
  const [editingTx, setEditingTx] = useState(() => initialKey ? { instrumentKey: initialKey } : null);
  const [isMarkModalOpen, setIsMarkModalOpen] = useState(false);
  const [activeMarkKey, setActiveMarkKey] = useState(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isNewPortfolioOpen, setIsNewPortfolioOpen] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState('');
  const [deleteConfirmTxId, setDeleteConfirmTxId] = useState(null);

  // Sync initialKey prop changes during render without cascading useEffect
  const [prevInitialKey, setPrevInitialKey] = useState(initialKey);
  if (initialKey && initialKey !== prevInitialKey) {
    setPrevInitialKey(initialKey);
    setEditingTx({ instrumentKey: initialKey });
    setIsTxModalOpen(true);
  }

  const activePortfolio = useMemo(() => {
    return state.portfolios.find(p => p.id === state.activePortfolioId) || state.portfolios[0];
  }, [state.portfolios, state.activePortfolioId]);

  // Replay active portfolio
  const replayed = useMemo(() => {
    return replayPortfolio(
      activePortfolio?.transactions || [],
      activePortfolio?.manualPriceMarks || {}
    );
  }, [activePortfolio]);

  // Compute XIRR
  const xirrResult = useMemo(() => {
    const cfOutcome = buildPortfolioCashFlows(
      activePortfolio?.transactions || [],
      activePortfolio?.manualPriceMarks || {}
    );

    if (!cfOutcome.ok) {
      return { ok: false, message: cfOutcome.message, errorCode: cfOutcome.errorCode };
    }

    return computePortfolioXirr(cfOutcome.cashFlows);
  }, [activePortfolio]);

  // Helper formatting
  const formatCurrency = (val, prefix = '₹') => {
    if (val === null || val === undefined) return 'Unavailable';
    const num = Number(val);
    const sign = num < 0 ? '-' : '';
    return `${sign}${prefix}${Math.abs(num).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  };

  const handleSaveTx = (txPayload) => {
    if (editingTx && editingTx.id) {
      return actions.updateTransaction(activePortfolio.id, editingTx.id, txPayload);
    } else {
      return actions.addTransaction(activePortfolio.id, txPayload);
    }
  };

  const handleDeleteTx = (txId) => {
    actions.deleteTransaction(activePortfolio.id, txId);
    setDeleteConfirmTxId(null);
  };

  const handleSaveMark = (key, price, asOfDate) => {
    return actions.setManualPriceMark(activePortfolio.id, key, price, asOfDate);
  };

  const handleDeleteMark = (key) => {
    return actions.deleteManualPriceMark(activePortfolio.id, key);
  };

  const handleCreatePortfolio = (e) => {
    e.preventDefault();
    if (!newPortfolioName.trim()) return;
    const res = actions.createPortfolio(newPortfolioName.trim());
    if (res.ok) {
      setNewPortfolioName('');
      setIsNewPortfolioOpen(false);
    }
  };

  const handleExportJson = () => {
    const jsonStr = actions.exportJson(activePortfolio.id);
    if (!jsonStr) return;
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activePortfolio.name.toLowerCase().replace(/\s+/g, '_')}_backup.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    const csvStr = actions.exportCsv(activePortfolio.id);
    const blob = new Blob([csvStr], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activePortfolio.name.toLowerCase().replace(/\s+/g, '_')}_transactions.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filter transactions for ledger table
  const filteredTransactions = useMemo(() => {
    return (replayed.sortedTransactions || []).filter(tx => {
      if (filterType !== 'ALL' && tx.type !== filterType) return false;
      if (filterSymbol.trim()) {
        const query = filterSymbol.trim().toUpperCase();
        if (!tx.symbol.includes(query) && !tx.instrumentKey.includes(query)) return false;
      }
      return true;
    });
  }, [replayed.sortedTransactions, filterType, filterSymbol]);

  return (
    <div className="portfolio-workspace">
      {/* Top Header & Actions Bar */}
      <div className="portfolio-header">
        <div className="portfolio-title-group">
          <div className="portfolio-portfolio-picker">
            <label htmlFor="portfolio-select" className="sr-only">Select Portfolio</label>
            <select
              id="portfolio-select"
              className="portfolio-select-dropdown"
              value={activePortfolio.id}
              onChange={(e) => actions.switchPortfolio(e.target.value)}
            >
              {state.portfolios.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button
              type="button"
              className="portfolio-btn portfolio-btn-secondary btn-sm"
              onClick={() => setIsNewPortfolioOpen(true)}
              title="Create another portfolio"
            >
              + New
            </button>
          </div>
          <span className="portfolio-updated-meta">
            Last modified: {new Date(activePortfolio.updatedAt || activePortfolio.createdAt).toLocaleString()}
          </span>
        </div>

        <div className="portfolio-header-actions">
          <button
            type="button"
            className="portfolio-btn portfolio-btn-secondary"
            onClick={() => setIsImportModalOpen(true)}
          >
            Import File
          </button>

          <div className="portfolio-dropdown-wrap">
            <button
              type="button"
              className="portfolio-btn portfolio-btn-secondary"
              onClick={handleExportJson}
              title="Export full JSON backup including marks"
            >
              Backup JSON
            </button>
            <button
              type="button"
              className="portfolio-btn portfolio-btn-secondary"
              onClick={handleExportCsv}
              title="Export transactions CSV"
            >
              Export CSV
            </button>
          </div>

          <button
            type="button"
            className="portfolio-btn portfolio-btn-primary"
            onClick={() => {
              setEditingTx(null);
              setIsTxModalOpen(true);
            }}
          >
            + Add Transaction
          </button>
        </div>
      </div>

      {/* New Portfolio Inline Dialog */}
      {isNewPortfolioOpen && (
        <div className="portfolio-inline-form-card">
          <form onSubmit={handleCreatePortfolio} className="portfolio-inline-form">
            <label htmlFor="new-portfolio-name" className="portfolio-form-label">
              Portfolio Name:
            </label>
            <input
              id="new-portfolio-name"
              type="text"
              className="portfolio-input"
              placeholder="e.g. Retirement Core, High-Growth SIP"
              value={newPortfolioName}
              onChange={(e) => setNewPortfolioName(e.target.value)}
              autoFocus
              required
            />
            <button type="submit" className="portfolio-btn portfolio-btn-primary btn-sm">
              Create
            </button>
            <button
              type="button"
              className="portfolio-btn portfolio-btn-secondary btn-sm"
              onClick={() => setIsNewPortfolioOpen(false)}
            >
              Cancel
            </button>
          </form>
        </div>
      )}

      {/* Mandatory Analytical & IT Act Disclaimer */}
      <div className="portfolio-disclaimer-banner" role="note">
        <strong>Analytical P&L Notice:</strong> Values are computed using moving weighted-average cost basis for portfolio tracking.
        This does <em>not</em> constitute tax-calculated capital gains (the Indian Income Tax Act Sec 45(2A) requires FIFO accounting for capital gains reporting).
        Prices are entered via user manual marks.
      </div>

      {/* Storage warning if any */}
      {state.storageWarning && (
        <div className="portfolio-alert portfolio-alert-warning" role="alert">
          {state.storageWarning}
        </div>
      )}

      {/* Fail-Closed Oversell Alert Banner */}
      {replayed.hasInvalidLedger && (
        <div className="portfolio-alert portfolio-alert-error" role="alert">
          <strong>Accounting Replay Suspended (Oversell Detected):</strong>
          <p>
            One or more SELL transactions exceed the accumulated shares available in your ledger.
            Portfolio valuation, unrealized P&L, and XIRR are unavailable until the invalid transactions are corrected.
          </p>
          <div className="portfolio-invalid-list">
            {replayed.positions
              .filter(p => p.status === 'INVALID_LEDGER')
              .map(p => (
                <div key={p.instrumentKey} className="portfolio-invalid-item">
                  <span><strong>{p.instrumentKey}:</strong> Deficit of {p.oversellDeficit} share(s).</span>
                  <button
                    type="button"
                    className="portfolio-btn portfolio-btn-outline btn-xs"
                    onClick={() => {
                      setActiveTab('TRANSACTIONS');
                      setFilterSymbol(p.symbol);
                    }}
                  >
                    Inspect Ledger for {p.symbol}
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* High-Level Financial Metrics Grid */}
      <div className="portfolio-metrics-grid">
        <div className="portfolio-metric-card">
          <span className="metric-title" title="Sum of cost basis across remaining open shares">
            Remaining Cost Basis
          </span>
          <span className="metric-value">
            {formatCurrency(replayed.totalRemainingCostBasis)}
          </span>
          <span className="metric-subtext">Moving weighted average</span>
        </div>

        <div className="portfolio-metric-card">
          <span className="metric-title">Current Portfolio Value</span>
          <span className={`metric-value ${replayed.totalCurrentValue === null ? 'unavailable' : ''}`}>
            {formatCurrency(replayed.totalCurrentValue)}
          </span>
          <span className="metric-subtext">
            {replayed.valuationStatus === 'COMPLETE' ? (
              <span className="badge-tag tag-success">Valued via manual marks</span>
            ) : replayed.valuationStatus === 'LIQUIDATED' ? (
              <span className="badge-tag tag-neutral">All positions closed</span>
            ) : replayed.hasInvalidLedger ? (
              <span className="badge-tag tag-error">Ledger invalid</span>
            ) : (
              <span className="badge-tag tag-warning">Marks missing on some holdings</span>
            )}
          </span>
        </div>

        <div className="portfolio-metric-card">
          <span className="metric-title">Unrealized P&L</span>
          <span className={`metric-value ${replayed.totalUnrealizedPnL === null ? 'unavailable' : (replayed.totalUnrealizedPnL >= 0 ? 'profit' : 'loss')}`}>
            {replayed.totalUnrealizedPnL !== null ? (
              `${replayed.totalUnrealizedPnL >= 0 ? '+' : ''}${formatCurrency(replayed.totalUnrealizedPnL)} (${replayed.totalUnrealizedPnLPercent > 0 ? '+' : ''}${replayed.totalUnrealizedPnLPercent}%)`
            ) : 'Unavailable'}
          </span>
          <span className="metric-subtext">Current value vs remaining basis</span>
        </div>

        <div className="portfolio-metric-card">
          <span className="metric-title">Realized P&L</span>
          <span className={`metric-value ${replayed.totalRealizedPnL >= 0 ? 'profit' : 'loss'}`}>
            {replayed.totalRealizedPnL >= 0 ? '+' : ''}{formatCurrency(replayed.totalRealizedPnL)}
          </span>
          <span className="metric-subtext">Total net of transaction fees</span>
        </div>

        <div className="portfolio-metric-card">
          <span className="metric-title" title="Money-weighted annualized return using 365.25 day calendar convention">
            Portfolio XIRR
          </span>
          <span className={`metric-value ${xirrResult.ok ? (xirrResult.annualizedPercent >= 0 ? 'profit' : 'loss') : 'unavailable'}`}>
            {xirrResult.ok ? `${xirrResult.annualizedPercent > 0 ? '+' : ''}${xirrResult.annualizedPercent}%` : 'Unavailable'}
          </span>
          <span className="metric-subtext">
            {xirrResult.ok ? 'Annualized return (365.25 d/yr)' : (xirrResult.message || 'Complete marks required')}
          </span>
        </div>

        <div className="portfolio-metric-card">
          <span className="metric-title">Total Fees Paid</span>
          <span className="metric-value">
            {formatCurrency(replayed.totalFeesPaid)}
          </span>
          <span className="metric-subtext">STT, brokerage, stamp duty</span>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="portfolio-tabs-bar">
        <button
          type="button"
          className={`portfolio-tab-btn ${activeTab === 'HOLDINGS' ? 'active' : ''}`}
          onClick={() => setActiveTab('HOLDINGS')}
        >
          Holdings ({replayed.activeHoldingsCount})
        </button>
        <button
          type="button"
          className={`portfolio-tab-btn ${activeTab === 'TRANSACTIONS' ? 'active' : ''}`}
          onClick={() => setActiveTab('TRANSACTIONS')}
        >
          Transaction Ledger ({replayed.transactionsCount})
        </button>
      </div>

      {/* Tab 1: Holdings View */}
      {activeTab === 'HOLDINGS' && (
        <div className="portfolio-tab-content">
          {replayed.positions.length === 0 ? (
            <div className="portfolio-empty-state">
              <h4>No holdings yet</h4>
              <p>Record your first BUY transaction to begin tracking your portfolio.</p>
              <button
                type="button"
                className="portfolio-btn portfolio-btn-primary"
                onClick={() => {
                  setEditingTx(null);
                  setIsTxModalOpen(true);
                }}
              >
                + Record Transaction
              </button>
            </div>
          ) : (
            <div className="portfolio-table-container">
              <table className="portfolio-table" aria-label="Holdings table">
                <thead>
                  <tr>
                    <th>Instrument</th>
                    <th className="num">Qty</th>
                    <th className="num">Avg Cost</th>
                    <th className="num">Remaining Basis</th>
                    <th className="num">Manual Mark</th>
                    <th className="num">Current Value</th>
                    <th className="num">Unrealized P&L</th>
                    <th className="num">Realized P&L</th>
                    <th className="actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {replayed.positions.map((pos) => {
                    const isClosed = pos.currentQty === 0;
                    return (
                      <tr key={pos.instrumentKey} className={isClosed ? 'row-closed' : ''}>
                        <td>
                          <div className="instrument-cell">
                            <span
                              className="instrument-key-badge"
                              onClick={() => onNavigateWorkspace && onNavigateWorkspace('equity', { key: pos.instrumentKey })}
                              style={{ cursor: onNavigateWorkspace ? 'pointer' : 'default' }}
                              title={onNavigateWorkspace ? `Open ${pos.instrumentKey} in Equity Research` : pos.instrumentKey}
                            >
                              {pos.instrumentKey}
                            </span>
                            {isClosed && <span className="closed-badge">Closed</span>}
                          </div>
                        </td>
                        <td className="num font-mono">{pos.currentQty}</td>
                        <td className="num font-mono">{formatCurrency(pos.averageCost)}</td>
                        <td className="num font-mono">{formatCurrency(pos.remainingCostBasis)}</td>
                        <td className="num">
                          {pos.hasValuation && pos.currentPrice ? (
                            <div className="mark-cell">
                              <span className="font-mono">₹{pos.currentPrice}</span>
                              <span className="mark-date">{pos.priceAsOfDate}</span>
                            </div>
                          ) : (
                            <span className="text-muted">Not marked</span>
                          )}
                        </td>
                        <td className="num font-mono">
                          {isClosed ? '₹0.00' : formatCurrency(pos.currentValue)}
                        </td>
                        <td className="num">
                          {pos.unrealizedPnL !== null ? (
                            <span className={`font-mono ${pos.unrealizedPnL >= 0 ? 'profit' : 'loss'}`}>
                              {pos.unrealizedPnL >= 0 ? '+' : ''}{formatCurrency(pos.unrealizedPnL)}
                              <small> ({pos.unrealizedPnLPercent > 0 ? '+' : ''}{pos.unrealizedPnLPercent}%)</small>
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="num">
                          <span className={`font-mono ${pos.realizedPnL >= 0 ? 'profit' : 'loss'}`}>
                            {pos.realizedPnL >= 0 ? '+' : ''}{formatCurrency(pos.realizedPnL)}
                          </span>
                        </td>
                        <td className="actions">
                          <div className="action-buttons-wrap">
                            <button
                              type="button"
                              className="portfolio-btn portfolio-btn-secondary btn-xs"
                              onClick={() => {
                                setActiveMarkKey(pos.instrumentKey);
                                setIsMarkModalOpen(true);
                              }}
                              title="Update manual price mark"
                            >
                              Mark Price
                            </button>
                            <button
                              type="button"
                              className="portfolio-btn portfolio-btn-secondary btn-xs"
                              onClick={() => {
                                setEditingTx({
                                  instrumentKey: pos.instrumentKey,
                                  exchange: pos.exchange,
                                  symbol: pos.symbol
                                });
                                setIsTxModalOpen(true);
                              }}
                              title="Add transaction for this instrument"
                            >
                              + Trade
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

      {/* Tab 2: Transactions Ledger View */}
      {activeTab === 'TRANSACTIONS' && (
        <div className="portfolio-tab-content">
          <div className="portfolio-ledger-toolbar">
            <div className="toolbar-filter-group">
              <input
                type="text"
                className="portfolio-input input-sm uppercase"
                placeholder="Filter by symbol..."
                value={filterSymbol}
                onChange={(e) => setFilterSymbol(e.target.value)}
              />
              <select
                className="portfolio-input input-sm"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
              >
                <option value="ALL">All Types</option>
                <option value="BUY">BUY only</option>
                <option value="SELL">SELL only</option>
              </select>
            </div>
            <span className="toolbar-count">
              Showing {filteredTransactions.length} of {replayed.transactionsCount} transaction(s)
            </span>
          </div>

          {filteredTransactions.length === 0 ? (
            <div className="portfolio-empty-state">
              <p>No transactions match the selected filter.</p>
            </div>
          ) : (
            <div className="portfolio-table-container">
              <table className="portfolio-table" aria-label="Transactions ledger table">
                <thead>
                  <tr>
                    <th>Date (Seq)</th>
                    <th>Type</th>
                    <th>Instrument</th>
                    <th className="num">Qty</th>
                    <th className="num">Price (₹)</th>
                    <th className="num">Fee (₹)</th>
                    <th className="num">Cash Flow</th>
                    <th>Notes</th>
                    <th className="actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map((tx) => {
                    const isBuy = tx.type === 'BUY';
                    const flow = isBuy
                      ? -(tx.quantity * tx.price + tx.fee)
                      : (tx.quantity * tx.price - tx.fee);

                    return (
                      <tr key={tx.id}>
                        <td className="font-mono">
                          {tx.date} <small className="text-muted">({tx.sequenceIndex ?? 0})</small>
                        </td>
                        <td>
                          <span className={`portfolio-badge ${isBuy ? 'badge-buy' : 'badge-sell'}`}>
                            {tx.type}
                          </span>
                        </td>
                        <td>
                          <span className="instrument-key-badge">{tx.instrumentKey}</span>
                        </td>
                        <td className="num font-mono">{tx.quantity}</td>
                        <td className="num font-mono">{Number(tx.price).toFixed(2)}</td>
                        <td className="num font-mono">{Number(tx.fee || 0).toFixed(2)}</td>
                        <td className={`num font-mono ${flow >= 0 ? 'profit' : 'loss'}`}>
                          {flow >= 0 ? '+' : ''}{formatCurrency(flow)}
                        </td>
                        <td className="notes-cell" title={tx.notes || ''}>
                          {tx.notes ? tx.notes : <span className="text-muted">—</span>}
                        </td>
                        <td className="actions">
                          <div className="action-buttons-wrap">
                            <button
                              type="button"
                              className="portfolio-btn portfolio-btn-secondary btn-xs"
                              onClick={() => {
                                setEditingTx(tx);
                                setIsTxModalOpen(true);
                              }}
                              title="Edit transaction"
                            >
                              Edit
                            </button>
                            {deleteConfirmTxId === tx.id ? (
                              <div className="confirm-delete-group">
                                <button
                                  type="button"
                                  className="portfolio-btn portfolio-btn-danger btn-xs"
                                  onClick={() => handleDeleteTx(tx.id)}
                                >
                                  Confirm
                                </button>
                                <button
                                  type="button"
                                  className="portfolio-btn portfolio-btn-secondary btn-xs"
                                  onClick={() => setDeleteConfirmTxId(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="portfolio-btn portfolio-btn-danger btn-xs"
                                onClick={() => setDeleteConfirmTxId(tx.id)}
                                title="Delete transaction"
                              >
                                Delete
                              </button>
                            )}
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

      {/* Modals */}
      <TransactionModal
        isOpen={isTxModalOpen}
        onClose={() => {
          setIsTxModalOpen(false);
          setEditingTx(null);
        }}
        onSave={handleSaveTx}
        initialData={editingTx}
      />

      <PriceMarkModal
        isOpen={isMarkModalOpen}
        onClose={() => {
          setIsMarkModalOpen(false);
          setActiveMarkKey(null);
        }}
        onSave={handleSaveMark}
        onDelete={handleDeleteMark}
        instrumentKey={activeMarkKey}
        currentMark={activeMarkKey ? activePortfolio.manualPriceMarks?.[activeMarkKey] : null}
      />

      <PortfolioImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportJson={(content, mode) => actions.importJson(content, mode)}
        onImportCsv={(content, mode) => actions.importCsv(activePortfolio.id, content, mode)}
      />
    </div>
  );
}
