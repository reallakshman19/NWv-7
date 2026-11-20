// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FundSummary,
  FundsPanel,
  FundNavChart,
  FundCompareModal,
  FundSipModal,
  fundStore
} from './index.js';

afterEach(() => {
  cleanup();
  localStorage.clear();
  fundStore.init();
  vi.restoreAllMocks();
});

beforeEach(() => {
  localStorage.clear();
  fundStore.init();
});

describe('WP-05 Funds Vitest Certification Suite', () => {
  describe('FundSummary Component (Overview Integration)', () => {
    it('renders zero-boot summary card with no network requests', () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      render(<FundSummary onOpenFunds={vi.fn()} />);

      expect(screen.getByText('Mutual Funds Desk')).toBeTruthy();
      expect(screen.getByText(/0 \/ 12 Tracked Schemes/i)).toBeTruthy();
      expect(screen.getByText(/Search and track up to 12 Indian mutual fund schemes/i)).toBeTruthy();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('navigates to mutual funds workspace when button is clicked', () => {
      const onOpen = vi.fn();
      render(<FundSummary onOpenFunds={onOpen} />);

      const btn = screen.getByRole('button', { name: /Open Funds Desk/i });
      fireEvent.click(btn);
      expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it('renders saved schemes count when store has saved funds', () => {
      fundStore.saveFund('119551');

      render(<FundSummary onOpenFunds={vi.fn()} />);
      expect(screen.getByText(/1 \/ 12 Tracked Schemes/i)).toBeTruthy();
      expect(screen.getByText('Saved Schemes')).toBeTruthy();
    });
  });

  describe('FundNavChart Component', () => {
    it('renders SVG chart with single-fund data points and labels', () => {
      const observations = [
        { date: '2024-01-01', nav: 100 },
        { date: '2024-02-01', nav: 105 },
        { date: '2024-03-01', nav: 110 }
      ];

      const { container } = render(
        <FundNavChart
          observations={observations}
          activeRange="1Y"
          onRangeChange={vi.fn()}
        />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();
      expect(screen.getByText('NAV Trajectory')).toBeTruthy();
      expect(screen.getByText(/110\.00/)).toBeTruthy();
      expect(container.querySelectorAll('line').length).toBeGreaterThan(0);
    });

    it('handles multi-fund comparative base-100 series rendering', () => {
      const comparisonData = {
        alignedDates: ['2024-01-01', '2024-01-02', '2024-01-03'],
        seriesByScheme: {
          '101': [
            { date: '2024-01-01', nav: 100, normalized: 100 },
            { date: '2024-01-02', nav: 110, normalized: 110 },
            { date: '2024-01-03', nav: 120, normalized: 120 }
          ],
          '102': [
            { date: '2024-01-01', nav: 50, normalized: 100 },
            { date: '2024-01-02', nav: 52.5, normalized: 105 },
            { date: '2024-01-03', nav: 55, normalized: 110 }
          ]
        }
      };

      const schemesMeta = {
        '101': { name: 'Alpha Fund Direct Growth', color: '#388bfd' },
        '102': { name: 'Beta Fund Direct Growth', color: '#3fb950' }
      };

      const { container } = render(
        <FundNavChart
          isComparison={true}
          comparisonData={comparisonData}
          schemesMeta={schemesMeta}
        />
      );

      const paths = container.querySelectorAll('path');
      expect(paths.length).toBe(2);
      expect(screen.getAllByText('Alpha Fund Direct Growth').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Beta Fund Direct Growth').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('FundSipModal Component', () => {
    it('computes illustrative compounding scenario and updates future value', () => {
      const onClose = vi.fn();
      render(
        <FundSipModal
          isOpen={true}
          selectedFund={{ schemeCode: '119551', schemeName: 'Tata Digital India Fund' }}
          onClose={onClose}
        />
      );

      expect(screen.getByText(/SIP Scenario Calculator/i)).toBeTruthy();
      expect(screen.getByText(/Tata Digital India Fund/i)).toBeTruthy();
      expect(screen.getByText(/Illustrative Scenario Only/i)).toBeTruthy();

      // Check initial default calculated outputs (₹5,000 / 10 yrs / 12%)
      // Total Invested = ₹6,00,000
      expect(screen.getByText(/₹6,00,000/)).toBeTruthy();

      // Change monthly contribution to 10000
      const monthlyInput = screen.getByLabelText(/Monthly Contribution/i);
      fireEvent.change(monthlyInput, { target: { value: '10000' } });

      // Invested should now be ₹12,00,000
      expect(screen.getByText(/₹12,00,000/)).toBeTruthy();

      // Close modal
      const closeBtn = screen.getByRole('button', { name: /Close dialog/i });
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('FundCompareModal Component', () => {
    it('renders comparison warning if fewer than 2 schemes have complete history', () => {
      render(
        <FundCompareModal
          isOpen={true}
          savedCodes={['119551']}
          historyCache={{}}
          onClose={vi.fn()}
        />
      );

      expect(screen.getByText(/Select at least 2 saved funds with complete historical observations/i)).toBeTruthy();
    });

    it('renders comparative alignment and base-100 metrics for 2 schemes with history', () => {
      const historyCache = {
        '101': {
          schemeCode: '101',
          schemeName: 'Fund Alpha Direct Growth',
          category: 'Large Cap',
          plan: 'Direct',
          option: 'Growth',
          observations: [
            { date: '2024-01-01', nav: 100 },
            { date: '2024-01-02', nav: 110 }
          ]
        },
        '102': {
          schemeCode: '102',
          schemeName: 'Fund Beta Direct Growth',
          category: 'Flexi Cap',
          plan: 'Direct',
          option: 'Growth',
          observations: [
            { date: '2024-01-01', nav: 50 },
            { date: '2024-01-02', nav: 55 }
          ]
        }
      };

      render(
        <FundCompareModal
          isOpen={true}
          savedCodes={['101', '102']}
          historyCache={historyCache}
          onClose={vi.fn()}
        />
      );

      expect(screen.getByText(/Multi-Scheme Comparative Analysis/i)).toBeTruthy();
      expect(screen.getAllByText(/Fund Alpha Direct Growth/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Fund Beta Direct Growth/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('FundsPanel Component', () => {
    it('switches between Saved and Find a Fund tabs', () => {
      render(<FundsPanel />);

      expect(screen.getByRole('button', { name: /My Saved Funds/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /Find a Fund/i })).toBeTruthy();

      // Switch to Search tab
      fireEvent.click(screen.getByRole('button', { name: /Find a Fund/i }));
      expect(screen.getByPlaceholderText(/Search scheme name or fund house/i)).toBeTruthy();
    });

    it('searches for schemes and allows saving a scheme', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        if (String(url).includes('api.mfapi.in/mf/search')) {
          return {
            ok: true,
            status: 200,
            json: async () => [
              { schemeCode: 119551, schemeName: 'Tata Digital India Fund Direct Plan - Growth' },
              { schemeCode: 120503, schemeName: 'Axis Bluechip Fund Direct Plan - Growth' }
            ]
          };
        }
        return { ok: false, status: 404 };
      });

      render(<FundsPanel />);

      // Switch to search tab
      fireEvent.click(screen.getByRole('button', { name: /Find a Fund/i }));

      const searchInput = screen.getByPlaceholderText(/Search scheme name or fund house/i);
      fireEvent.change(searchInput, { target: { value: 'Tata Digital' } });

      await waitFor(() => {
        expect(screen.getByText(/Tata Digital India Fund Direct Plan - Growth/i)).toBeTruthy();
      });

      // Save scheme
      const saveButtons = screen.getAllByRole('button', { name: /\+ Save/i });
      fireEvent.click(saveButtons[0]);

      // Verify it's now in saved store
      expect(fundStore.state.savedCodes.includes('119551')).toBe(true);
    });

    it('loads and renders researched fund metrics with strict scheme identity', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        if (String(url).includes('api.mfapi.in/mf/119551')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              meta: {
                fund_house: 'Tata Mutual Fund',
                scheme_type: 'Open Ended Schemes',
                scheme_category: 'Sectoral/ Thematic',
                scheme_code: 119551,
                scheme_name: 'Tata Digital India Fund Direct Plan - Growth'
              },
              data: [
                { date: '21-11-2024', nav: '45.5000' },
                { date: '20-11-2024', nav: '45.1000' },
                { date: '21-10-2024', nav: '43.2000' },
                { date: '21-05-2024', nav: '40.0000' },
                { date: '21-11-2023', nav: '35.0000' }
              ],
              status: 'SUCCESS'
            })
          };
        }
        return { ok: false, status: 404 };
      });

      render(<FundsPanel initialCode="119551" />);

      await waitFor(() => {
        expect(screen.getByText('Tata Digital India Fund Direct Plan - Growth')).toBeTruthy();
      });

      // Trailing Returns, Risk Metrics, and CAGR rendered
      expect(screen.getByText(/1 Year Return/i)).toBeTruthy();
      expect(screen.getByText(/Available-Period CAGR/i)).toBeTruthy();
      expect(screen.getByText(/Maximum Drawdown/i)).toBeTruthy();
      expect(screen.getByText(/NAV Volatility/i)).toBeTruthy();

      // Open SIP calculator from research tab
      const sipBtn = screen.getByRole('button', { name: /Simulate SIP/i });
      fireEvent.click(sipBtn);
      expect(screen.getByText(/SIP Scenario Calculator/i)).toBeTruthy();
    });

    it('handles CSV and JSON export in saved tab', async () => {
      fundStore.saveFund('119551');

      render(<FundsPanel />);

      expect(screen.getByText(/Scheme 119551/i)).toBeTruthy();

      // Mock URL.createObjectURL and revokeObjectURL
      window.URL.createObjectURL = vi.fn(() => 'blob:mock');
      window.URL.revokeObjectURL = vi.fn();

      const exportJsonBtn = screen.getByRole('button', { name: /Backup JSON/i });
      const exportCsvBtn = screen.getByRole('button', { name: /Export CSV/i });

      fireEvent.click(exportJsonBtn);
      fireEvent.click(exportCsvBtn);

      expect(window.URL.createObjectURL).toHaveBeenCalledTimes(2);
    });
  });
});
