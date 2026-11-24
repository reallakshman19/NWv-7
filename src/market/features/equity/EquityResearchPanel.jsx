/**
 * EquityResearchPanel component (WP-03).
 * Full workspace component for the 'equity' workspace.
 *
 * Implements:
 * - 16 tracked NSE universe explorer with official quote links (no fake quote feeds).
 * - Up to 12 saved watchlist items with reorder, remove, and custom ticker add.
 * - Non-destructive V2 storage with session fallback (P0-01).
 * - Curated metadata for 16 tracked shares, unverified warning for custom tickers (P1).
 * - Private research notes with 2,000 character limit (P0-03).
 * - Cross-workpack handoff for Portfolio (WP-04) and News (WP-07) (P0-04).
 * - Transactional import preview & export (P0-05).
 */
import React, { useRef, useState } from 'react';
import { useWatchlist, defaultWatchlistStore } from './watchlistStore.js';
import { useEquityNote, defaultNotesStore, MAX_NOTE_LENGTH } from './notesStore.js';
import {
  TRACKED_NSE_METADATA,
  getEquityMetadata,
  getNseQuoteUrl,
  getNseAnnouncementsUrl,
} from './equityMetadata.js';
import {
  validateCustomSymbol,
  fromCanonicalKey,
  generateWatchlistCsv,
  generateWatchlistJson,
} from './equityModel.js';
import { ImportPreviewModal } from './ImportPreviewModal.jsx';
import { searchTrackedEquities, selectEquityResearch } from './equityResearchResolution.js';
import './equity.css';

export function EquityResearchPanel({
  compact = false,
  onNavigate,
  onOpenHolding,
  onFindNews,
  store = defaultWatchlistStore,
  notesStore = defaultNotesStore,
  className = '',
}) {
  const {
    keys,
    count,
    maxLimit,
    isFull,
    isPersistent,
    errorMessage,
    addKey,
    removeKey,
    reorderKeys,
    mergeKeys,
  } = useWatchlist(store);

  const [selectedKey, setSelectedKey] = useState(() => keys[0] || 'NSE:RELIANCE');
  const detailHeading = useRef(null);
  const [customInput, setCustomInput] = useState('');
  const [researchQuery, setResearchQuery] = useState('');
  const [inputFeedback, setInputFeedback] = useState('');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const inspectSymbol = (key) => {
    setSelectedKey(key);
    if (!window.matchMedia?.('(max-width: 880px)').matches) return;
    window.requestAnimationFrame(() => {
      detailHeading.current?.focus({ preventScroll: true });
      detailHeading.current?.scrollIntoView?.({ block: 'start' });
    });
  };

  // Selected item derived state
  const selectedSymbol = fromCanonicalKey(selectedKey) || 'RELIANCE';
  const selectedMeta = getEquityMetadata(selectedSymbol);
  const research = selectEquityResearch(selectedKey);
  const selectedQuoteUrl = research?.referenceUrl ?? null;
  const searchResults = searchTrackedEquities(researchQuery);
  const selectedAnnouncementsUrl = getNseAnnouncementsUrl(selectedSymbol);

  // Notes state for selected symbol
  const { note, saveNote, deleteNote } = useEquityNote(selectedKey, notesStore);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteFeedback, setNoteFeedback] = useState('');

  // Sync draft when selected symbol or loaded note changes
  const [prevSelectedKey, setPrevSelectedKey] = useState(selectedKey);
  if (prevSelectedKey !== selectedKey) {
    setPrevSelectedKey(selectedKey);
    setNoteDraft(note?.text || '');
    setNoteFeedback('');
  }

  // Add custom symbol handler
  const handleAddCustom = (e) => {
    e.preventDefault();
    setInputFeedback('');

    const validSymbol = validateCustomSymbol(customInput);
    if (!validSymbol) {
      setInputFeedback('Enter a valid NSE ticker (1-20 alphanumeric characters, no formula characters).');
      return;
    }

    const canonical = `NSE:${validSymbol}`;
    if (keys.includes(canonical)) {
      setInputFeedback(`${validSymbol} is already in your watchlist.`);
      return;
    }

    if (isFull) {
      setInputFeedback(`Watchlist limit (${maxLimit}) reached. Remove a symbol first.`);
      return;
    }

    const res = addKey(canonical);
    if (res.ok) {
      setSelectedKey(canonical);
      setCustomInput('');
      const isCurated = Boolean(TRACKED_NSE_METADATA[validSymbol]);
      setInputFeedback(
        isCurated
          ? `${validSymbol} added to watchlist.`
          : `${validSymbol} added. Note: User-entered NSE symbol — listing not verified.`
      );
    } else {
      setInputFeedback(res.reason || 'Could not add symbol.');
    }
  };

  // Note save handler
  const handleSaveNote = (e) => {
    e.preventDefault();
    const res = saveNote(noteDraft);
    if (res.ok) {
      setNoteFeedback(
        res.isPersistent
          ? 'Note saved locally in browser profile.'
          : 'Note saved for this session only (storage denied).'
      );
    } else {
      setNoteFeedback(res.reason || 'Could not save note.');
    }
  };

  // Note delete handler
  const handleDeleteNote = () => {
    deleteNote();
    setNoteDraft('');
    setNoteFeedback('Note deleted.');
  };

  // Export handlers
  const handleExportJson = () => {
    const jsonStr = generateWatchlistJson(keys);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nwv7_watchlist_export_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    const csvStr = generateWatchlistCsv(keys);
    const blob = new Blob([csvStr], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nwv7_watchlist_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className={`market-equity-panel ${compact ? 'market-equity-panel--compact' : ''} ${className}`.trim()}
      aria-label="NSE Equity Research and Watchlist Workspace"
    >
      {/* HEADER SECTION */}
      <div className="market-equity-panel__header">
        <div className="market-equity-panel__branding">
          <h2 className="market-equity-panel__title">NSE Equity Research & Watchlist</h2>
          <p className="market-equity-panel__subtitle">
            Curated 16 tracked universe shares, official exchange links, and private local research.
            Free/open mode does not publish native quote feeds.
          </p>
        </div>

        <div className="market-equity-panel__toolbar">
          {typeof onNavigate === 'function' && (
            <button
              type="button"
              className="market-equity-btn market-equity-btn--secondary"
              onClick={() => onNavigate('overview')}
            >
              Overview
            </button>
          )}
          <button
            type="button"
            className="market-equity-btn market-equity-btn--secondary"
            onClick={handleExportCsv}
            disabled={keys.length === 0}
            aria-label="Export watchlist as CSV"
          >
            Export CSV
          </button>
          <button
            type="button"
            className="market-equity-btn market-equity-btn--secondary"
            onClick={handleExportJson}
            disabled={keys.length === 0}
            aria-label="Export watchlist as JSON"
          >
            Export JSON
          </button>
          <button
            type="button"
            className="market-equity-btn market-equity-btn--primary"
            onClick={() => setIsImportModalOpen(true)}
            aria-label="Import watchlist from file"
          >
            Import File
          </button>
        </div>
      </div>

      {/* STORAGE & PERSISTENCE WARNING (P0-01 / MKT-030) */}
      {!isPersistent && (
        <div className="market-equity-panel__warning-banner" role="status">
          <strong>Storage Notice:</strong> {errorMessage || 'Browser storage is unavailable. Changes are retained for this session only.'}
        </div>
      )}

      {/* MAIN TWO-COLUMN WORKSPACE LAYOUT */}
      <div className="market-equity-panel__grid">
        {/* LEFT COLUMN: WATCHLIST & EXPLORER */}
        <div className="market-equity-panel__col-main">
          {/* 1. SAVED WATCHLIST MANAGER */}
          <section className="market-equity-card" aria-label="Saved Watchlist Manager">
            <div className="market-equity-card__header">
              <h3 className="market-equity-card__title">
                Saved Watchlist ({count}/{maxLimit})
              </h3>
              <span className="market-equity-muted">Drag or use arrows to reorder</span>
            </div>

            {keys.length === 0 ? (
              <p className="market-equity-empty-note">
                No saved shares yet. Add from the 16 tracked shares below or enter a custom symbol.
              </p>
            ) : (
              <ul className="market-equity-watchlist-list" aria-label="Saved symbols list">
                {keys.map((key, index) => {
                  const sym = fromCanonicalKey(key) || key;
                  const isSelected = key === selectedKey;
                  const meta = getEquityMetadata(sym);

                  return (
                    <li
                      key={key}
                      className={`market-equity-watchlist-item ${isSelected ? 'is-selected' : ''}`}
                    >
                      <button
                        type="button"
                        className="market-equity-watchlist-item__select-btn"
                        onClick={() => inspectSymbol(key)}
                        aria-pressed={isSelected}
                        aria-label={`Select ${sym} for research detail`}
                      >
                        <span className="market-equity-watchlist-item__symbol">{sym}</span>
                        <span className="market-equity-watchlist-item__name">
                          {meta?.isCurated ? meta.name : 'Custom symbol'}
                        </span>
                      </button>

                      <div className="market-equity-watchlist-item__actions">
                        <button
                          type="button"
                          className="market-equity-icon-btn"
                          disabled={index === 0}
                          onClick={() => reorderKeys(index, index - 1)}
                          aria-label={`Move ${sym} up`}
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          className="market-equity-icon-btn"
                          disabled={index === keys.length - 1}
                          onClick={() => reorderKeys(index, index + 1)}
                          aria-label={`Move ${sym} down`}
                        >
                          ▼
                        </button>
                        <button
                          type="button"
                          className="market-equity-icon-btn market-equity-icon-btn--remove"
                          onClick={() => removeKey(key)}
                          aria-label={`Remove ${sym} from watchlist`}
                        >
                          ✕
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* ADD CUSTOM SYMBOL FORM */}
            <form className="market-equity-add-form" onSubmit={handleAddCustom}>
              <div className="market-equity-add-form__input-group">
                <label htmlFor="custom-symbol-input" className="sr-only">
                  Add NSE symbol
                </label>
                <input
                  id="custom-symbol-input"
                  type="text"
                  maxLength={20}
                  placeholder="Add NSE symbol (e.g. TATAMOTORS)"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  className="market-equity-input"
                  disabled={isFull}
                />
                <button
                  type="submit"
                  className="market-equity-btn market-equity-btn--primary"
                  disabled={isFull || customInput.trim().length === 0}
                >
                  Save Symbol
                </button>
              </div>

              {inputFeedback && (
                <p className="market-equity-feedback" role="status">
                  {inputFeedback}
                </p>
              )}
            </form>
          </section>

          {/* 2. 16 TRACKED UNIVERSE EXPLORER (MKT-009) */}
          <section className="market-equity-card" aria-label="Tracked Universe Explorer">
            <div className="market-equity-card__header">
              <div>
                <h3 className="market-equity-card__title">16 Tracked NSE Universe</h3>
                <p className="market-equity-muted">
                  Tracked core equity universe with direct exchange verification links.
                </p>
              </div>
            </div>

            <label htmlFor="tracked-equity-search">Search tracked shares by name or symbol</label>
            <input id="tracked-equity-search" className="market-equity-input" type="search"
              value={researchQuery} onChange={event => setResearchQuery(event.target.value)} />
            {searchResults.length === 0 && <p role="status">No matching tracked shares. Custom NSE symbols can be saved above; listings are not verified.</p>}
            <div className="market-equity-universe-grid">
              {searchResults.map(({symbol}) => {
                const meta = TRACKED_NSE_METADATA[symbol];
                const canonical = `NSE:${symbol}`;
                const isSaved = keys.includes(canonical);
                const isSelected = selectedKey === canonical;
                const quoteUrl = getNseQuoteUrl(symbol);

                return (
                  <div
                    key={symbol}
                    className={`market-equity-universe-card ${isSelected ? 'is-selected' : ''}`}
                  >
                    <div className="market-equity-universe-card__header">
                      <strong className="market-equity-universe-card__sym">{symbol}</strong>
                      <span className="market-equity-badge">NSE</span>
                    </div>

                    <p className="market-equity-universe-card__name">{meta.name}</p>
                    <p className="market-equity-universe-card__sector">{meta.sector}</p>

                    <div className="market-equity-universe-card__actions">
                      <button
                        type="button"
                        className="market-equity-btn market-equity-btn--tiny"
                        onClick={() => inspectSymbol(canonical)}
                      >
                        Inspect
                      </button>

                      {isSaved ? (
                        <span className="market-equity-saved-indicator" aria-label={`${symbol} saved in watchlist`}>
                          ✓ Saved
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="market-equity-btn market-equity-btn--tiny market-equity-btn--add"
                          onClick={() => addKey(canonical)}
                          disabled={isFull}
                          aria-label={`Add ${symbol} to watchlist`}
                        >
                          + Watch
                        </button>
                      )}

                      {quoteUrl && (
                        <a
                          href={quoteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="market-equity-quote-link"
                          aria-label={`Official NSE quote for ${symbol} (opens in new tab)`}
                        >
                          Quote ↗
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* RIGHT COLUMN: EQUITY DETAIL & RESEARCH NOTES */}
        <div className="market-equity-panel__col-side">
          <section className="market-equity-card market-equity-detail" aria-label="Equity Research Detail">
            <div className="market-equity-detail__header">
              <div>
                <span className="market-equity-badge">NSE Equity</span>
                <h3 className="market-equity-detail__title" ref={detailHeading} tabIndex={-1}>{selectedSymbol}</h3>
                <p className="market-equity-detail__name">
                  {selectedMeta?.isCurated
                    ? selectedMeta.name
                    : 'User-entered NSE symbol — listing not verified'}
                </p>
                <p className="market-equity-muted">{selectedMeta?.sector}</p>
              </div>
            </div>

            {/* Native NSE quotes require an authorized source; use official links. */}
            <div className="market-equity-quote-block" role="status" style={{ margin: '16px 0', padding: '12px 14px', background: 'var(--market-bg-primary, #0f172a)', border: '1px solid var(--market-border, #334155)', borderRadius: '6px' }}>
              <div style={{ color: 'var(--market-text-muted, #94a3b8)' }}>
                Native quote unavailable. Verify price, change and 52-week range directly at NSE.
              </div>
            </div>

            {/* OFFICIAL VERIFICATION LINKS */}
            <div className="market-equity-detail__links-row">
              {selectedQuoteUrl && (
                <a
                  href={selectedQuoteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="market-equity-link-pill"
                >
                  Official NSE Quote <span aria-hidden="true">↗</span>
                </a>
              )}
              {selectedAnnouncementsUrl && (
                <a
                  href={selectedAnnouncementsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="market-equity-link-pill"
                >
                  Corporate Filings / Announcements <span aria-hidden="true">↗</span>
                </a>
              )}
            </div>

            {/* CROSS-WORKPACK INTEGRATION ACTIONS (P0-04) */}
            <div className="market-equity-detail__cross-actions">
              <h4 className="market-equity-subheading">Actions & Cross-Workspace</h4>
              <div className="market-equity-action-group">
                {typeof onOpenHolding === 'function' ? (
                  <button
                    type="button"
                    className="market-equity-btn market-equity-btn--secondary"
                    onClick={() => onOpenHolding(selectedKey)}
                  >
                    View in Portfolio
                  </button>
                ) : (
                  <button
                    type="button"
                    className="market-equity-btn market-equity-btn--secondary is-disabled"
                    disabled
                    title="Portfolio integration available in WP-04"
                  >
                    Portfolio (WP-04)
                  </button>
                )}

                {typeof onFindNews === 'function' ? (
                  <button
                    type="button"
                    className="market-equity-btn market-equity-btn--secondary"
                    onClick={() => onFindNews(selectedKey)}
                  >
                    Find Market News
                  </button>
                ) : (
                  <button
                    type="button"
                    className="market-equity-btn market-equity-btn--secondary is-disabled"
                    disabled
                    title="News integration available in WP-07"
                  >
                    Related News (WP-07)
                  </button>
                )}
              </div>
            </div>

            {/* PRIVATE RESEARCH NOTES (P0-03) */}
            <div className="market-equity-detail__notes-section">
              <div className="market-equity-notes__header">
                <h4 className="market-equity-subheading">Private Research Notes</h4>
                <span className="market-equity-char-count">
                  {noteDraft.length}/{MAX_NOTE_LENGTH}
                </span>
              </div>

              <p className="market-equity-notes__disclosure">
                Research notes are stored locally in your browser profile.
              </p>

              <form onSubmit={handleSaveNote}>
                <textarea
                  className="market-equity-notes__textarea"
                  maxLength={MAX_NOTE_LENGTH}
                  rows={4}
                  placeholder={`Private notes on ${selectedSymbol} (e.g. investment thesis, target metrics)...`}
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  aria-label={`Private research notes for ${selectedSymbol}`}
                />

                <div className="market-equity-notes__actions">
                  <button
                    type="submit"
                    className="market-equity-btn market-equity-btn--primary"
                    disabled={noteDraft.trim().length === 0 && !note?.text}
                  >
                    Save Note
                  </button>

                  {note?.text && (
                    <button
                      type="button"
                      className="market-equity-btn market-equity-btn--secondary"
                      onClick={handleDeleteNote}
                    >
                      Delete Note
                    </button>
                  )}
                </div>

                {noteFeedback && (
                  <p className="market-equity-feedback" role="status">
                    {noteFeedback}
                  </p>
                )}
              </form>
            </div>
          </section>
        </div>
      </div>

      {/* TRANSACTIONAL IMPORT PREVIEW MODAL (P0-05) */}
      <ImportPreviewModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        currentKeys={keys}
        onConfirmMerge={(newKeys) => mergeKeys(newKeys)}
      />
    </div>
  );
}
