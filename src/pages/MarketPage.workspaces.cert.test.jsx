// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EquityWorkspace, FundsWorkspace, CurrencyWorkspace } from '../components/market/MarketWorkspaceTools.jsx';
import * as sources from '../services/indiaMarketTools.js';

vi.mock('../services/indiaMarketTools.js', async importOriginal => {
  const original = await importOriginal();
  return { ...original, searchIndianFunds:vi.fn(),loadFundNav:vi.fn(),loadOmrRate:vi.fn() };
});
const at = new Date(Date.now()-60000).toISOString();
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

  it('ignores an older NAV response after the user selects another scheme',async()=>{
    const pending={};
    sources.loadFundNav.mockImplementation(code=>new Promise(resolve=>{pending[code]=resolve;}));
    render(<FundsWorkspace data={{mutualFunds:[]}} />);
    // Saved codes are loaded on explicit selection; never during Market boot.
    localStorage.setItem('nw7.market-saved-funds.v1',JSON.stringify(['100001','100002']));
    cleanup();render(<FundsWorkspace data={{mutualFunds:[]}} />);
    fireEvent.click(screen.getAllByRole('button',{name:'Load NAV'})[0]);
    fireEvent.click(screen.getAllByRole('button',{name:'Load NAV'})[1]);
    pending['100002']({code:'100002',name:'Fund B',nav:125,date:'18-Nov-2026'});
    await screen.findByText('Fund B');
    pending['100001']({code:'100001',name:'Fund A',nav:500,date:'18-Nov-2026'});
    expect(screen.queryByText('Fund A')).toBeNull();
  });

  it('fetches currency only when the Currency workspace mounts; typing and swap remain offline',async()=>{
    sources.loadOmrRate.mockResolvedValue({rate:245.123456,asOf:Date.now()-86400000,stale:false});
    render(<CurrencyWorkspace />);
    expect(sources.loadOmrRate).toHaveBeenCalledTimes(1);
    await screen.findByText(/1 OMR =/);
    fireEvent.change(screen.getByLabelText('Amount'),{target:{value:'10'}});
    fireEvent.click(screen.getByRole('button',{name:'Swap pair'}));
    expect(sources.loadOmrRate).toHaveBeenCalledTimes(1);
  });
});
