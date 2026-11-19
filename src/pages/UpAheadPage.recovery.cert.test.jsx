// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import fixture from '../services/fixtures/upAheadRecovery.json';
import { sanitizeUpAheadData } from '../services/upAheadService.js';
import UpAheadPage from './UpAheadPage.jsx';

const mocks = vi.hoisted(() => ({ load: vi.fn(), addItem: vi.fn(),
  settings: { upAhead: { locations: ['Chennai', 'Muscat'] } } }));
vi.mock('../context/SettingsContext', () => ({ useSettings: () => ({ settings: mocks.settings }) }));
vi.mock('../hooks/useWatchlist', () => ({ useWatchlist: () => ({ toggleWatchlist: vi.fn(), isWatched: () => false }) }));
vi.mock('../hooks/usePullToRefresh', () => ({ usePullToRefresh: () => ({ pullDistance: 0 }) }));
vi.mock('../hooks/useUpAheadExpiry', () => ({ useUpAheadExpiry: () => {} }));
vi.mock('../viewModels/useShellRuntimeProps', () => ({ useShellRuntimeProps: () => ({}) }));
vi.mock('../components/Header', () => ({ default: () => <header>Up Ahead</header>, DataStatePill: ({ label }) => <span>{label}</span> }));
vi.mock('../components/ImageCard', () => ({ ImageCard: ({ article }) => <article>{article.title}</article> }));
vi.mock('../data/datasets/upAheadDataset', () => ({ load: mocks.load }));
vi.mock('../utils/plannerStorage', async original => ({ ...await original(), default: {
  getPlan: () => ({}), getBlacklist: () => new Set(), addItem: mocks.addItem,
} }));

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(Date, 'now').mockReturnValue(fixture.fetchedAt);
  vi.spyOn(window, 'alert').mockImplementation(() => {});
  mocks.addItem.mockReturnValue({ ok: true });
  mocks.load.mockResolvedValue({ ok: true, freshness: 'fresh', data: {
    raw: sanitizeUpAheadData(fixture), sourceMode: 'snapshot', acquisitionSummary: {
      status: 'success', byCategory: {},
    },
  } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
const open = () => render(<MemoryRouter><UpAheadPage /></MemoryRouter>);

describe('Actual Up Ahead page recovery wiring', () => {
  it('renders all seven tabs from dated source data and counts every alert', async () => {
    open();
    await screen.findByRole('button', { name: /Suggested/ });
    for (const name of [/Offers/, /Release/, /Events/, /Alerts/, /Holidays/, /Civics/]) {
      fireEvent.click(screen.getByRole('button', { name }));
      expect(screen.queryByText(/coverage cannot be verified/i)).toBeNull();
    }
    expect(screen.getByRole('button', { name: /Alerts/ }).textContent).toContain('3');
    fireEvent.click(screen.getByRole('button', { name: /Force Refresh/ }));
    await waitFor(() => expect(mocks.load).toHaveBeenLastCalledWith(expect.objectContaining({ forceRefresh: true })));
  });

  it('renders provider failure as unavailable, with the actual error', async () => {
    mocks.load.mockResolvedValueOnce({ ok: false, freshness: 'empty', error: 'Publisher snapshot unavailable',
      data: { raw: null, sourceMode: 'snapshot' } });
    open();
    await screen.findByText('Up Ahead unavailable');
    expect(screen.getByText('Publisher snapshot unavailable')).toBeTruthy();
    expect(screen.queryByText('No upcoming events found.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Alerts/ }));
    expect(screen.getByLabelText('Local source coverage').textContent).toContain('Chennai: coverage unverified');
    expect(screen.getByLabelText('Local source coverage').textContent).toContain('Muscat: coverage unverified');
  });

  it('keeps retained cards with a visible stale warning and safely resets saved-button feedback', async () => {
    mocks.load.mockResolvedValueOnce({ ok: true, freshness: 'stale', error: 'Showing retained active items only.',
      data: { raw: sanitizeUpAheadData(fixture), sourceMode: 'snapshot' } });
    open();
    await screen.findByText('Showing retained active items only.');
    expect(screen.getByText(/^Limited/)).toBeTruthy();
    vi.useFakeTimers();
    const button = screen.getAllByRole('button', { name: '+ Plan' })[0];
    fireEvent.click(button);
    expect(button.textContent).toBe('✅ Saved');
    act(() => vi.advanceTimersByTime(2000));
    expect(button.textContent).toBe('+ Plan');
    expect(mocks.addItem).toHaveBeenCalled();
    expect(mocks.addItem.mock.calls.at(-1)[1].sourceMode).toBe('snapshot');
  });
});
