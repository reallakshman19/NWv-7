// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMarketPageViewModel } from '../viewModels/useMarketPageViewModel.js';
import MarketPage from './MarketPage';

vi.mock('../viewModels/useMarketPageViewModel.js', () => ({ useMarketPageViewModel: vi.fn() }));
vi.mock('../components/market/MarketWorkspaceTools.jsx', () => ({
  EquityWorkspace: ({ data }) => <div>Equity ready · {data.equities?.length || 0} quotes</div>,
  FundsWorkspace: () => <div>Funds ready without India quotes</div>,
  CurrencyWorkspace: () => <div>Currency ready without India quotes</div>,
}));
const now = Date.now();
const quoteAt = new Date(now - 3 * 60000).toISOString();
const published = now - 60000;
const india = { name:'NIFTY 50', symbol:'^NSEI', value:'25000', quoteAt, change:'10', changePercent:'0.04', source:'Daily close' };
const global = { name:'S&P 500', symbol:'^GSPC', value:'6000', quoteAt, change:'-2', changePercent:'-0.03', source:'Daily close' };

function setMarket({ indices = [india], globalIndices = [global], sectorals = [], sourceMode = 'snapshot', loading = false, marketSettings = {} } = {}) {
  const marketData = { indices, globalIndices, sectorals, sourceMode, fetchedAt:published, sourceHealth:{indices:{status:sourceMode}} };
  const refreshMarket = vi.fn().mockResolvedValue({ok:true});
  useMarketPageViewModel.mockReturnValue({marketData, rawMarketData: marketData, marketSettings, sourceHealth:marketData.sourceHealth, sessionState:{label:'After hours'},loading, error:null,refreshMarket});
  return refreshMarket;
}
beforeEach(() => { window.location.hash = '#/markets'; window.localStorage.clear(); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Market four-workspace shell', () => {
  it('renders only the active workspace, and changes URL for Back/reload', () => {
    setMarket(); render(<MarketPage />);
    expect(screen.getByRole('heading',{name:'Indices'})).toBeTruthy();
    expect(screen.queryByText('Funds ready without India quotes')).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Funds'}));
    expect(window.location.hash).toBe('#/markets?view=funds');
    expect(screen.getByText('Funds ready without India quotes')).toBeTruthy();
    window.location.hash = '#/markets?view=currency';
    fireEvent(window, new Event('hashchange'));
    expect(screen.getByText('Currency ready without India quotes')).toBeTruthy();
  });

  it('supports Global index observations when India has no qualified rows', () => {
    setMarket({indices:[{name:'NIFTY 50',symbol:'^NSEI',value:30000,quoteAt:null}],globalIndices:[global]});
    render(<MarketPage />);
    expect(screen.getByText(/No qualified India index observations/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Market region'), {target:{value:'global'}});
    expect(screen.getByText('S&P 500')).toBeTruthy();
    expect(screen.getByText('6,000')).toBeTruthy();
    expect(screen.queryByText('30,000')).toBeNull();
  });

  it('deduplicates the same BANK NIFTY in indices and sectorals', () => {
    const bank={name:'BANK NIFTY',symbol:'^NSEBANK',value:'52000',quoteAt,change:'0'};
    setMarket({indices:[india,bank],sectorals:[bank]}); render(<MarketPage />);
    expect(screen.getAllByText('BANK NIFTY')).toHaveLength(1);
    expect(screen.getByText(/1 up · 0 down · 1 flat/)).toBeTruthy();
  });

  it('never promotes seed prices or a missing quote timestamp', () => {
    setMarket({indices:[{...india,sourceMode:'seed',value:99999},{name:'SENSEX',symbol:'^BSESN',value:82000}]});
    render(<MarketPage />);
    expect(screen.queryByText('99,999')).toBeNull();
    expect(screen.queryByText('82,000')).toBeNull();
    expect(screen.getByText(/No qualified India index observations/)).toBeTruthy();
  });

  it('shows the shell during Market boot and Funds/Currency remain usable', () => {
    setMarket({indices:[],globalIndices:[],loading:true}); render(<MarketPage />);
    expect(screen.getByRole('heading',{name:'Markets'})).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Funds'}));
    expect(screen.getByText('Funds ready without India quotes')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Currency'}));
    expect(screen.getByText('Currency ready without India quotes')).toBeTruthy();
  });

  it('keeps source publication timestamp separate from the quote timestamp', () => {
    setMarket();render(<MarketPage />);
    expect(screen.getByText(/Publication:/)).toBeTruthy();
    expect(screen.getByText(/Quote as of/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Data status'}));
    const details=within(document.getElementById('market-data-status-details'));
    expect(details.getByText(/Publication time does not change the quote time/)).toBeTruthy();
    expect(screen.queryByText(/^Official$/)).toBeNull();
  });

  it('disables only the quote refresh button while loading', () => {
    const refresh=setMarket({loading:true});render(<MarketPage />);
    const refreshButton=screen.getByRole('button',{name:'Refresh indices'});
    expect(refreshButton.disabled).toBe(true);
    fireEvent.click(refreshButton);
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByRole('button',{name:'Currency'}).disabled).toBe(false);
  });
});
