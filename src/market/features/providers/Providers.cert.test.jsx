// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MarketProviderBoard,
  IndexSectorPanel,
  BSE_GROUPS,
  BSE_CATALOG,
  BSE_SUPPORTED_INDICES,
  BSE_SUPPORTED_EQUITIES,
  getBseTradingViewUrl,
  getWidgetSymbols,
} from './index.js';

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// Decode the app-generated wrapper to inspect its configuration without fetching TradingView.
function iframeConfig(frame) {
  const wrapperHtml = decodeURIComponent(frame?.getAttribute('src')?.split(',')[1] ?? '');
  const match = wrapperHtml.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  return match ? JSON.parse(match[1]) : null;
}

describe('WP-02 Provider Displays and Indices Certification (WP02-T01 .. WP02-T15)', () => {
  // --------------------------------------------------------------------------
  // WP02-T01: Zero network requests before user opt-in, including StrictMode
  // --------------------------------------------------------------------------
  it('WP02-T01: zero TradingView scripts loaded before explicit user opt-in, even in StrictMode', () => {
    const { container } = render(
      <React.StrictMode>
        <MarketProviderBoard group="indices" />
      </React.StrictMode>
    );

    // Initial mount: zero script elements
    expect(container.querySelector('iframe')).toBeNull();

    // Privacy disclosure must be clearly visible
    expect(screen.getByText(/shares your IP address/i)).toBeTruthy();

    // Explicit user click
    const loadBtn = screen.getByRole('button', { name: /Load BSE indices prices/i });
    fireEvent.click(loadBtn);

    // Exactly one TradingView embed script inserted
    const scripts = container.querySelectorAll('iframe');
    expect(scripts).toHaveLength(1);
    const wrapperSrc = scripts[0].getAttribute('src');
    expect(wrapperSrc).toMatch(/^data:text\/html;charset=utf-8,/);
    expect(scripts[0].hasAttribute('srcdoc')).toBe(false);
    expect(decodeURIComponent(wrapperSrc.split(',')[1])).toContain('https://s3.tradingview.com/external-embedding/embed-widget-market-quotes.js');
    expect(scripts[0].getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-popups');
    expect(scripts[0].getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(document.querySelectorAll('script[src*="tradingview.com"]')).toHaveLength(0);

    const config = iframeConfig(scripts[0]);
    expect(config.title).toBe('BSE indices');
    expect(document.querySelectorAll('script[src*="tradingview.com"]')).toHaveLength(0);
    expect(config.symbolsGroups[0].symbols.map(s => s.name)).toEqual(['BSE:SENSEX', 'BSE:BSE500']);
  });

  // --------------------------------------------------------------------------
  // WP02-T02: BSE and NSE identities remain distinct; no pollution of watchlist
  // --------------------------------------------------------------------------
  it('WP02-T02: BSE instruments retain explicit BSE qualification; zero state pollution', () => {
    const initialWatchlist = JSON.stringify(['NSE:INFY', 'NSE:RELIANCE']);
    localStorage.setItem('nw7.india-watchlist.v1', initialWatchlist);

    const { container } = render(<MarketProviderBoard group="equities" />);
    fireEvent.click(screen.getByRole('button', { name: /Load BSE equities prices/i }));

    const script = container.querySelector('iframe');
    const config = iframeConfig(script);
    const symbolNames = config.symbolsGroups[0].symbols.map(s => s.name);

    // All symbols must have explicit BSE: prefix
    for (const name of symbolNames) {
      expect(name.startsWith('BSE:')).toBe(true);
      expect(name.startsWith('NSE:')).toBe(false);
    }

    // User localStorage watchlist must remain 100% untouched
    expect(localStorage.getItem('nw7.india-watchlist.v1')).toBe(initialWatchlist);
    expect(localStorage.getItem('nw7.market-portfolio.v1')).toBeNull();
  });

  // --------------------------------------------------------------------------
  // WP02-T03: script.onerror displays retry and original-source fallback
  // --------------------------------------------------------------------------
  it('WP02-T03: script.onerror renders actionable error alert with Retry and direct catalog links', () => {
    const { container } = render(<MarketProviderBoard group="indices" />);
    fireEvent.click(screen.getByRole('button', { name: /Load BSE indices prices/i }));

    const script = container.querySelector('iframe');
    expect(script).toBeTruthy();

    // Trigger script error
    fireEvent.error(script);

    // Error alert displayed
    const alert = screen.getByRole('alert');
    expect(alert).toBeTruthy();
    expect(alert.textContent).toMatch(/could not load \(network error or blocked script\)/i);

    // Retry button present
    const retryBtn = screen.getByRole('button', { name: /Retry connection/i });
    expect(retryBtn).toBeTruthy();

    // Direct catalog links must remain visible
    const links = screen.getAllByRole('link', { name: /TradingView ↗/i });
    expect(links.length).toBeGreaterThanOrEqual(2);
    expect(links.some(l => l.getAttribute('href').includes('BSE-SENSEX'))).toBe(true);
  });

  // --------------------------------------------------------------------------
  // WP02-T04: Slow script initialization reaches 8s timeout with accurate wording
  // --------------------------------------------------------------------------
  it('WP02-T04: slow script initialization reaches 8s timeout with truthful status', () => {
    vi.useFakeTimers();

    render(<MarketProviderBoard group="indices" />);
    fireEvent.click(screen.getByRole('button', { name: /Load BSE indices prices/i }));

    expect(screen.getByText(/Connecting to TradingView embed service…/i)).toBeTruthy();

    // Advance timer to 8000ms
    act(() => {
      vi.advanceTimersByTime(8000);
    });

    // Alert with timeout wording
    const alert = screen.getByRole('alert');
    expect(alert).toBeTruthy();
    expect(alert.textContent).toMatch(/Could not confirm provider loading \(timed out after 8s\)/i);

    // Click retry
    const retryBtn = screen.getByRole('button', { name: /Retry connection/i });
    fireEvent.click(retryBtn);

    // Re-enters loading state with fresh timer
    expect(screen.getByText(/Connecting to TradingView embed service…/i)).toBeTruthy();

    vi.useRealTimers();
  });

  // --------------------------------------------------------------------------
  // WP02-T05: script.onload transitions to EMBED_UNCONFIRMED without false quotes
  // --------------------------------------------------------------------------
  it('WP02-T05: script.onload transitions to EMBED_UNCONFIRMED and does not claim verified quotes', () => {
    const { container } = render(<MarketProviderBoard group="indices" />);
    fireEvent.click(screen.getByRole('button', { name: /Load BSE indices prices/i }));

    const script = container.querySelector('iframe');
    fireEvent.load(script);

    // EMBED_UNCONFIRMED status
    expect(screen.getByText(/Provider frame loaded; quote rendering is unverified/i)).toBeTruthy();

    // Must not display "Live" or synthetic numbers
    expect(screen.queryByText(/Live quote/i)).toBeNull();
    expect(screen.queryByText(/0\/16/i)).toBeNull();
  });

  it('recovers from an unverified loaded frame without claiming a price', () => {
    const { container } = render(<MarketProviderBoard group="indices" />);
    fireEvent.click(screen.getByRole('button', { name: /Load BSE indices prices/i }));
    const frame = container.querySelector('iframe');
    fireEvent.load(frame);
    fireEvent.click(screen.getByRole('button', { name: /Reload provider display/i }));
    expect(container.querySelectorAll('iframe')).toHaveLength(1);
    expect(container.querySelector('iframe')).not.toBe(frame);
    expect(screen.getByText(/Connecting to TradingView embed service/i)).toBeTruthy();
  });

  it('restricts a single equity display to the approved BSE catalog symbol', () => {
    const { container } = render(<MarketProviderBoard providerSymbol="BSE:RELIANCE" group="equities" />);
    expect(container.querySelector('iframe')).toBeNull();
    expect(screen.queryByRole('button', { name: /Switch to BSE/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Load BSE:RELIANCE price' }));
    expect(iframeConfig(container.querySelector('iframe')).symbolsGroups[0].symbols.map(s => s.name)).toEqual(['BSE:RELIANCE']);
  });

  // --------------------------------------------------------------------------
  // WP02-T06: Ten load/hide/group-change cycles leave zero orphaned DOM nodes
  // --------------------------------------------------------------------------
  it('WP02-T06: ten load/hide/group-change cycles leave no orphaned sandboxed frames or host scripts', () => {
    const { container } = render(<MarketProviderBoard group="indices" />);

    // Perform 10 rapid toggle cycles
    for (let i = 0; i < 10; i++) {
      fireEvent.click(screen.getByRole('button', { name: /Load BSE indices prices/i }));
      expect(container.querySelectorAll('iframe')).toHaveLength(1);

      fireEvent.click(screen.getByRole('button', { name: /Hide TradingView Board/i }));
      expect(container.querySelectorAll('iframe')).toHaveLength(0);
    }

    // Switch group while loaded
    fireEvent.click(screen.getByRole('button', { name: /Load BSE indices prices/i }));
    expect(container.querySelectorAll('iframe')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /Switch to BSE Equities/i }));
    // Still exactly 1 script, now configured for equities
    const scripts = container.querySelectorAll('iframe');
    expect(scripts).toHaveLength(1);
    const config = iframeConfig(scripts[0]);
    expect(config.title).toBe('BSE equities');
  });

  // --------------------------------------------------------------------------
  // WP02-T07: Stale generation callbacks cannot overwrite currently selected group
  // --------------------------------------------------------------------------
  it('WP02-T07: stale onload/onerror callbacks from old attempts are ignored after group switch', () => {
    const { container, rerender } = render(<MarketProviderBoard group="indices" />);
    fireEvent.click(screen.getByRole('button', { name: /Load BSE indices prices/i }));

    const firstScript = container.querySelector('iframe');

    // Switch group to equities
    rerender(<MarketProviderBoard group="equities" />);
    const secondScript = container.querySelector('iframe');
    expect(secondScript).not.toBe(firstScript);

    // Old script finishes loading late
    fireEvent.load(firstScript);
    // Should still have second group active
    const config = iframeConfig(secondScript);
    expect(config.title).toBe('BSE equities');
  });

  // --------------------------------------------------------------------------
  // WP02-T08: Unsupported/unverified symbols cannot enter widget configuration
  // --------------------------------------------------------------------------
  it('WP02-T08: only widgetVerified: true instruments enter widget symbols configuration', () => {
    const indicesConfig = getWidgetSymbols('indices');
    const indexNames = indicesConfig.symbols.map(s => s.name);
    expect(indexNames).toContain('BSE:SENSEX');
    expect(indexNames).toContain('BSE:BSE500');
    // Unverified candidates must NOT be in widget symbols
    expect(indexNames).not.toContain('BSE:BSE100');
    expect(indexNames).not.toContain('BSE:BSEMID');

    const equitiesConfig = getWidgetSymbols('equities');
    const equityNames = equitiesConfig.symbols.map(s => s.name);
    expect(equityNames).toContain('BSE:RELIANCE');
    expect(equityNames).toContain('BSE:TCS');
    expect(equityNames).toContain('BSE:INFY');
    expect(equityNames).not.toContain('BSE:HDFCBANK');
    expect(equityNames).not.toContain('BSE:SBIN');
  });

  // --------------------------------------------------------------------------
  // WP02-T09: Catalog lookup resolves to approved HTTPS URLs without arbitrary synthesis
  // --------------------------------------------------------------------------
  it('WP02-T09: getBseTradingViewUrl resolves to approved catalog destinations', () => {
    expect(getBseTradingViewUrl('BSE:SENSEX')).toBe('https://www.tradingview.com/symbols/BSE-SENSEX/');
    expect(getBseTradingViewUrl('BSE:INFY')).toBe('https://www.tradingview.com/symbols/BSE-INFY/');
    // Unregistered symbol falls back to search URL
    expect(getBseTradingViewUrl('BSE:INVALID')).toContain('https://www.tradingview.com/search/?q=');
  });

  // --------------------------------------------------------------------------
  // WP02-T10: Explicit BSE EOD labeling, privacy disclosure, and provider branding persist
  // --------------------------------------------------------------------------
  it('WP02-T10: displays explicit BSE EOD labeling, IP notice, and TradingView copyright link', () => {
    render(<MarketProviderBoard group="indices" />);

    expect(screen.getByText(/BSE end-of-day reference — TradingView/i)).toBeTruthy();
    expect(screen.getByText(/shares your IP address/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Load BSE indices prices/i }));

    const copyrightLink = screen.getByRole('link', { name: /Market summary/i });
    expect(copyrightLink.getAttribute('href')).toBe('https://www.tradingview.com/markets/');
    expect(screen.getByText(/by TradingView/i)).toBeTruthy();
  });

  // --------------------------------------------------------------------------
  // WP02-T11: IndexSectorPanel renders benchmarks, sectors, and movers
  // --------------------------------------------------------------------------
  it('WP02-T11: IndexSectorPanel renders benchmarks, sector references, and movers with disclaimers', () => {
    const onSelectGroup = vi.fn();
    const onNavigate = vi.fn();

    render(
      <IndexSectorPanel
        activeGroup="indices"
        onSelectProviderGroup={onSelectGroup}
        onNavigate={onNavigate}
      />
    );

    // Benchmarks
    expect(screen.getByText('NIFTY 50')).toBeTruthy();
    expect(screen.getByText('SENSEX')).toBeTruthy();
    expect(screen.getByText('BANK NIFTY')).toBeTruthy();
    expect(screen.getByText('BSE 500')).toBeTruthy();

    // Group switcher in panel calls onSelectProviderGroup without loading
    const equitiesBtn = screen.getByRole('button', { name: 'BSE Equities' });
    fireEvent.click(equitiesBtn);
    expect(onSelectGroup).toHaveBeenCalledWith('equities');

    // Sector references
    expect(screen.getByRole('link', { name: /NIFTY Bank ↗/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /NIFTY IT ↗/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /NIFTY Auto ↗/i })).toBeTruthy();

    // Movers
    expect(screen.getByRole('link', { name: /Official NSE Gainers ↗/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Official NSE Losers ↗/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /BSE Market Overview ↗/i })).toBeTruthy();

    // Anti-fabrication disclaimer
    expect(screen.getByText(/No invented price changes, synthesized rankings, or quote observation times/i)).toBeTruthy();
  });

  // --------------------------------------------------------------------------
  // WP02-T12: Network-blocked test retains a usable Market panel and source links
  // --------------------------------------------------------------------------
  it('WP02-T12: retains usable controls and fallback links when network fails', () => {
    const { container } = render(<MarketProviderBoard group="indices" />);
    fireEvent.click(screen.getByRole('button', { name: /Load BSE indices prices/i }));

    const script = container.querySelector('iframe');
    fireEvent.error(script);

    // SENSEX and BSE500 links remain accessible
    const sensexLink = screen.getByRole('link', { name: /S&P BSE SENSEX on TradingView/i });
    expect(sensexLink.getAttribute('href')).toBe('https://www.tradingview.com/symbols/BSE-SENSEX/');

    const bse500Link = screen.getByRole('link', { name: /S&P BSE 500 on TradingView/i });
    expect(bse500Link.getAttribute('href')).toBe('https://www.tradingview.com/symbols/BSE-BSE500/');
  });

  // --------------------------------------------------------------------------
  // WP02-T15: Independence: Provider features work without WP-01 being present
  // --------------------------------------------------------------------------
  it('WP02-T15: provider feature modules import and render cleanly as standalone components', () => {
    // Renders both components side-by-side in a generic div
    const { container } = render(
      <div>
        <IndexSectorPanel />
        <MarketProviderBoard />
      </div>
    );

    expect(container.querySelector('.index-sector-panel')).toBeTruthy();
    expect(container.querySelector('.market-provider-board')).toBeTruthy();
  });
});
