// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import DailyDigestSection from './DailyDigestSection.jsx';

afterEach(() => cleanup());

describe('DailyDigestSection availability states', () => {
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
});
