// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import IndiaMarketTools, { NewFundOffers } from './IndiaMarketTools.jsx';

afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('India market tool interactions', () => {
  it('saves a validated equity shortcut locally and removes it', () => {
    render(<IndiaMarketTools showCurrency={false} showMutualFunds={false} />);
    fireEvent.change(screen.getByLabelText('NSE symbol'), { target: { value: 'M&M' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save symbol' }));
    expect(screen.getByRole('link', { name: 'M&M ↗' }).getAttribute('href')).toContain('symbol=M%26M');
    expect(JSON.parse(localStorage.getItem('nw7.india-watchlist.v1'))).toEqual(['M&M']);
    fireEvent.click(screen.getByRole('button', { name: 'Remove M&M' }));
    expect(screen.queryByRole('link', { name: 'M&M ↗' })).toBeNull();
  });
  it('displays actual selected fund NAV and date after explicit search', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => [{ schemeCode: 125497, schemeName: 'Fixture fund direct' }] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'SUCCESS', meta: { scheme_name: 'Fixture fund direct' }, data: [{ nav: '123.45', date: '13-11-2026' }] }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<IndiaMarketTools showCurrency={false} />);
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Scheme name'), { target: { value: 'Fixture' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await screen.findByRole('option', { name: 'Fixture fund direct' });
    fireEvent.change(screen.getByLabelText('Choose mutual fund scheme'), { target: { value: '125497' } });
    await waitFor(() => expect(screen.getByText(/NAV ₹123.45/).textContent).toContain('13-11-2026'));
  });
  it('keeps NFO discovery visible when the provider has no verified schedule', () => {
    render(<NewFundOffers />);
    expect(screen.getByText(/No verified current NFO/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'AMFI new fund offers ↗' }).getAttribute('href')).toContain('amfiindia.com');
  });
  it('renders an open dated NFO and never reintroduces expired rows', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-16T12:00:00Z'));
    render(<NewFundOffers rows={[
      { name: 'Current fixture', openDate: '2026-11-10', closeDate: '2026-11-20' },
      { name: 'Expired fixture', openDate: '2026-07-01', closeDate: '2026-07-10' },
    ]} />);
    expect(screen.getByText('Current fixture')).toBeTruthy();
    expect(screen.queryByText('Expired fixture')).toBeNull();
  });
});
