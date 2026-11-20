/**
 * NWv7 Market Desk R2.1 - WP-04 Price Mark Modal
 * Enables user to enter or update manual price valuation marks for holdings.
 * Strictly adheres to zero-cost, no-quote-feed policy.
 */

import React, { useState } from 'react';

function PriceMarkDialog({
  onClose,
  onSave,
  onDelete,
  instrumentKey,
  currentMark = null
}) {
  const [price, setPrice] = useState(() => (currentMark && typeof currentMark.price === 'number') ? String(currentMark.price) : '');
  const [asOfDate, setAsOfDate] = useState(() => currentMark?.asOfDate || new Date().toISOString().slice(0, 10));
  const [error, setError] = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError(null);

    const numPrice = Number(price);
    if (isNaN(numPrice) || numPrice <= 0) {
      setError('Price mark must be a positive number greater than 0');
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
      setError('Date must be in YYYY-MM-DD format');
      return;
    }

    const res = onSave(instrumentKey, numPrice, asOfDate);
    if (res && !res.ok) {
      setError(res.error || 'Failed to record price mark');
    } else {
      onClose();
    }
  };

  const handleDelete = () => {
    if (onDelete) {
      onDelete(instrumentKey);
      onClose();
    }
  };

  return (
    <div className="portfolio-modal-overlay" role="presentation">
      <div
        className="portfolio-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mark-modal-title"
      >
        <div className="portfolio-modal-header">
          <h3 id="mark-modal-title">Manual Price Mark: {instrumentKey}</h3>
          <button
            type="button"
            className="portfolio-btn-close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="portfolio-modal-form">
          <div className="portfolio-disclaimer-box">
            <strong>Manual Valuation Mark:</strong>
            <p>
              In accordance with $0 budget and zero-unlicensed-quote policy, prices are entered manually by the user.
              This mark is stored locally and used to compute current value, unrealized P&L, and XIRR.
            </p>
          </div>

          {error && (
            <div className="portfolio-alert portfolio-alert-error" role="alert">
              {error}
            </div>
          )}

          <div className="portfolio-form-row">
            <div className="portfolio-form-group portfolio-form-group-lg">
              <label htmlFor="mark-price" className="portfolio-form-label">
                Unit Price (₹)
              </label>
              <input
                id="mark-price"
                type="number"
                min="0.0001"
                step="0.0001"
                className="portfolio-input"
                placeholder="e.g. 1540.25"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="portfolio-form-group portfolio-form-group-lg">
              <label htmlFor="mark-date" className="portfolio-form-label">
                As of Date
              </label>
              <input
                id="mark-date"
                type="date"
                className="portfolio-input"
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                required
              />
            </div>
          </div>

          {currentMark && currentMark.recordedAt && (
            <div className="portfolio-mark-meta">
              Last updated: {new Date(currentMark.recordedAt).toLocaleString()}
            </div>
          )}

          <div className="portfolio-modal-actions space-between">
            {currentMark ? (
              <button
                type="button"
                className="portfolio-btn portfolio-btn-danger"
                onClick={handleDelete}
              >
                Clear Mark
              </button>
            ) : <span />}

            <div className="portfolio-action-group">
              <button
                type="button"
                className="portfolio-btn portfolio-btn-secondary"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="portfolio-btn portfolio-btn-primary"
              >
                Save Mark
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export function PriceMarkModal(props) {
  if (!props.isOpen || !props.instrumentKey) return null;
  return <PriceMarkDialog {...props} key={props.instrumentKey} />;
}
