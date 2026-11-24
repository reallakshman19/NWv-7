// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EquityResearchPanel } from './EquityResearchPanel.jsx';
import { createWatchlistStore } from './watchlistStore.js';
import { resolveNseResearchKey, searchTrackedEquities, selectEquityResearch } from './equityResearchResolution.js';
import { selectMarketBreadth, selectSectorResearch } from '../indices/sectorResearchResolution.js';
import { IndexSectorPanel } from '../providers/IndexSectorPanel.jsx';

afterEach(cleanup);

describe('MP05 equity and sector qualification', () => {
  it('searches curated symbols and names without a network lookup', () => {
    expect(searchTrackedEquities('Infosys').map(row => row.key)).toEqual(['NSE:INFY']);
    expect(searchTrackedEquities('nse:infy').map(row => row.key)).toEqual(['NSE:INFY']);
    expect(searchTrackedEquities('infy.ns').map(row => row.key)).toEqual(['NSE:INFY']);
    expect(searchTrackedEquities('')).toHaveLength(16);
    expect(searchTrackedEquities('BSE:INFY')).toEqual([]);
    expect(searchTrackedEquities('not-a-listed-fixture')).toEqual([]);
  });
  it.each([null,42,'NSE:','NSE:<img>','NSE:INFY:OTHER','BSE:INFY','INDEX:NSE:NIFTY50','NSE:=1','NSE:-TEST'])('rejects invalid identity %j', input => {
    expect(resolveNseResearchKey(input)).toBeNull();
  });
  it('separates curated metadata, custom listing uncertainty and native quote restrictions', () => {
    expect(selectEquityResearch('NSE:INFY')).toMatchObject({instrumentId:'EQUITY:NSE:INFY',listingStatus:'CURATED_METADATA',state:'SOURCE_RESTRICTED',observation:null});
    expect(selectEquityResearch('NSE:XYZTEST')).toMatchObject({displayName:null,listingStatus:'UNVERIFIED_LISTING',observation:null});
    expect(selectEquityResearch('BSE:INFY')).toBeNull();
  });
  it('rejects malformed canonical watchlist mutations and normalizes duplicates', () => {
    const storage = {getItem:vi.fn(() => null),setItem:vi.fn()};
    const store = createWatchlistStore({storage});
    expect(store.addKey('NSE:INFY').ok).toBe(true);
    const calls = storage.setItem.mock.calls.length;
    expect(store.addKey('nse:infy').ok).toBe(false);
    expect(store.addKey(null).ok).toBe(false);
    expect(store.addKey('NSE:<img>').ok).toBe(false);
    expect(store.mergeKeys(['NSE:INFY:BAD','BSE:INFY',null]).ok).toBe(false);
    expect(storage.setItem).toHaveBeenCalledTimes(calls);
    expect(store.getState().keys).toEqual(['NSE:INFY']);
  });
  it('preserves saved keys during local search and absent quotes', () => {
    const store = createWatchlistStore({storage:null});
    store.addKey('NSE:INFY');
    const { container } = render(<EquityResearchPanel store={store} />);
    const search = screen.getByLabelText('Search tracked shares by name or symbol');
    fireEvent.change(search,{target:{value:'Tata Consultancy'}});
    const cards = container.querySelectorAll('.market-equity-universe-card');
    expect(cards).toHaveLength(1);
    expect(cards[0].textContent).toContain('TCS');
    expect(store.getState().keys).toEqual(['NSE:INFY']);
    expect(screen.getByText(/Native quote unavailable/)).toBeTruthy();
    fireEvent.change(search,{target:{value:'BSE:TCS'}});
    expect(screen.getByText(/No matching tracked shares/)).toBeTruthy();
    expect(store.getState().keys).toEqual(['NSE:INFY']);
  });
  it('projects descriptive sector membership without claiming constituents or change', () => {
    const result = selectSectorResearch('it');
    expect(result).toMatchObject({instrumentId:'INDEX:NSE:NIFTYIT',scope:'DESCRIPTIVE_TRACKED_METADATA',state:'SOURCE_RESTRICTED',observation:null,changePercent:null});
    expect(result.trackedSymbols).toContain('NSE:INFY');
    expect(selectSectorResearch('unknown')).toBeNull();
  });
  it('cannot manufacture exchange breadth from partial tracked quotes or synthetic counts', () => {
    const result = selectMarketBreadth({advances:16,declines:0,total:16,providerAsOf:'2026-11-24'});
    expect(result).toEqual({state:'UNAVAILABLE',scope:'EXCHANGE_WIDE',reasonCode:'NO_QUALIFIED_BREADTH_DATASET',providerAsOf:null,advances:null,declines:null,unchanged:null,total:null});
    render(<IndexSectorPanel />);
    expect(screen.getByText(/Market breadth unavailable/)).toBeTruthy();
  });
});
