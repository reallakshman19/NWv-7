// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { LabPanel } from './LabPanel.jsx';
import { labStore } from './labStore.js';

describe('Investment Lab UI Certification Suite', () => {
  beforeEach(() => {
    labStore.reset();
  });

  afterEach(() => {
    cleanup();
    labStore.reset();
  });

  it('renders the Lab workspace title, navigation tabs, and universal disclaimer', () => {
    render(<LabPanel />);
    expect(screen.getByText('Investment Lab & Financial Mathematics')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /SIP & Goals/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Lumpsum & Inflation/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /SWP & Longevity/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /XIRR Playground/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Prepay vs\. Invest/i })).toBeTruthy();
    expect(screen.getByTestId('universal-lab-disclaimer')).toBeTruthy();
  });

  it('defaults to SIP tab and switches active sub-desks upon clicking tabs', () => {
    render(<LabPanel />);
    expect(screen.getByTestId('sip-lab-panel')).toBeTruthy();

    // Switch to Lumpsum
    fireEvent.click(screen.getByRole('tab', { name: /Lumpsum & Inflation/i }));
    expect(screen.getByTestId('lumpsum-lab-panel')).toBeTruthy();

    // Switch to SWP
    fireEvent.click(screen.getByRole('tab', { name: /SWP & Longevity/i }));
    expect(screen.getByTestId('swp-lab-panel')).toBeTruthy();

    // Switch to XIRR
    fireEvent.click(screen.getByRole('tab', { name: /XIRR Playground/i }));
    expect(screen.getByTestId('xirr-lab-panel')).toBeTruthy();

    // Switch to Prepay vs Invest
    fireEvent.click(screen.getByRole('tab', { name: /Prepay vs\. Invest/i }));
    expect(screen.getByTestId('prepay-lab-panel')).toBeTruthy();
  });

  it('SipLabPanel switches modes (Regular, Step-Up, Goal) and computes output', () => {
    render(<LabPanel />);
    // Default is Regular
    expect(screen.getByTestId('future-value')).toBeTruthy();

    // Switch to Goal mode
    fireEvent.click(screen.getByRole('tab', { name: /Target Goal Planner/i }));
    expect(screen.getByTestId('required-sip-value')).toBeTruthy();

    // Switch to Step-Up mode
    fireEvent.click(screen.getByRole('tab', { name: /Annual Step-Up SIP/i }));
    expect(screen.getByText(/Annual Step-Up Increment/i)).toBeTruthy();
  });

  it('SwpLabPanel displays simulation status and mandatory disclaimer', () => {
    labStore.setActiveTab('swp');
    render(<LabPanel />);
    expect(screen.getByTestId('swp-lab-panel')).toBeTruthy();
    expect(screen.getByTestId('swp-status-val')).toBeTruthy();
    expect(screen.getByTestId('swp-disclaimer').textContent).toContain('sequence-of-returns volatility');
  });

  it('XirrLabPanel renders signed transaction ledger with negative outlays and positive proceeds', () => {
    labStore.setActiveTab('xirr');
    render(<LabPanel />);
    expect(screen.getByTestId('xirr-lab-panel')).toBeTruthy();
    expect(screen.getByText('Investment / Money Paid Out (-)')).toBeTruthy();
    expect(screen.getByText('Proceeds / Money Received (+)')).toBeTruthy();
    expect(screen.getByTestId('xirr-rate-val')).toBeTruthy();
  });

  it('PrepayVsInvestPanel renders unbiased verdict and opportunity cost disclaimer', () => {
    labStore.setActiveTab('prepay');
    render(<LabPanel />);
    expect(screen.getByTestId('prepay-lab-panel')).toBeTruthy();
    expect(screen.getByTestId('prepay-verdict-val')).toBeTruthy();
    expect(screen.getByTestId('prepay-disclaimer').textContent).toContain('floating interest rates');
  });
});
