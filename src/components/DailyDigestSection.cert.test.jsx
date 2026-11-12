// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import DailyDigestSection from './DailyDigestSection.jsx';

afterEach(() => cleanup());

describe('DailyDigestSection availability states', () => {
  it('switches between source tabs by click and keyboard and displays ten stories per tab', () => {
    const cards = ['BBC', 'The Hindu', 'Times of Oman'].flatMap(source =>
      Array.from({ length: 10 }, (_, index) => ({
        slot: 'L' + (index + 1),
        canonicalId: source + index,
        canonicalUrl: 'https://example.com/' + encodeURIComponent(source) + '/' + index,
        title: source + ' story ' + index,
        source,
        sourceGroup: source,
        section: 'world',
      })));
    render(<DailyDigestSection cards={cards} deliveryMode="LIVE" availability="READY" />);

    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(within(screen.getByRole('tabpanel')).getAllByRole('link')).toHaveLength(10);
    const hindu = screen.getByRole('tab', { name: /The Hindu/ });
    fireEvent.click(hindu);
    expect(hindu.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('link', { name: /The Hindu story 0/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /BBC story 0/ })).toBeNull();

    fireEvent.keyDown(hindu, { key: 'ArrowRight' });
    const oman = screen.getByRole('tab', { name: /Times of Oman/ });
    expect(document.activeElement).toBe(oman);
    expect(oman.getAttribute('aria-selected')).toBe('true');
    expect(within(screen.getByRole('tabpanel')).getAllByRole('link')).toHaveLength(10);
  });

  it('keeps the section visible before the 10:15 IST freeze', () => {
    render(
      <DailyDigestSection
        cards={[]}
        digestDate="2026-09-13"
        availability="NOT_FROZEN"
      />
    );

    expect(screen.getByText('Daily Digest')).toBeTruthy();
    expect(screen.getByText('Scheduled')).toBeTruthy();
    expect(screen.getByText('Today’s Daily Digest is scheduled')).toBeTruthy();
    expect(screen.getByText(/Publishes at 10:15 IST/i)).toBeTruthy();
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('shows a delayed state instead of scheduled after a missed freeze', () => {
    render(
      <DailyDigestSection
        cards={[]}
        digestDate="2026-09-13"
        availability="MISSED_FREEZE"
      />
    );

    expect(screen.getByText('Delayed')).toBeTruthy();
    expect(screen.getByText('Today’s Daily Digest is delayed')).toBeTruthy();
    expect(screen.getByText(/after the scheduled 10:15 IST freeze/i)).toBeTruthy();
    expect(screen.queryByText('Today’s Daily Digest is scheduled')).toBeNull();
  });

  it('does not mislabel an unconfigured backend as a pre-freeze state', () => {
    render(
      <DailyDigestSection
        cards={[]}
        digestDate="2026-09-13"
        availability="BACKEND_NOT_CONFIGURED"
      />
    );

    expect(screen.getByText('Daily Digest service unavailable')).toBeTruthy();
    expect(screen.getByText(/backend is not configured/i)).toBeTruthy();
    expect(screen.queryByText(/Publishes at 10:15 IST/i)).toBeNull();
  });

  it('preserves the publisher-card rendering contract after freeze', () => {
    render(
      <DailyDigestSection
        cards={[{
          slot: 'I1',
          canonicalId: 'akashvani-2026-09-13',
          publisherFamily: 'AKASHVANI',
          product: 'morning_news',
          title: 'Morning News',
          canonicalUrl: 'https://newsonair.gov.in/example',
        }]}
        digestDate="2026-09-13"
        frozenAt="2026-09-13T04:45:00.000Z"
        compositionState="DEGRADED_GLOBAL_UNAVAILABLE"
        availability="READY"
      />
    );

    expect(screen.getByRole('link', { name: /Morning News/i })).toBeTruthy();
    expect(screen.getByText('Publisher-curated')).toBeTruthy();
    expect(screen.getByText('(1)')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('labels live fallback cards as auto-selected rather than publisher-curated', () => {
    render(
      <DailyDigestSection
        cards={[{
          slot: 'L1',
          canonicalId: 'live-1',
          source: 'BBC',
          sourceGroup: 'bbc',
          section: 'world',
          title: 'Live world headline',
          canonicalUrl: 'https://example.com/live-world',
          deliveryMode: 'LIVE',
        }]}
        digestDate="2026-10-18"
        compositionState="LIVE_SECTIONS_AUTHORITY"
        deliveryMode="LIVE"
        availability="READY"
      />
    );

    expect(screen.getByText('LIVE')).toBeTruthy();
    expect(screen.getByText('Live · Auto-selected')).toBeTruthy();
    expect(screen.getByText('BBC · World')).toBeTruthy();
    expect(screen.getByText('Live digest · current Sections authority')).toBeTruthy();
    expect(screen.queryByText('Publisher-curated')).toBeNull();
  });
});
