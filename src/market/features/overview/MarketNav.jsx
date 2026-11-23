import React, { useState, useEffect, useRef } from 'react';
import {
  R21_MARKET_WORKSPACES,
  R21_MARKET_WORKSPACE_IDS,
  normalizeR21MarketView,
} from '../../contracts/index.js';

/**
 * Mobile presentation mapping (P0-01):
 * Reconciles the frozen 9-workspace registry with the exact 4-control mobile bar
 * [Overview] [Stocks] [Funds] [More] per UI_ASCII_ACCEPTANCE.md.
 */
export const MOBILE_DIRECT_IDS = Object.freeze(['overview', 'equity', 'funds']);

export const MOBILE_MORE_IDS = Object.freeze(
  R21_MARKET_WORKSPACE_IDS.filter(id => !MOBILE_DIRECT_IDS.includes(id))
);

export const MOBILE_DISPLAY_LABELS = Object.freeze({
  overview: 'Overview',
  equity: 'Stocks',
  funds: 'Funds',
  more: 'More',
});

/**
 * Lookup workspace descriptor by ID.
 */
function getWorkspaceDescriptor(id) {
  return R21_MARKET_WORKSPACES.find(w => w.id === id) || {
    id,
    label: id[0].toUpperCase() + id.slice(1),
    ariaLabel: id,
  };
}

export function MarketNav({
  currentWorkspace = 'overview',
  onNavigate,
  className = '',
}) {
  const activeId = normalizeR21MarketView(currentWorkspace);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const moreButtonRef = useRef(null);
  const menuRef = useRef(null);

  const handleSelect = (id) => {
    setIsMoreOpen(false);
    if (isMoreOpen) moreButtonRef.current?.focus({ preventScroll: true });
    if (typeof onNavigate === 'function') {
      onNavigate(id);
    }
  };

  const toggleMore = () => {
    setIsMoreOpen(prev => !prev);
  };

  const navigateMoreItems = (event) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = [...event.currentTarget.querySelectorAll('button')];
    const index = items.indexOf(document.activeElement);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    const next = {
      Home: 0,
      End: items.length - 1,
    }[event.key] ?? (index + step + items.length) % items.length;
    const item = items[next];
    if (!item) return;
    event.preventDefault();
    item.focus({ preventScroll: true });
    const menu = menuRef.current;
    const itemBounds = item.getBoundingClientRect();
    const menuBounds = menu.getBoundingClientRect();
    menu.scrollTop += Math.max(0, itemBounds.bottom - menuBounds.bottom)
      + Math.min(0, itemBounds.top - menuBounds.top);
  };

  // Keyboard navigation & Escape key handling for the More menu dialog
  useEffect(() => {
    if (!isMoreOpen) return;

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsMoreOpen(false);
        moreButtonRef.current?.focus({ preventScroll: true });
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMoreOpen]);

  // Focus the first item when More menu opens without scrolling the viewport
  useEffect(() => {
    if (isMoreOpen && menuRef.current) {
      const firstButton = menuRef.current.querySelector('[role=menuitem]');
      firstButton?.focus({ preventScroll: true });
    }
  }, [isMoreOpen]);

  // Close when clicking outside
  useEffect(() => {
    if (!isMoreOpen) return;

    const onPointerDown = (e) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target) &&
        !moreButtonRef.current?.contains(e.target)
      ) {
        setIsMoreOpen(false);
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isMoreOpen]);

  const isMoreActive = MOBILE_MORE_IDS.includes(activeId);

  return (
    <nav
      className={`market-nav ${className}`.trim()}
      aria-label="Market workspaces"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsMoreOpen(false);
      }}
    >
      {/* Desktop navigation bar: All 9 workspaces */}
      <div className="market-nav__desktop" role="tablist" aria-label="Desktop workspaces">
        {R21_MARKET_WORKSPACE_IDS.map((id) => {
          const item = getWorkspaceDescriptor(id);
          const isSelected = activeId === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              id={`market-tab-${id}`}
              className={`market-nav__tab ${isSelected ? 'is-active' : ''}`.trim()}
              aria-selected={isSelected}
              aria-current={isSelected ? 'page' : undefined}
              aria-controls={`market-${id}-content`}
              onClick={() => handleSelect(id)}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Mobile navigation bar: 3 direct tabs + More button */}
      <div className="market-nav__mobile" role="tablist" aria-label="Mobile workspaces">
        {MOBILE_DIRECT_IDS.map((id) => {
          const isSelected = activeId === id;
          const displayLabel = MOBILE_DISPLAY_LABELS[id] || id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              id={`market-mobile-tab-${id}`}
              className={`market-nav__mobile-tab ${isSelected ? 'is-active' : ''}`.trim()}
              aria-selected={isSelected}
              aria-current={isSelected ? 'page' : undefined}
              aria-label={displayLabel}
              onClick={() => handleSelect(id)}
            >
              {displayLabel}
            </button>
          );
        })}

        <button
          ref={moreButtonRef}
          type="button"
          id="market-mobile-more-btn"
          className={`market-nav__mobile-tab market-nav__more-btn ${isMoreActive ? 'is-active' : ''}`.trim()}
          aria-haspopup="dialog"
          aria-expanded={isMoreOpen}
          aria-controls="market-more-menu"
          aria-label="More workspaces"
          onClick={toggleMore}
        >
          {MOBILE_DISPLAY_LABELS.more}
          <span className="market-nav__more-caret" aria-hidden="true">
            {isMoreOpen ? ' ▲' : ' ▼'}
          </span>
        </button>
      </div>

      {/* Mobile More drawer / dropdown */}
      {isMoreOpen && (
        <div
          ref={menuRef}
          id="market-more-menu"
          role="dialog"
          aria-label="More market workspaces"
          className="market-nav__more-dialog"
        >
          <div className="market-nav__more-header">
            <strong>All Workspaces</strong>
            <button
              type="button"
              className="market-nav__more-close"
              aria-label="Close more workspaces menu"
              onClick={() => {
                setIsMoreOpen(false);
                moreButtonRef.current?.focus({ preventScroll: true });
              }}
            >
              ✕
            </button>
          </div>
          <ul className="market-nav__more-list" role="menu" aria-label="Additional workspaces" onKeyDown={navigateMoreItems}>
            {MOBILE_MORE_IDS.map((id) => {
              const item = getWorkspaceDescriptor(id);
              const isSelected = activeId === id;
              return (
                <li key={id} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className={`market-nav__more-item ${isSelected ? 'is-active' : ''}`.trim()}
                    aria-current={isSelected ? 'page' : undefined}
                    onClick={() => handleSelect(id)}
                  >
                    <span className="market-nav__more-item-title">{item.label}</span>
                    <span className="market-nav__more-item-desc">{item.ariaLabel}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </nav>
  );
}

export default MarketNav;
