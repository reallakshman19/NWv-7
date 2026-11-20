/**
 * NWv7 Market Desk R2.1 - WP-04 Transaction Modal
 * Add or edit BUY/SELL equity transactions with same-day sequence ordering and cash flow preview.
 */

import React, { useState } from 'react';
import { parseInstrumentKey } from '../../contracts/instrumentIdentity.js';

function TransactionDialog({ onClose, onSave, initialData = null }) {
  const [type, setType] = useState(() => initialData?.type || 'BUY');
  const [exchange, setExchange] = useState(() => {
    if (initialData?.instrumentKey) {
      const parsed = parseInstrumentKey(initialData.instrumentKey);
      if (parsed) return parsed.exchange;
    }
    return initialData?.exchange || 'NSE';
  });
  const [symbol, setSymbol] = useState(() => {
    if (initialData?.instrumentKey) {
      const parsed = parseInstrumentKey(initialData.instrumentKey);
      if (parsed) return parsed.symbol;
    }
    return initialData?.symbol || '';
  });
  const [date, setDate] = useState(() => initialData?.date || new Date().toISOString().slice(0, 10));
  const [sequenceIndex, setSequenceIndex] = useState(() => Number.isInteger(initialData?.sequenceIndex) ? initialData.sequenceIndex : 0);
  const [quantity, setQuantity] = useState(() => initialData?.quantity ? String(initialData.quantity) : '');
  const [price, setPrice] = useState(() => initialData?.price ? String(initialData.price) : '');
  const [fee, setFee] = useState(() => initialData?.fee !== undefined ? String(initialData.fee) : '0');
  const [notes, setNotes] = useState(() => initialData?.notes || '');
  const [errors, setErrors] = useState([]);

  const isEdit = Boolean(initialData && initialData.id);

  // Compute live cash flow preview
  const q = Number(quantity);
  const p = Number(price);
  const f = Number(fee) || 0;
  const hasValidNumbers = !isNaN(q) && q > 0 && !isNaN(p) && p > 0;
  const cashFlowPreview = hasValidNumbers
    ? (type === 'BUY' ? -(q * p + f) : (q * p - f))
    : null;

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrors([]);

    const cleanSymbol = symbol.trim().toUpperCase();
    const cleanDate = date.trim();
    const cleanQty = Number(quantity);
    const cleanPrice = Number(price);
    const cleanFee = Number(fee) || 0;
    const cleanSeq = Number(sequenceIndex) || 0;

    const payload = {
      type,
      exchange,
      symbol: cleanSymbol,
      date: cleanDate,
      sequenceIndex: cleanSeq,
      quantity: cleanQty,
      price: cleanPrice,
      fee: cleanFee,
      notes: notes.trim()
    };

    const res = onSave(payload);
    if (res && !res.ok) {
      setErrors(res.errors || [res.error || 'Failed to save transaction']);
    } else {
      onClose();
    }
  };

  return (
    <div className="portfolio-modal-overlay" role="presentation">
      <div
        className="portfolio-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tx-modal-title"
      >
        <div className="portfolio-modal-header">
          <h3 id="tx-modal-title">
            {isEdit ? 'Edit Transaction' : 'Record Transaction'}
          </h3>
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
          {errors.length > 0 && (
            <div className="portfolio-alert portfolio-alert-error" role="alert">
              <strong>Validation Error:</strong>
              <ul>
                {errors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Type Segmented Control */}
          <div className="portfolio-form-group">
            <label className="portfolio-form-label">Transaction Type</label>
            <div className="portfolio-segmented-control" role="group" aria-label="Transaction Type">
              <button
                type="button"
                className={`portfolio-segment-btn ${type === 'BUY' ? 'active buy' : ''}`}
                onClick={() => setType('BUY')}
                aria-pressed={type === 'BUY'}
              >
                BUY (Inflow of shares)
              </button>
              <button
                type="button"
                className={`portfolio-segment-btn ${type === 'SELL' ? 'active sell' : ''}`}
                onClick={() => setType('SELL')}
                aria-pressed={type === 'SELL'}
              >
                SELL (Outflow of shares)
              </button>
            </div>
          </div>

          {/* Instrument Row: Exchange & Symbol */}
          <div className="portfolio-form-row">
            <div className="portfolio-form-group portfolio-form-group-sm">
              <label htmlFor="tx-exchange" className="portfolio-form-label">
                Exchange
              </label>
              <select
                id="tx-exchange"
                className="portfolio-input"
                value={exchange}
                onChange={(e) => setExchange(e.target.value)}
              >
                <option value="NSE">NSE</option>
                <option value="BSE">BSE</option>
              </select>
            </div>

            <div className="portfolio-form-group portfolio-form-group-lg">
              <label htmlFor="tx-symbol" className="portfolio-form-label">
                Symbol
              </label>
              <input
                id="tx-symbol"
                type="text"
                className="portfolio-input uppercase"
                placeholder="e.g. INFY, TCS, RELIANCE"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                required
              />
            </div>
          </div>

          {/* Date & Sequence Index */}
          <div className="portfolio-form-row">
            <div className="portfolio-form-group portfolio-form-group-lg">
              <label htmlFor="tx-date" className="portfolio-form-label">
                Trade Date
              </label>
              <input
                id="tx-date"
                type="date"
                className="portfolio-input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>

            <div className="portfolio-form-group portfolio-form-group-sm">
              <label htmlFor="tx-seq" className="portfolio-form-label" title="Execution order for multiple trades on the same day">
                Same-Day Seq
              </label>
              <input
                id="tx-seq"
                type="number"
                min="0"
                max="999"
                className="portfolio-input"
                value={sequenceIndex}
                onChange={(e) => setSequenceIndex(e.target.value)}
                title="Use 0 for first trade of the day, 1 for second, etc."
              />
            </div>
          </div>

          {/* Quantity, Unit Price, and Fee */}
          <div className="portfolio-form-row three-col">
            <div className="portfolio-form-group">
              <label htmlFor="tx-quantity" className="portfolio-form-label">
                Quantity (Shares)
              </label>
              <input
                id="tx-quantity"
                type="number"
                min="1"
                step="1"
                className="portfolio-input"
                placeholder="e.g. 10"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </div>

            <div className="portfolio-form-group">
              <label htmlFor="tx-price" className="portfolio-form-label">
                Price (₹ / unit)
              </label>
              <input
                id="tx-price"
                type="number"
                min="0.0001"
                step="0.0001"
                className="portfolio-input"
                placeholder="e.g. 1500.50"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
              />
            </div>

            <div className="portfolio-form-group">
              <label htmlFor="tx-fee" className="portfolio-form-label" title="STT, brokerage, stamp duty, GST">
                Total Fees (₹)
              </label>
              <input
                id="tx-fee"
                type="number"
                min="0"
                step="0.01"
                className="portfolio-input"
                placeholder="0.00"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
              />
            </div>
          </div>

          {/* Cash Flow Summary Preview */}
          {cashFlowPreview !== null && (
            <div className="portfolio-flow-preview">
              <span className="portfolio-flow-label">
                {type === 'BUY' ? 'Total Cash Outflow (Cost Basis Impact):' : 'Net Cash Inflow (Proceeds):'}
              </span>
              <span className={`portfolio-flow-value ${type === 'BUY' ? 'negative' : 'positive'}`}>
                {type === 'BUY' ? '-' : '+'}₹{Math.abs(cashFlowPreview).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          )}

          {/* Notes */}
          <div className="portfolio-form-group">
            <label htmlFor="tx-notes" className="portfolio-form-label">
              Notes (Optional, max 280 chars)
            </label>
            <input
              id="tx-notes"
              type="text"
              maxLength={280}
              className="portfolio-input"
              placeholder="e.g. Long-term core allocation, SIP installment"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="portfolio-modal-actions">
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
              {isEdit ? 'Update Transaction' : 'Save Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function TransactionModal(props) {
  if (!props.isOpen) return null;
  const dialogKey = props.initialData?.id || props.initialData?.instrumentKey || 'new-tx';
  return <TransactionDialog {...props} key={dialogKey} />;
}
