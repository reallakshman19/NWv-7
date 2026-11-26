// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MarketProviderBoard } from './MarketProviderBoard.jsx';

const policy = vi.hoisted(() => ({ allow:vi.fn() }));
vi.mock('../indices/headlineIndexResolution.js', async importOriginal => ({
  ...(await importOriginal()), canAttemptHeadlineEmbed:policy.allow
}));

afterEach(() => { cleanup(); policy.allow.mockReset(); });

describe('MP04 provider board preflight integration', () => {
  it('filters denied index symbols before creating any provider request', () => {
    policy.allow.mockImplementation(symbol => symbol === 'BSE:SENSEX');
    const { container } = render(<MarketProviderBoard group="indices" />);
    expect(container.querySelector('iframe')).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Load BSE indices prices'}));
    const frame = container.querySelector('iframe');
    // The tested URL holds only the app-generated configuration.
    const wrapperHtml = decodeURIComponent(frame.getAttribute('src').split(',')[1]);
    expect(wrapperHtml).toContain('BSE:SENSEX');
    expect(wrapperHtml).not.toContain('BSE:BSE500');
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-popups');
    fireEvent.load(frame);
    expect(screen.getByText(/quote rendering is unverified/i)).toBeTruthy();
  });
  it('does not load an iframe if every index is denied', () => {
    policy.allow.mockReturnValue(false);
    const { container } = render(<MarketProviderBoard group="indices" />);
    const load = screen.getByRole('button',{name:'Load BSE indices prices'});
    expect(load.disabled).toBe(true);
    fireEvent.click(load);
    expect(container.querySelector('iframe')).toBeNull();
  });
});
