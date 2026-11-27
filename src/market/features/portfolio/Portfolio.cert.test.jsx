// @vitest-environment jsdom

import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import {
  PortfolioPanel,
  PortfolioSummary,
  TransactionModal,
  PriceMarkModal,
  PortfolioImportModal,
  portfolioStore,
  PORTFOLIO_STORAGE_KEY,
  createDefaultPortfolioState
} from './index.js';

describe('WP-04 Portfolio Certification Test Suite', () => {
  beforeEach(() => {
    // Reset local storage and store before each test
    window.localStorage.clear();
    const defaultState = createDefaultPortfolioState();
    portfolioStore.state = defaultState;
    portfolioStore.updateSnapshot();
  });

  it('WP04-T01 PortfolioSummary renders empty state and invokes onOpenPortfolio', () => {
    const onOpen = vi.fn();
    render(<PortfolioSummary onOpenPortfolio={onOpen} />);

    expect(screen.getByText('Portfolio Desk')).toBeDefined();
    expect(screen.getByText('Primary Portfolio')).toBeDefined();
    expect(screen.getByText('0 Active')).toBeDefined();
    expect(screen.getByText('Liquidated')).toBeDefined();

    const openBtn = screen.getByRole('button', { name: /Open Portfolio Desk/i });
    fireEvent.click(openBtn);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('WP04-T02 PortfolioSummary displays missing marks warning badge when active holdings lack price mark', () => {
    // Add an open holding without mark
    portfolioStore.addTransaction('default', {
      type: 'BUY',
      instrumentKey: 'NSE:INFY',
      date: '2026-01-01',
      quantity: 10,
      price: 1000,
      fee: 20
    });

    render(<PortfolioSummary onOpenPortfolio={vi.fn()} />);

    expect(screen.getByText('1 Active')).toBeDefined();
    expect(screen.getByText('Marks Missing')).toBeDefined();
    // Missing mark displays Unavailable, NOT ₹0.00
    expect(screen.getByText('Unavailable')).toBeDefined();
    // Remaining basis is 10 * 1000 + 20 = ₹10,020.00
    expect(screen.getByText('₹10,020.00')).toBeDefined();
  });

  it('WP04-T03 PortfolioSummary displays Oversell Error banner when oversell occurs', () => {
    portfolioStore.addTransaction('default', {
      type: 'BUY',
      instrumentKey: 'NSE:TCS',
      date: '2026-01-01',
      quantity: 5,
      price: 2000
    });
    portfolioStore.addTransaction('default', {
      type: 'SELL',
      instrumentKey: 'NSE:TCS',
      date: '2026-01-02',
      quantity: 10, // oversell
      price: 2100
    });

    render(<PortfolioSummary onOpenPortfolio={vi.fn()} />);
    expect(screen.getByText('Oversell Error')).toBeDefined();
    expect(screen.getByRole('alert')).toBeDefined();
  });

  it('WP04-T04 PortfolioPanel renders header, analytical disclaimer, and metrics grid', () => {
    render(<PortfolioPanel />);

    // Header title and dropdown
    expect(screen.getByLabelText('Select Portfolio')).toBeDefined();
    expect(screen.getByRole('button', { name: /\+ New/i })).toBeDefined();

    // Mandatory analytical disclaimer mentioning IT Act Sec 45(2A)
    const disclaimer = screen.getByRole('note');
    expect(disclaimer.textContent).toContain('moving weighted-average cost basis');
    expect(disclaimer.textContent).toContain('Sec 45(2A)');

    // Metrics grid
    expect(screen.getByText('Remaining Cost Basis')).toBeDefined();
    expect(screen.getByText('Current Portfolio Value')).toBeDefined();
    expect(screen.getByText('Unrealized P&L')).toBeDefined();
    expect(screen.getByText('Realized P&L')).toBeDefined();
    expect(screen.getByText('Portfolio XIRR')).toBeDefined();
  });

  it('WP04-T05 Adds a BUY transaction and updates holdings table and remaining basis', () => {
    render(<PortfolioPanel />);

    // Click + Add Transaction
    const addBtn = screen.getByRole('button', { name: /\+ Add Transaction/i });
    fireEvent.click(addBtn);

    // Modal opens
    expect(screen.getByRole('dialog', { name: /Record Transaction/i })).toBeDefined();

    // Fill form
    fireEvent.change(screen.getByLabelText(/Symbol/i), { target: { value: 'INFY' } });
    fireEvent.change(screen.getByLabelText(/Quantity/i), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText(/Price/i), { target: { value: '1500' } });
    fireEvent.change(screen.getByLabelText(/Total Fees/i), { target: { value: '25' } });

    // Save
    fireEvent.click(screen.getByRole('button', { name: /Save Transaction/i }));

    // Holdings table should now show NSE:INFY
    expect(screen.getByText('NSE:INFY')).toBeDefined();
    // Remaining basis = 10 * 1500 + 25 = 15025
    expect(screen.getAllByText('₹15,025.00').length).toBeGreaterThan(0);
  });

  it('WP04-T06 Records manual price mark and displays current value and unrealized P&L', () => {
    portfolioStore.addTransaction('default', {
      type: 'BUY',
      instrumentKey: 'NSE:INFY',
      date: '2026-01-01',
      quantity: 10,
      price: 100,
      fee: 0
    });

    render(<PortfolioPanel />);

    // Click Mark Price
    const markBtn = screen.getByRole('button', { name: /Mark Price/i });
    fireEvent.click(markBtn);

    // Mark modal opens
    expect(screen.getByRole('dialog', { name: /Manual Price Mark: NSE:INFY/i })).toBeDefined();
    expect(screen.getByRole('link', { name: /View INFY on NSE/i }).getAttribute('href'))
      .toBe('https://www.nseindia.com/get-quotes/equity?symbol=INFY');

    // Fill mark
    fireEvent.change(screen.getByLabelText(/Unit Price/i), { target: { value: '120' } });
    fireEvent.change(screen.getByLabelText(/As of Date/i), { target: { value: '2026-01-15' } });

    fireEvent.click(screen.getByRole('button', { name: /Save Mark/i }));

    // Value should be 10 * 120 = ₹1,200.00
    expect(screen.getAllByText('₹1,200.00').length).toBeGreaterThan(0);
    // Unrealized P&L should be 1200 - 1000 = +₹200.00 (+20%)
    expect(screen.getByText('+₹200.00')).toBeDefined();
  });

  it('WP04-T07 Switches tabs to Transaction Ledger, edits, and deletes a trade', () => {
    portfolioStore.addTransaction('default', {
      type: 'BUY',
      instrumentKey: 'NSE:RELIANCE',
      date: '2026-01-01',
      quantity: 20,
      price: 2500,
      fee: 50,
      notes: 'Initial test buy'
    });

    render(<PortfolioPanel />);

    // Switch to Transactions tab
    const txTabBtn = screen.getByRole('button', { name: /Transaction Ledger/i });
    fireEvent.click(txTabBtn);

    expect(screen.getByText('Showing 1 of 1 transaction(s)')).toBeDefined();
    expect(screen.getByText('Initial test buy')).toBeDefined();

    // Edit trade
    const editBtn = screen.getByRole('button', { name: /Edit/i });
    fireEvent.click(editBtn);

    expect(screen.getByRole('dialog', { name: /Edit Transaction/i })).toBeDefined();
    fireEvent.change(screen.getByLabelText(/Notes/i), { target: { value: 'Updated note' } });
    fireEvent.click(screen.getByRole('button', { name: /Update Transaction/i }));

    expect(screen.getByText('Updated note')).toBeDefined();

    // Delete trade (with confirmation)
    const deleteBtn = screen.getByRole('button', { name: /Delete/i });
    fireEvent.click(deleteBtn);

    const confirmBtn = screen.getByRole('button', { name: /Confirm/i });
    fireEvent.click(confirmBtn);

    expect(screen.getByText(/No transactions match/i)).toBeDefined();
  });

  it('WP04-T08 Creates a new portfolio via inline dialog and switches between them', () => {
    render(<PortfolioPanel />);

    // Click + New
    fireEvent.click(screen.getByRole('button', { name: /\+ New/i }));

    const nameInput = screen.getByLabelText(/Portfolio Name:/i);
    fireEvent.change(nameInput, { target: { value: 'Growth SIP Portfolio' } });
    fireEvent.click(screen.getByRole('button', { name: /^Create$/i }));

    // Dropdown should now reflect active portfolio
    const select = screen.getByLabelText('Select Portfolio');
    expect(select.value).not.toBe('default');
    expect(screen.getByText('Growth SIP Portfolio')).toBeDefined();
  });

  it('WP04-T09 Handles initialKey prop by opening transaction modal prefilled', () => {
    render(<PortfolioPanel initialKey="BSE:500325" />);

    // Should open modal with BSE and 500325 prefilled
    expect(screen.getByRole('dialog', { name: /Record Transaction/i })).toBeDefined();
    const symbolInput = screen.getByLabelText(/Symbol/i);
    expect(symbolInput.value).toBe('500325');
  });

  it('WP04-T10 Imports JSON and CSV files through PortfolioImportModal', async () => {
    render(<PortfolioPanel />);

    fireEvent.click(screen.getByRole('button', { name: /Import File/i }));
    expect(screen.getByRole('dialog', { name: /Import Portfolio Data/i })).toBeDefined();

    // Test JSON import
    const validJson = JSON.stringify({
      version: 1,
      portfolios: [
        {
          name: 'Imported Test',
          transactions: [
            { type: 'BUY', instrumentKey: 'NSE:TCS', date: '2026-02-01', quantity: 5, price: 3500, fee: 10 }
          ],
          manualPriceMarks: {}
        }
      ]
    });

    const textarea = screen.getByLabelText(/Paste JSON Text/i);
    fireEvent.change(textarea, { target: { value: validJson } });

    fireEvent.click(screen.getByRole('button', { name: /Execute Import/i }));

    await waitFor(() => {
      expect(screen.getByText(/Successfully imported portfolio data/i)).toBeDefined();
    });
  });
});
