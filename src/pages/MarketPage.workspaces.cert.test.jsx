// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EquityWorkspace, FundsWorkspace, CurrencyWorkspace } from '../components/market/MarketWorkspaceTools.jsx';
import * as sources from '../services/indiaMarketTools.js';

vi.mock('../services/indiaMarketTools.js', async importOriginal => {
  const original = await importOriginal();
  return { ...original, searchIndianFunds:vi.fn(),loadFundNav:vi.fn(),loadOmrRate:vi.fn() };
});
const at = new Date(Date.now()-60000).toISOString();
const recentNavDate = new Date(Date.now()-86400000).toLocaleDateString('en-GB', {timeZone:'Asia/Kolkata'}).replaceAll('/', '-');
const share=(symbol,value) => ({id:`equity:NSE:${symbol}`,symbol,name:symbol,value,quoteAt:at,exchange:'NSE',currency:'INR',sourceProvider:'Yahoo Finance',sourceAuthority:'third-party',cadence:'daily',changePercent:2});
beforeEach(()=>{window.localStorage.clear();vi.clearAllMocks();});
afterEach(cleanup);

describe('Market workflow independence',()=>{
  it('keeps covered and uncovered watchlist entries without synthesizing prices',()=>{
    const data={equities:[share('INFY',1000)],equityCoverage:{sourceAcquiredCount:1,retainedCount:0}};
    render(<EquityWorkspace data={data} onRefresh={()=>{}} />);
    fireEvent.change(screen.getByPlaceholderText('INFY'),{target:{value:'INFY'}});
    fireEvent.click(screen.getByRole('button',{name:'Save symbol'}));
    expect(screen.getByText(/₹1,000/)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('INFY'),{target:{value:'UNLISTED'}});
    fireEvent.click(screen.getByRole('button',{name:'Save symbol'}));
    expect(screen.getByText(/Outside the free tracked quote universe/)).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('nw7.india-watchlist.v1'))).toEqual(['INFY','UNLISTED']);
  });

  it('does not request fund data when the workspace is initially rendered',()=>{
    render(<FundsWorkspace data={{mutualFunds:[]}} />);
    expect(sources.searchIndianFunds).not.toHaveBeenCalled();
    expect(sources.loadFundNav).not.toHaveBeenCalled();
    expect(screen.getByText(/No saved funds/)).toBeTruthy();
  });

  it('ignores an older selected NAV completion while retaining each saved fund result', async () => {
    const pending = {};
    localStorage.setItem('nw7.market-saved-funds.v1', JSON.stringify(['100001', '100002']));
    sources.loadFundNav.mockImplementation(code => new Promise(resolve => { pending[code] = resolve; }));
    render(<FundsWorkspace data={{mutualFunds:[]}} />);
    const first = screen.getByText('Scheme 100001').closest('li');
    const second = screen.getByText('Scheme 100002').closest('li');
    fireEvent.click(within(first).getByRole('button', {name:'View NAV'}));
    fireEvent.click(within(second).getByRole('button', {name:'View NAV'}));
    await waitFor(() => expect(pending['100002']).toBeTypeOf('function'));
    await act(async () => pending['100002']({code:'100002',name:'Fund B',nav:125,date:recentNavDate}));
    await waitFor(() => expect(document.querySelector('div.market-workspace__nested > strong')?.textContent).toBe('Fund B'));
    await act(async () => pending['100001']({code:'100001',name:'Fund A',nav:500,date:recentNavDate}));
    // Fund A may appear in its saved list row; it must NOT replace selected Fund B.
    await waitFor(() => expect(document.querySelector('div.market-workspace__nested > strong')?.textContent).toBe('Fund B'));
  });

  it('fetches currency only when the Currency workspace mounts; typing and swap remain offline',async()=>{
    sources.loadOmrRate.mockResolvedValue({rate:245.123456,asOf:Date.now()-86400000,stale:false});
    render(<CurrencyWorkspace />);
    const attribution = screen.getByRole('link', { name: 'Frankfurter — open-source FX reference' });
    expect(attribution.getAttribute('href')).toBe(sources.INDIA_MARKET_SOURCES.fx);
    expect(sources.loadOmrRate).toHaveBeenCalledTimes(1);
    await screen.findByText(/1 OMR =/);
    fireEvent.change(screen.getByLabelText('Amount'),{target:{value:'10'}});
    fireEvent.click(screen.getByRole('button',{name:'Swap pair'}));
    expect(sources.loadOmrRate).toHaveBeenCalledTimes(1);
  });

  it('removes a previously displayed rate when a later acquisition has no usable fallback', async () => {
    sources.loadOmrRate
      .mockResolvedValueOnce({rate:245.12,asOf:Date.now()-86400000,stale:false})
      .mockRejectedValueOnce(new Error('No recent rate available'));
    const { rerender } = render(<CurrencyWorkspace />);
    await screen.findByText(/1 OMR =/);

    // The component can stay mounted while the user hides and re-enables Currency.
    rerender(<CurrencyWorkspace settings={{showCurrency:false}} />);
    rerender(<CurrencyWorkspace settings={{showCurrency:true}} />);
    await screen.findByRole('alert');
    expect(screen.getByText('No recent rate available')).toBeTruthy();
    expect(screen.getByText('Result unavailable')).toBeTruthy();
    expect(screen.queryByText(/1 OMR =/)).toBeNull();
  });

  it('ages an open reference rate into stale and then unavailable without another request', async () => {
    vi.useFakeTimers();
    try {
      const start = Date.UTC(2026, 10, 20, 0);
      vi.setSystemTime(start);
      sources.loadOmrRate.mockResolvedValue({rate:245.12,asOf:start,stale:false});
      render(<CurrencyWorkspace />);
      await act(async () => {});
      expect(screen.getByText(/Daily reference · Reference date/)).toBeTruthy();
      await act(async () => { await vi.advanceTimersByTimeAsync(36 * 3600000 + 1); });
      expect(screen.getByText(/Stale reference · Reference date/)).toBeTruthy();
      await act(async () => { await vi.advanceTimersByTimeAsync(36 * 3600000); });
      expect(screen.queryByText(/1 OMR =/)).toBeNull();
      expect(screen.getByText('Result unavailable')).toBeTruthy();
      expect(screen.getByRole('alert').textContent).toMatch(/reference rate has expired/i);
      expect(sources.loadOmrRate).toHaveBeenCalledTimes(1);
    } finally {
      cleanup();
      vi.useRealTimers();
    }
  });

  it('checks expiry on focus after a suspended tab wakes', async () => {
    vi.useFakeTimers();
    try {
      const start = Date.UTC(2026, 10, 20, 0);
      vi.setSystemTime(start);
      sources.loadOmrRate.mockResolvedValue({rate:245.12,asOf:start,stale:false});
      render(<CurrencyWorkspace />);
      await act(async () => {});
      vi.setSystemTime(start + 3 * 86400000 + 1);
      fireEvent.focus(window);
      expect(screen.queryByText(/1 OMR =/)).toBeNull();
      expect(screen.getByText('Result unavailable')).toBeTruthy();
    } finally {
      cleanup();
      vi.useRealTimers();
    }
  });

  it('clears an expiry error if a refresh that was in flight succeeds', async () => {
    vi.useFakeTimers();
    try {
      const start = Date.UTC(2026, 10, 20, 0);
      vi.setSystemTime(start);
      let finishRefresh;
      sources.loadOmrRate
        .mockResolvedValueOnce({rate:245.12,asOf:start,stale:false})
        .mockImplementationOnce(() => new Promise(resolve => { finishRefresh = resolve; }));
      const { rerender } = render(<CurrencyWorkspace />);
      await act(async () => {});
      rerender(<CurrencyWorkspace settings={{showCurrency:false}} />);
      rerender(<CurrencyWorkspace settings={{showCurrency:true}} />);
      vi.setSystemTime(start + 3 * 86400000 + 1);
      fireEvent.focus(window);
      expect(screen.getByRole('alert').textContent).toMatch(/expired/i);
      await act(async () => finishRefresh({rate:246,asOf:Date.now(),stale:false}));
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.getByText(/1 OMR = 246/)).toBeTruthy();
    } finally {
      cleanup();
      vi.useRealTimers();
    }
  });
});


describe('Saved NAV loading and independent user tasks', () => {
  it('loads saved NAVs with at most three in flight, retaining a failed scheme', async () => {
    const codes = Array.from({length: 6}, (_, n) => String(100001 + n));
    localStorage.setItem('nw7.market-saved-funds.v1', JSON.stringify(codes));
    const pending = [];
    sources.loadFundNav.mockImplementation(code => new Promise((resolve, reject) => pending.push({ code, resolve, reject })));
    render(<FundsWorkspace data={{mutualFunds:[]}} />);
    await waitFor(() => expect(sources.loadFundNav).toHaveBeenCalledTimes(3));
    expect(pending.length).toBe(3);
    pending[0].resolve({code: pending[0].code, name:'Fund A', nav:123.45,date:recentNavDate});
    pending[1].reject(new Error('Provider unavailable'));
    pending[2].resolve({code: pending[2].code, name:'Fund C', nav:111.45,date:recentNavDate});
    await waitFor(() => expect(sources.loadFundNav).toHaveBeenCalledTimes(6));
    pending.slice(3).forEach(item => item.resolve({code:item.code,name:'Fund ' + item.code,nav:200,date:recentNavDate}));
    await screen.findByText(/Other schemes remain available/);
    expect(screen.getByText(/Fund A/)).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('nw7.market-saved-funds.v1'))).toEqual(codes);
  });

  it('keeps searches and selected NAV requests separate', async () => {
    localStorage.setItem('nw7.market-saved-funds.v1',JSON.stringify([]));
    const searchPending={};
    const navPending={};
    sources.searchIndianFunds.mockImplementation(() => new Promise(resolve => searchPending.resolve=resolve));
    sources.loadFundNav.mockImplementation(code => new Promise(resolve => navPending[code]=resolve));
    render(<FundsWorkspace data={{mutualFunds:[]}} />);
    fireEvent.click(screen.getByRole('button',{name:'Find a fund'}));
    fireEvent.change(screen.getByPlaceholderText('Nifty 50 Direct Growth'),{target:{value:'Nifty 50'}});
    fireEvent.click(screen.getByRole('button',{name:'Search funds'}));
    searchPending.resolve([{schemeCode:100001,schemeName:'Index Direct Growth'}]);
    await screen.findByText('Index Direct Growth');
    fireEvent.click(screen.getByRole('button',{name:'View NAV'}));
    // The search controls are still usable while one NAV request is pending.
    expect(screen.getByRole('button',{name:'Search funds'}).disabled).toBe(false);
    await waitFor(() => expect(navPending[100001]).toBeTypeOf('function'));
    navPending[100001]({code:'100001',name:'Index Direct Growth',nav:101,date:recentNavDate});
    await screen.findByText(/NAV ₹101/);
  });

  it('preserves duplicate-free scheme codes and existing saved storage', async () => {
    localStorage.setItem('nw7.market-saved-funds.v1', JSON.stringify(['100001','100001','100002','invalid']));
    sources.loadFundNav.mockResolvedValue({code:'100001',name:'Fund',nav:101,date:recentNavDate});
    render(<FundsWorkspace data={{mutualFunds:[]}} />);
    expect(screen.getAllByRole('button',{name:'Remove'})).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button',{name:'Remove'})[0]);
    expect(JSON.parse(localStorage.getItem('nw7.market-saved-funds.v1'))).toEqual(['100002']);
  });
});


describe('IPO source evidence is separate from empty or cached schedules', () => {
  const fresh = () => new Date(Date.now()-60_000).toISOString();
  const due = days => new Date(Date.now()+days*86400000).toISOString().slice(0,10);
  const issue = () => ({ name:'Fixture Verified Issue', openDate:due(-1), closeDate:due(5) });
  const calendar = (status, rows=[]) => ({
    equities:[], sourceMode:'snapshot', generatedAt:fresh(), ipoLastCheckedAt:fresh(),
    ipo:{ live:rows, upcoming:[],recent:[] }, sourceHealth:{ ipo:{status,provider:'BSE'} }
  });
  const open = data => {
    render(<EquityWorkspace data={data} onRefresh={()=>{}} />);
    fireEvent.click(screen.getByRole('button',{name:'IPO / FPO'}));
    return document.querySelector('.market-workspace__ipo-evidence');
  };
  it('reports BSE 403 failure as unavailable, not no active IPOs',()=>{
    const panel=open(calendar('failed'));
    expect(panel.dataset.ipoState).toBe('unavailable');
    expect(within(panel).getByText(/source unavailable/i)).toBeTruthy();
    expect(within(panel).getByRole('link',{name:/Verify current public issues/})).toBeTruthy();
    expect(within(panel).getByRole('link',{name:/BSE public issues/}).getAttribute('href')).toContain('bseindia.com/markets/PublicIssues/IPOIssues_new.aspx');
    expect(panel.textContent).not.toMatch(/no qualifying current ipo/i);
  });
  it('does not display old issue rows after an unsuccessful refresh',()=>{
    const panel=open(calendar('failed',[issue()]));
    expect(panel.dataset.ipoState).toBe('unavailable');
    expect(panel.textContent).not.toContain('Fixture Verified Issue');
  });
  it('uses verified-empty only with explicit fresh source-empty receipt',()=>{
    const panel=open(calendar('empty'));
    expect(panel.dataset.ipoState).toBe('verified-empty');
    expect(panel.textContent).toMatch(/no qualifying current ipo/i);
  });
  it('renders dated issues only with fresh successful receipt',()=>{
    const panel=open(calendar('snapshot',[issue()]));
    expect(panel.dataset.ipoState).toBe('available');
    expect(within(panel).getByText('Fixture Verified Issue')).toBeTruthy();
  });
  it('source receipt omitted in a newly dated publication is unverified',()=>{
    const data=calendar('empty');delete data.sourceHealth.ipo;
    const panel=open(data);
    expect(panel.dataset.ipoState).toBe('unverified');
    expect(panel.textContent).toMatch(/not.*confirm/i);
  });
});
