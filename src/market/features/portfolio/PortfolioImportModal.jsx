/**
 * NWv7 Market Desk R2.1 - WP-04 Portfolio Import Modal
 * Transactional import preview and execution for JSON and CSV formats.
 */

import React, { useState } from 'react';

export function PortfolioImportModal({
  isOpen,
  onClose,
  onImportJson,
  onImportCsv
}) {
  const [format, setFormat] = useState('JSON');
  const [mode, setMode] = useState('REPLACE_ACTIVE');
  const [content, setContent] = useState('');
  const [status, setStatus] = useState(null);

  if (!isOpen) return null;

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === 'string') {
        setContent(text);
        setStatus(null);
      }
    };
    reader.readAsText(file);
  };

  const handleImport = () => {
    setStatus(null);
    if (!content.trim()) {
      setStatus({ ok: false, errors: ['Please paste file contents or select a file to import'] });
      return;
    }

    if (format === 'JSON') {
      const res = onImportJson(content, mode);
      if (res.ok) {
        setStatus({ ok: true, message: `Successfully imported portfolio data (${res.importedCount} portfolio(s))` });
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        setStatus({ ok: false, errors: res.errors || ['Failed to import JSON'] });
      }
    } else {
      // CSV
      const csvMode = mode === 'NEW_PORTFOLIO' ? 'APPEND' : (mode === 'REPLACE_ACTIVE' ? 'REPLACE' : 'APPEND');
      const res = onImportCsv(content, csvMode);
      if (res.ok) {
        setStatus({ ok: true, message: `Successfully imported ${res.importedCount} transaction(s)` });
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        setStatus({ ok: false, errors: res.errors || ['Failed to import CSV'] });
      }
    }
  };

  return (
    <div className="portfolio-modal-overlay" role="presentation">
      <div
        className="portfolio-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-modal-title"
      >
        <div className="portfolio-modal-header">
          <h3 id="import-modal-title">Import Portfolio Data</h3>
          <button
            type="button"
            className="portfolio-btn-close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            &times;
          </button>
        </div>

        <div className="portfolio-modal-form">
          {/* Format Selection */}
          <div className="portfolio-form-group">
            <label className="portfolio-form-label">Data Format</label>
            <div className="portfolio-segmented-control" role="group" aria-label="Import format">
              <button
                type="button"
                className={`portfolio-segment-btn ${format === 'JSON' ? 'active' : ''}`}
                onClick={() => { setFormat('JSON'); setStatus(null); }}
              >
                JSON (Full Backup)
              </button>
              <button
                type="button"
                className={`portfolio-segment-btn ${format === 'CSV' ? 'active' : ''}`}
                onClick={() => { setFormat('CSV'); setStatus(null); }}
              >
                CSV (Ledger Only)
              </button>
            </div>
          </div>

          {/* Import Mode Selection */}
          <div className="portfolio-form-group">
            <label className="portfolio-form-label">Import Mode</label>
            <select
              className="portfolio-input"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            >
              <option value="REPLACE_ACTIVE">Replace Active Portfolio (Clear & Load)</option>
              {format === 'JSON' && (
                <option value="NEW_PORTFOLIO">Add As New Portfolio</option>
              )}
              <option value="MERGE">Append / Merge to Active Portfolio</option>
            </select>
          </div>

          {format === 'CSV' && (
            <div className="portfolio-alert portfolio-alert-info">
              <strong>Notice on CSV Imports:</strong>
              <p>
                CSV files store transaction entries only. Manual price marks are not included in CSV exports and will not be restored from CSV.
                Use JSON format for full backups including price marks.
              </p>
            </div>
          )}

          {/* File Picker or Paste Area */}
          <div className="portfolio-form-group">
            <label className="portfolio-form-label">Select File</label>
            <input
              type="file"
              accept={format === 'JSON' ? '.json,application/json' : '.csv,text/csv'}
              onChange={handleFileUpload}
              className="portfolio-file-input"
              aria-label="Import File"
            />
          </div>

          <div className="portfolio-form-group">
            <label htmlFor="import-content" className="portfolio-form-label">
              Or Paste {format} Text
            </label>
            <textarea
              id="import-content"
              className="portfolio-textarea"
              rows={6}
              placeholder={`Paste ${format} payload here...`}
              value={content}
              onChange={(e) => { setContent(e.target.value); setStatus(null); }}
            />
          </div>

          {/* Status / Errors */}
          {status && (
            <div
              className={`portfolio-alert ${status.ok ? 'portfolio-alert-success' : 'portfolio-alert-error'}`}
              role="alert"
            >
              {status.ok ? (
                <span>{status.message}</span>
              ) : (
                <div>
                  <strong>Import failed:</strong>
                  <ul>
                    {status.errors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="portfolio-modal-actions">
            <button
              type="button"
              className="portfolio-btn portfolio-btn-secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="portfolio-btn portfolio-btn-primary"
              onClick={handleImport}
              disabled={!content.trim()}
            >
              Execute Import
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
