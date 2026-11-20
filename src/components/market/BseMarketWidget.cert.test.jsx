// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import BseMarketWidget from './BseMarketWidget.jsx';

afterEach(cleanup);

describe('optional BSE reference display', () => {
  it('only loads the third-party script after consent and removes it when hidden', () => {
    const { container } = render(<BseMarketWidget kind="indices" />);
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText(/shares your IP address/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Load BSE indices prices' }));
    const script = container.querySelector('script');
    expect(script.src).toBe('https://s3.tradingview.com/external-embedding/embed-widget-market-quotes.js');
    const config = JSON.parse(script.textContent);
    expect(config.symbolsGroups[0].symbols.map(row => row.name)).toEqual(['BSE:SENSEX', 'BSE:BSE500']);
    expect(screen.getByText(/by TradingView/)).toBeTruthy();
    expect(container.querySelector('.tradingview-widget-container__widget')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Hide TradingView prices' }));
    expect(container.querySelector('script')).toBeNull();
  });

  it('retains a source fallback if the script fails', () => {
    const { container } = render(<BseMarketWidget kind="equities" />);
    fireEvent.click(screen.getByRole('button', { name: 'Load BSE equities prices' }));
    const script = container.querySelector('script');
    expect(JSON.parse(script.textContent).symbolsGroups[0].symbols.map(row => row.name))
      .toEqual(['BSE:RELIANCE', 'BSE:TCS', 'BSE:INFY']);
    fireEvent.error(script);
    expect(screen.getByRole('status').textContent).toMatch(/could not load/);
    expect(screen.getByRole('link', { name: /Infosys on TradingView/ }).href)
      .toBe('https://www.tradingview.com/symbols/BSE-INFY/');
  });

  it('recreates the provider display when the selected group changes', () => {
    const { container, rerender } = render(<BseMarketWidget kind="indices" />);
    fireEvent.click(screen.getByRole('button', { name: 'Load BSE indices prices' }));
    const oldScript = container.querySelector('script');
    rerender(<BseMarketWidget kind="equities" />);
    expect(container.querySelectorAll('script')).toHaveLength(1);
    expect(container.querySelector('script')).not.toBe(oldScript);
    expect(JSON.parse(container.querySelector('script').textContent).title).toBe('BSE equities');
  });
});
