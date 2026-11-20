/**
 * NWv7 Market Desk R2.1 - WP-09 Local Source Activity Log Panel
 *
 * Displays up to 100 retained activity records (valid receipts and rejected attempts).
 * Provides an allowlisted JSON export scrubbed of sensitive query parameters and private data.
 */

import React, { useState } from 'react';
import { RECORD_CLASSES } from './receiptsLedger.js';
import { serializeHealthDiagnostics } from './privacyGuard.js';

export function ReceiptsAuditPanel({
  receipts = [],
  receiptsSummary = {},
  sourceStates = {},
  storageSummary = {}
}) {
  const [filter, setFilter] = useState('ALL');
  const [expandedId, setExpandedId] = useState(null);

  const filteredRecords = receipts.filter(r => {
    if (filter === 'VALID') return r.recordClass === RECORD_CLASSES.VALID_RECEIPT;
    if (filter === 'REJECTED') return r.recordClass === RECORD_CLASSES.REJECTED_ATTEMPT;
    return true;
  });

  const handleExportJson = () => {
    const jsonString = serializeHealthDiagnostics({
      sourceStates: Object.values(sourceStates),
      storageSummary,
      receiptsSummary
    });

    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nwv7-market-activity-log-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="health-section">
      <div className="health-section-header">
        <div>
          <h3 className="health-section-title">Local Source Activity Log</h3>
          <p className="health-section-desc">
            Bounded log of recent source receipt verifications and validation attempts.
          </p>
        </div>
        <button
          type="button"
          className="health-action-btn btn-primary"
          onClick={handleExportJson}
          title="Export sanitized allowlisted JSON report"
        >
          Export Sanitized JSON
        </button>
      </div>

      <div className="log-summary-card">
        <div className="log-summary-stats">
          <div className="stat-item">
            <span className="stat-label">Retained Records</span>
            <span className="stat-value">{receiptsSummary.totalRetained ?? receipts.length} / 100</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Valid Observations</span>
            <span className="stat-value text-success">{receiptsSummary.validReceiptCount ?? 0}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Rejected Attempts</span>
            <span className="stat-value text-warning">{receiptsSummary.rejectedAttemptCount ?? 0}</span>
          </div>
        </div>
        <p className="log-retention-notice">
          ℹ️ {receiptsSummary.disclaimer || 'Showing the last 100 recorded receipts. Earlier records are automatically discarded by FIFO pruning.'}
        </p>
      </div>

      <div className="log-filter-bar">
        <div className="btn-group" role="group" aria-label="Activity filter">
          <button
            type="button"
            className={`btn-filter ${filter === 'ALL' ? 'active' : ''}`}
            onClick={() => setFilter('ALL')}
          >
            All Records ({receipts.length})
          </button>
          <button
            type="button"
            className={`btn-filter ${filter === 'VALID' ? 'active' : ''}`}
            onClick={() => setFilter('VALID')}
          >
            Valid Receipts ({receipts.filter(r => r.recordClass === RECORD_CLASSES.VALID_RECEIPT).length})
          </button>
          <button
            type="button"
            className={`btn-filter ${filter === 'REJECTED' ? 'active' : ''}`}
            onClick={() => setFilter('REJECTED')}
          >
            Rejected Attempts ({receipts.filter(r => r.recordClass === RECORD_CLASSES.REJECTED_ATTEMPT).length})
          </button>
        </div>
      </div>

      {filteredRecords.length === 0 ? (
        <div className="empty-log-state">
          <p>No activity records recorded in this session or storage.</p>
        </div>
      ) : (
        <div className="activity-records-table-wrap">
          <table className="activity-records-table">
            <thead>
              <tr>
                <th>Captured At (Local)</th>
                <th>Source ID</th>
                <th>Class</th>
                <th>Observation As-Of</th>
                <th>Status / Reason</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((rec, idx) => {
                const recId = `${rec.capturedAt}-${idx}`;
                const isValid = rec.recordClass === RECORD_CLASSES.VALID_RECEIPT;
                const r = rec.receipt;
                const isExpanded = expandedId === recId;

                return (
                  <React.Fragment key={recId}>
                    <tr className={isValid ? 'row-valid' : 'row-rejected'}>
                      <td>{rec.capturedAt ? new Date(rec.capturedAt).toLocaleTimeString() : '—'}</td>
                      <td><code>{r?.sourceId || rec.sourceId}</code></td>
                      <td>
                        <span className={`badge-pill ${isValid ? 'pill-success' : 'pill-danger'}`}>
                          {isValid ? 'VALID' : 'REJECTED'}
                        </span>
                      </td>
                      <td>{r?.providerAsOf || '—'}</td>
                      <td>
                        {isValid ? (
                          <span className="text-success">{r?.state}</span>
                        ) : (
                          <span className="text-danger">{(rec.errors || []).join(', ') || 'INVALID'}</span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-details"
                          onClick={() => setExpandedId(isExpanded ? null : recId)}
                        >
                          {isExpanded ? 'Hide' : 'Details'}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="row-expanded">
                        <td colSpan={6}>
                          <div className="expanded-json-view">
                            <pre>{JSON.stringify(rec, null, 2)}</pre>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
