/**
 * Transactional Import Preview Modal (P0-05).
 * Inspects uploaded CSV or JSON, performs security & formula audits,
 * and renders an explicit diagnostic breakdown before allowing user merge.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { parseWatchlistFile } from './equityModel.js';

export function ImportPreviewModal({
  isOpen,
  onClose,
  currentKeys = [],
  onConfirmMerge,
}) {
  const [fileName, setFileName] = useState('');
  const [parseResult, setParseResult] = useState(null);
  const [generalError, setGeneralError] = useState('');
  const modalRef = useRef(null);

  const handleModalClose = useCallback(() => {
    setFileName('');
    setParseResult(null);
    setGeneralError('');
    onClose();
  }, [onClose]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleModalClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleModalClose]);

  if (!isOpen) return null;

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setGeneralError('');

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === 'string') {
        const result = parseWatchlistFile(text, currentKeys);
        if (!result.ok) {
          setGeneralError(result.error);
          setParseResult(null);
        } else {
          setParseResult(result);
        }
      }
    };
    reader.onerror = () => {
      setGeneralError('Failed to read the selected file.');
    };
    reader.readAsText(file);
  };

  const handleConfirm = () => {
    if (parseResult?.validCandidates?.length > 0) {
      onConfirmMerge(parseResult.validCandidates);
      handleModalClose();
    }
  };

  const summary = parseResult?.summary;

  return (
    <div className="market-equity-modal-backdrop" role="presentation">
      <div
        className="market-equity-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-modal-title"
        ref={modalRef}
      >
        <div className="market-equity-modal__header">
          <h3 id="import-modal-title">Import Watchlist (JSON or CSV)</h3>
          <button
            type="button"
            className="market-equity-modal__close-btn"
            onClick={handleModalClose}
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        <div className="market-equity-modal__body">
          <p className="market-equity-modal__hint">
            Upload an exported watchlist or a CSV with an <code>exchange,symbol</code> format.
            Maximum file size: 100 KB. Malicious formula characters (<code>=, +, -, @</code>) are blocked.
          </p>

          <div className="market-equity-modal__file-picker">
            <label className="market-equity-modal__upload-label">
              <span>Choose CSV or JSON File</span>
              <input
                type="file"
                accept=".csv,.json,text/csv,application/json"
                onChange={handleFileUpload}
                className="market-equity-modal__file-input"
              />
            </label>
            {fileName && <span className="market-equity-modal__filename">{fileName}</span>}
          </div>

          {generalError && (
            <div className="market-equity-modal__error-alert" role="alert">
              <strong>Import Error:</strong> {generalError}
            </div>
          )}

          {parseResult && (
            <div className="market-equity-modal__preview">
              <h4>Import Diagnostic Preview</h4>
              <div className="market-equity-modal__stats-grid">
                <div className="market-equity-modal__stat-card market-equity-modal__stat-card--success">
                  <span className="market-equity-modal__stat-num">{summary.canImport}</span>
                  <span className="market-equity-modal__stat-label">Ready to Add</span>
                </div>
                <div className="market-equity-modal__stat-card">
                  <span className="market-equity-modal__stat-num">{summary.duplicates}</span>
                  <span className="market-equity-modal__stat-label">Already Saved</span>
                </div>
                <div className="market-equity-modal__stat-card">
                  <span className="market-equity-modal__stat-num">{summary.overflow}</span>
                  <span className="market-equity-modal__stat-label">Capacity Limit</span>
                </div>
                <div className="market-equity-modal__stat-card market-equity-modal__stat-card--danger">
                  <span className="market-equity-modal__stat-num">{summary.rejected}</span>
                  <span className="market-equity-modal__stat-label">Rejected / Invalid</span>
                </div>
              </div>

              {parseResult.validCandidates.length > 0 && (
                <div className="market-equity-modal__section">
                  <p className="market-equity-modal__subheading">
                    Symbols to be merged (preserves existing order):
                  </p>
                  <div className="market-equity-modal__chip-list">
                    {parseResult.validCandidates.map(key => (
                      <span key={key} className="market-equity-chip market-equity-chip--new">
                        +{key}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {parseResult.rejectedRows.length > 0 && (
                <div className="market-equity-modal__section">
                  <p className="market-equity-modal__subheading text-danger">
                    Rejected rows (skipped automatically):
                  </p>
                  <ul className="market-equity-modal__rejected-list">
                    {parseResult.rejectedRows.map((rej, idx) => (
                      <li key={idx}>
                        <strong>Row {rej.row}:</strong> <code>{rej.raw}</code> — {rej.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="market-equity-modal__footer">
          <button
            type="button"
            className="market-equity-btn market-equity-btn--secondary"
            onClick={handleModalClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="market-equity-btn market-equity-btn--primary"
            onClick={handleConfirm}
            disabled={!parseResult || parseResult.validCandidates.length === 0}
          >
            {parseResult?.validCandidates?.length > 0
              ? `Confirm Merge (+${parseResult.validCandidates.length} symbols)`
              : 'Confirm Merge'}
          </button>
        </div>
      </div>
    </div>
  );
}
