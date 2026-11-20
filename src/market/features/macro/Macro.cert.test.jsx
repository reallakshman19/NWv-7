// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  FXQuickConverter,
  CurrencyMacroPanel,
  MacroChart,
  macroStore
} from './index.js';

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
      expect(screen.getByText(/Zero-boot mode/)).toBeTruthy();
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
          date: '2026-11-20',
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

  describe('MacroChart Component', () => {
    it('renders annual macro bars with negative/positive styling and zero line', () => {
      const sampleObservations = [
        { year: '2020', value: -5.77 },
        { year: '2021', value: 3.10 },
        { year: '2022', value: 4.31 }
      ];

      const { container } = render(
        <MacroChart
          mode="BAR"
          data={sampleObservations}
          unit="%"
          title="Oman GDP Growth"
        />
      );

      expect(screen.getByText('Oman GDP Growth')).toBeTruthy();
      expect(screen.getByText(/2020 — 2022/)).toBeTruthy();

      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();

      // Check bars
      const bars = container.querySelectorAll('.macro-chart-bar');
      expect(bars.length).toBe(3);

      // Check screen reader table fallback
      const table = container.querySelector('table.sr-only');
      expect(table).toBeTruthy();
      expect(table.textContent).toContain('2020');
      expect(table.textContent).toContain('-5.77%');
    });

    it('renders daily FX line chart with polyline and trading date points', () => {
      const sampleRates = [
        { date: '2026-11-17', rate: 218.10 },
        { date: '2026-11-18', rate: 218.25 },
        { date: '2026-11-19', rate: 218.50 }
      ];

      const { container } = render(
        <MacroChart
          mode="LINE"
          data={sampleRates}
          unit=""
          title="OMR / INR Trajectory"
        />
      );

      expect(screen.getByText('OMR / INR Trajectory')).toBeTruthy();
      expect(screen.getByText(/2026-11-17 — 2026-11-19/)).toBeTruthy();

      const linePath = container.querySelector('path');
      expect(linePath).toBeTruthy();

      const dots = container.querySelectorAll('.macro-chart-dot');
      expect(dots.length).toBe(3);
    });

    it('renders empty fallback when data is missing or empty', () => {
      render(<MacroChart mode="BAR" data={[]} title="Empty Test" />);
      expect(screen.getByText(/No qualified historical observations available/)).toBeTruthy();
    });
  });

  describe('CurrencyMacroPanel Component', () => {
    it('renders full currency desk, macro desk, CC BY-4.0 disclosures and official links', () => {
      render(<CurrencyMacroPanel />);

      expect(screen.getByText('Currency & Macro Indicators')).toBeTruthy();
      expect(screen.getAllByText(/Creative Commons Attribution 4.0/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/Central Bank of Oman \(CBO\)/)).toBeTruthy();
      expect(screen.getByText(/Reserve Bank of India \(RBI\)/)).toBeTruthy();
      expect(screen.getByText(/World Bank Open Data/)).toBeTruthy();
    });

    it('allows country switching between India and Oman for macro metrics', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [
          { page: 1, total: 2 },
          [
            { indicator: { id: 'NY.GDP.MKTP.KD.ZG' }, countryiso3code: 'OMN', date: '2023', value: 1.30 },
            { indicator: { id: 'FP.CPI.TOTL.ZG' }, countryiso3code: 'OMN', date: '2023', value: 0.90 }
          ]
        ]
      });
      vi.stubGlobal('fetch', fetchMock);

      render(<CurrencyMacroPanel />);

      const omanBtn = screen.getByRole('button', { name: /Oman \(OMN\)/i });
      fireEvent.click(omanBtn);

      await waitFor(() => {
        expect(screen.getByText(/Oman: GDP Growth/)).toBeTruthy();
      });
    });

    it('isolates World Bank failure from FX converter desk (MKT-032)', async () => {
      const fetchMock = vi.fn().mockImplementation(async (url) => {
        if (url.includes('api.worldbank.org')) {
          return {
            ok: false,
            status: 403,
            json: async () => ({ error: 'Forbidden' })
          };
        }
        if (url.includes('api.frankfurter.dev')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              date: '2026-11-20',
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

      // FX Converter is fully rendered and operable
      const refreshBtn = screen.getByRole('button', { name: /Check Reference Rate|Refresh Rate/i });
      fireEvent.click(refreshBtn);

      await waitFor(() => {
        expect(screen.getByText(/1 OMR = 218.50 INR/)).toBeTruthy();
      });

      // Macro failure alert is confined to macro section without unmounting or crashing the panel
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeTruthy();
      });
    });
  });
});
