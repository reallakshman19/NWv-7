import React, { useState, useMemo } from 'react';
import { useLabStore, labStore } from './labStore.js';
import { calcXirr } from '../../math/index.js';

export function XirrLabPanel() {
  const store = useLabStore();
  const { xirr } = store;

  const [newDate, setNewDate] = useState('2025-01-15');
  const [newAmount, setNewAmount] = useState('10000');
  const [newType, setNewType] = useState('OUTFLOW'); // 'OUTFLOW' = Invested (Negative), 'INFLOW' = Received (Positive)
  const [newNote, setNewNote] = useState('');
  const [importText, setImportText] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importError, setImportError] = useState(null);

  // Prepare normalized cash flows including terminal valuation row if selected
  const activeSeries = useMemo(() => {
    const list = [...xirr.cashFlows];
    if (xirr.includeTerminal && Number(xirr.terminalValue) > 0 && xirr.terminalDate) {
      list.push({
        id: 'terminal-val',
        date: xirr.terminalDate,
        amount: Math.abs(Number(xirr.terminalValue)), // Terminal proceeds = Positive
        note: 'Terminal Valuation Mark (User-Entered)'
      });
    }
    return list;
  }, [xirr.cashFlows, xirr.includeTerminal, xirr.terminalValue, xirr.terminalDate]);

  const singleResult = useMemo(() => {
    return calcXirr(activeSeries, { annualizationBasis: 365.25 });
  }, [activeSeries]);

  const handleAdd = (e) => {
    e.preventDefault();
    const parsedAmount = Math.abs(Number(newAmount));
    if (!Number.isFinite(parsedAmount) || parsedAmount === 0 || !newDate) return;
    const signedAmount = newType === 'OUTFLOW' ? -parsedAmount : parsedAmount;
    labStore.addXirrCashFlow({
      date: newDate,
      amount: signedAmount,
      note: newNote.trim() || (newType === 'OUTFLOW' ? 'Investment' : 'Proceeds')
    });
    setNewNote('');
  };

  const handleExportCsv = () => {
    // Sanitizes CSV formula injection by prepending space if leading character is =, +, -, @
    const sanitize = (val) => {
      const s = String(val ?? '');
      if (/^[=+\-@]/.test(s)) return `'${s}`;
      return s;
    };
    const rows = [['Date', 'Amount', 'Type', 'Note']];
    for (const cf of xirr.cashFlows) {
      const type = cf.amount < 0 ? 'INVESTMENT' : 'PROCEEDS';
      rows.push([cf.date, cf.amount, type, sanitize(cf.note)]);
    }
    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(r => r.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'nwv7_xirr_cashflows.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportSubmit = () => {
    setImportError(null);
    if (!importText.trim()) return;

    if (importText.length > 100000) {
      setImportError('Import payload exceeds maximum size limit (100 KB)');
      return;
    }

    try {
      const lines = importText.trim().split('\n');
      if (lines.length > 500) {
        setImportError('Import exceeds 500 rows limit');
        return;
      }

      const imported = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.toLowerCase().startsWith('date')) continue; // Skip header
        const parts = line.split(',').map(p => p.trim().replace(/^['"]|['"]$/g, ''));
        if (parts.length >= 2) {
          const date = parts[0];
          const amount = Number(parts[1]);
          const note = parts[3] || parts[2] || '';
          if (date && Number.isFinite(amount)) {
            imported.push({ date, amount, note });
          }
        }
      }

      if (imported.length < 2) {
        setImportError('Valid CSV import must contain at least 2 dated rows (Date, Amount)');
        return;
      }

      labStore.setXirrCashFlows(imported);
      setImportText('');
      setShowImport(false);
    } catch (err) {
      setImportError(`Failed to parse CSV: ${err.message}`);
    }
  };

  return (
    <div className="lab-subdesk" data-testid="xirr-lab-panel">
      <div className="lab-content-grid">
        <div className="lab-form-column">
          <div className="lab-card">
            <div className="lab-card-title">Add Dated Transaction</div>
            <form onSubmit={handleAdd} className="lab-cf-form">
              <div className="lab-dual-input">
                <div className="lab-input-cell">
                  <label htmlFor="cf-date-input">Date</label>
                  <input
                    id="cf-date-input"
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    required
                  />
                </div>
                <div className="lab-input-cell">
                  <label htmlFor="cf-type-select">Flow Direction</label>
                  <select
                    id="cf-type-select"
                    value={newType}
                    onChange={(e) => setNewType(e.target.value)}
                  >
                    <option value="OUTFLOW">Investment / Money Paid Out (-)</option>
                    <option value="INFLOW">Proceeds / Money Received (+)</option>
                  </select>
                </div>
              </div>

              <div className="lab-dual-input">
                <div className="lab-input-cell">
                  <label htmlFor="cf-amount-input">Amount (₹)</label>
                  <input
                    id="cf-amount-input"
                    type="number"
                    min="1"
                    step="1"
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                    required
                  />
                </div>
                <div className="lab-input-cell">
                  <label htmlFor="cf-note-input">Note (Optional)</label>
                  <input
                    id="cf-note-input"
                    type="text"
                    placeholder="e.g. SIP installment, Dividend"
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                  />
                </div>
              </div>

              <button type="submit" className="lab-btn lab-btn-primary">
                + Add Cash Flow
              </button>
            </form>
          </div>

          <div className="lab-card">
            <div className="lab-card-header-row">
              <div className="lab-card-title">Terminal Valuation Mark</div>
              <label className="lab-toggle-label">
                <input
                  type="checkbox"
                  checked={xirr.includeTerminal}
                  onChange={(e) => labStore.updateXirr({ includeTerminal: e.target.checked })}
                />
                Include in Solver
              </label>
            </div>
            {xirr.includeTerminal && (
              <div className="lab-dual-input">
                <div className="lab-input-cell">
                  <label htmlFor="cf-terminal-date">As-Of Date</label>
                  <input
                    id="cf-terminal-date"
                    type="date"
                    value={xirr.terminalDate}
                    onChange={(e) => labStore.updateXirr({ terminalDate: e.target.value })}
                  />
                </div>
                <div className="lab-input-cell">
                  <label htmlFor="cf-terminal-val">Current Market Value (₹)</label>
                  <input
                    id="cf-terminal-val"
                    type="number"
                    min="0"
                    step="100"
                    value={xirr.terminalValue}
                    onChange={(e) => labStore.updateXirr({ terminalValue: Math.max(0, Number(e.target.value)) })}
                  />
                </div>
              </div>
            )}
            <small className="lab-muted">Terminal mark represents user-entered portfolio worth as of valuation date (no automated live feeds).</small>
          </div>

          <div className="lab-card-actions-row">
            <button type="button" className="lab-btn-outline" onClick={handleExportCsv}>
              ⬇ Export CSV
            </button>
            <button type="button" className="lab-btn-outline" onClick={() => setShowImport(!showImport)}>
              ⬆ Import CSV
            </button>
          </div>

          {showImport && (
            <div className="lab-card lab-import-box">
              <div className="lab-card-title">Import CSV Data (Date, Amount, Note)</div>
              <textarea
                rows="4"
                className="lab-textarea"
                placeholder="2024-01-15, -50000, Initial SIP&#10;2024-06-15, 15000, Partial Sell"
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
              />
              {importError && <div className="lab-error-text">{importError}</div>}
              <div className="lab-btn-row">
                <button type="button" className="lab-btn lab-btn-primary" onClick={handleImportSubmit}>
                  Confirm Import
                </button>
                <button type="button" className="lab-btn-outline" onClick={() => setShowImport(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="lab-results-column">
          <div className="lab-kpi-card">
            <div className="lab-kpi-block lab-kpi-primary">
              <span className="lab-kpi-label">NWv7 XIRR (ACT/365.25)</span>
              {singleResult.ok ? (
                <span className="lab-kpi-val text-success" data-testid="xirr-rate-val">
                  {singleResult.ratePercent > 0 ? '+' : ''}{singleResult.ratePercent.toFixed(2)}% p.a.
                </span>
              ) : (
                <span className="lab-kpi-val text-danger" data-testid="xirr-error-val">
                  {singleResult.error === 'MULTIPLE_ROOTS' ? 'Multiple Roots Discovered' : 'Calculation Infeasible'}
                </span>
              )}
              <span className="lab-kpi-sub">
                {singleResult.ok
                  ? `Convergence method: ${singleResult.method} (${singleResult.iterations} iterations)`
                  : singleResult.message}
              </span>
            </div>

            {singleResult.error === 'MULTIPLE_ROOTS' && (
              <div className="lab-alert-box lab-alert-warning" data-testid="multi-root-alert">
                <strong>Multiple Valid Roots Detected:</strong>
                <p>This irregular cash-flow series yields {singleResult.candidates.length} mathematically valid rates of return:</p>
                <ul>
                  {singleResult.candidatesPercent.map((r, i) => (
                    <li key={i}>Candidate Root {i + 1}: <strong>{r.toFixed(3)}%</strong></li>
                  ))}
                </ul>
                <small>Following actuarial principles, NWv7 does not arbitrarily present one candidate as definitive.</small>
              </div>
            )}

            <div className="lab-diagnostics-card">
              <div className="lab-diag-title">Numerical Diagnostics</div>
              <div className="lab-diag-grid">
                <div><span>Basis:</span> <strong>365.25 Days</strong></div>
                <div><span>Cash Flow Points:</span> <strong>{activeSeries.length}</strong></div>
                <div><span>Residual NPV:</span> <strong>{singleResult.ok ? Math.abs(singleResult.npv).toExponential(2) : 'N/A'}</strong></div>
                <div><span>Method:</span> <strong>{singleResult.ok ? singleResult.method : 'Transformed Domain Grid'}</strong></div>
              </div>
            </div>

            <div className="lab-table-container">
              <table className="lab-table" aria-label="Cash flows ledger">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Direction</th>
                    <th>Amount</th>
                    <th>Note</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {activeSeries.map((cf) => {
                    const isTerminal = cf.id === 'terminal-val';
                    const isNeg = cf.amount < 0;
                    return (
                      <tr key={cf.id} className={isTerminal ? 'lab-terminal-row' : ''}>
                        <td>{cf.date}</td>
                        <td>
                          <span className={`lab-badge ${isNeg ? 'badge-outflow' : 'badge-inflow'}`}>
                            {isNeg ? 'Investment (-)' : 'Proceeds (+)'}
                          </span>
                        </td>
                        <td className={isNeg ? 'text-danger' : 'text-success'}>
                          {isNeg ? '-' : '+'}₹{Math.abs(cf.amount).toLocaleString('en-IN')}
                        </td>
                        <td>{cf.note}</td>
                        <td>
                          {!isTerminal && (
                            <button
                              type="button"
                              className="lab-icon-btn"
                              title="Delete row"
                              onClick={() => labStore.removeXirrCashFlow(cf.id)}
                            >
                              ✕
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
