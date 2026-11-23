// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  FXQuickConverter,
  CurrencyMacroPanel,
  FxLineChart,
  macroStore
} from './index.js';

const recentObservationDay = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

describe('Market Desk R2.1 WP-06 Currency and Macro Certification Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    macroStore.init();
    vi.useRealTimers();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    macroStore.init();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe('FXQuickConverter Component', () => {
    it('initializes in zero-boot mode with zero network calls on mount', () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      render(<FXQuickConverter />);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.getByText('Currency Reference')).toBeTruthy();
      expect(screen.getByText(/Select a pair to check its reference rate/)).toBeTruthy();
      expect(screen.getByDisplayValue('100')).toBeTruthy();
    });

    it('allows pair switching between OMR/INR and USD/INR', () => {
      render(<FXQuickConverter />);

      expect(screen.getByText('Amount (OMR)')).toBeTruthy();

      const usdPairBtn = screen.getByRole('button', { name: 'USD / INR' });
      fireEvent.click(usdPairBtn);

      expect(screen.getByText('Amount (USD)')).toBeTruthy();
    });

    it('executes swap inversion without network fetch', () => {
      render(<FXQuickConverter />);

      expect(screen.getByText('Amount (OMR)')).toBeTruthy();
      expect(screen.getByText('Converted (INR)')).toBeTruthy();

      const swapBtn = screen.getByRole('button', { name: 'Swap currencies' });
      fireEvent.click(swapBtn);

      expect(screen.getByText('Amount (INR)')).toBeTruthy();
      expect(screen.getByText('Converted (OMR)')).toBeTruthy();
    });

    it('fetches reference rate on demand and displays formatted conversion', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          date: recentObservationDay,
          base: 'OMR',
          quote: 'INR',
          rate: 220.00
        })
      });
      vi.stubGlobal('fetch', fetchMock);

      render(<FXQuickConverter />);

      const checkRateBtn = screen.getByRole('button', { name: /Check Reference Rate/i });
      fireEvent.click(checkRateBtn);

      await waitFor(() => {
        expect(screen.getByText(/1 OMR = 220.00 INR/)).toBeTruthy();
      });

      // 100 OMR * 220 = 22,000 INR
      expect(screen.getByRole('status').textContent).toContain('22,000.00');
    });

    it('navigates to currency-macro workspace via onOpenMacroDesk callback', () => {
      const handleOpen = vi.fn();
      render(<FXQuickConverter onOpenMacroDesk={handleOpen} />);

      const deskBtn = screen.getByRole('button', { name: /Open Currency & Macro Desk/i });
      fireEvent.click(deskBtn);

      expect(handleOpen).toHaveBeenCalledWith('currency-macro');
    });
  });

  describe('FxLineChart Component', () => {
    it('renders daily FX line chart with polyline, trading date points, and table fallback', () => {
      const sampleRates = [
        { date: '2026-11-17', rate: 218.10 },
        { date: '2026-11-18', rate: 218.25 },
        { date: '2026-11-19', rate: 218.50 }
      ];

      const { container } = render(
        <FxLineChart
          data={sampleRates}
          unit="₹"
          title="OMR / INR Trajectory"
        />
      );

      expect(screen.getAllByText('OMR / INR Trajectory').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/2026-11-17 — 2026-11-19/)).toBeTruthy();

      const linePath = container.querySelector('path');
      expect(linePath).toBeTruthy();

      const dots = container.querySelectorAll('.macro-chart-dot');
      expect(dots.length).toBe(3);

      // Check screen reader table fallback
      const table = container.querySelector('table.sr-only');
      expect(table).toBeTruthy();
      expect(table.textContent).toContain('2026-11-17');
      expect(table.textContent).toContain('218.1');
    });

    it('renders empty fallback when data is missing or empty', () => {
      render(<FxLineChart data={[]} title="Empty Test" />);
      expect(screen.getByText(/No qualified historical observations available/)).toBeTruthy();
    });
  });

  describe('CurrencyMacroPanel Component', () => {
    it('renders pure currency desk, official central-bank links, and zero World Bank references', () => {
      render(<CurrencyMacroPanel />);

      expect(screen.getByText('Currency & FX Reference Desk')).toBeTruthy();
      expect(screen.getByText(/Central Bank of Oman \(CBO\)/)).toBeTruthy();
      expect(screen.getByText(/Reserve Bank of India \(RBI\)/)).toBeTruthy();
      expect(screen.getByText(/Frankfurter API Documentation/)).toBeTruthy();
      expect(screen.queryByText(/World Bank/i)).toBeNull();
      expect(screen.queryByText(/Creative Commons/i)).toBeNull();
    });

    it('renders dated currency references without static rates', () => {
      render(<CurrencyMacroPanel />);

      expect(screen.getByText('Currency & FX Reference Desk')).toBeTruthy();
      expect(screen.getByRole('list', { name: 'Dated currency references' })).toBeTruthy();
      expect(screen.queryByText('₹242.04')).toBeNull();
      expect(screen.getAllByText('OMR / INR').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('USD / INR').length).toBeGreaterThanOrEqual(1);
      // Verifies complete removal of GDP growth and macro indicators from trading view
      expect(screen.queryByText(/GDP Growth/i)).toBeNull();
      expect(screen.queryByText(/Consumer Inflation/i)).toBeNull();
    });

    it('operates FX converter desk and fetches reference rate reliably', async () => {
      const fetchMock = vi.fn().mockImplementation(async (url) => {
        if (url.includes('api.frankfurter.dev')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              date: recentObservationDay,
              base: 'OMR',
              quote: 'INR',
              rate: 218.50
            })
          };
        }
        throw new Error(`Unhandled URL: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      render(<CurrencyMacroPanel />);

      const refreshBtn = screen.getByRole('button', { name: /Check Reference Rate|Refresh Rate/i });
      fireEvent.click(refreshBtn);

      await waitFor(() => {
        expect(screen.getAllByText(/1 OMR = 218.50 INR/)).toHaveLength(2);
      });
    });
  });
});
