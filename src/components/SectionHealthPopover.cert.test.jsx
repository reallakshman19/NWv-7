// @vitest-environment jsdom
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SectionHealthPopover from './SectionHealthPopover.jsx';

const muscatWarning = {
  sectionId: 'muscat',
  status: 'warning',
  storyCount: 12,
  sourceGroupCount: 2,
  topSources: [
    { source: 'Times of Oman', count: 12 },
    { source: 'Google News Muscat', count: 4 },
  ],
  warningFeeds: [
    { id: 'muscat_daily', feedUrl: 'https://www.muscatdaily.com/feed', lastError: '415 Unsupported Media Type', zeroItemRuns: 12 },
  ],
  deadFeeds: [],
  staleFeeds: [
    { id: 'oman_observer', feedUrl: 'https://www.omanobserver.om/rss', lastNonZeroSuccess: '2026-07-10T00:00:00Z', zeroItemRuns: 15 },
  ],
  zeroItemFeeds: [
    { id: 'muscat_daily', feedUrl: 'https://www.muscatdaily.com/feed', zeroItemRuns: 12 },
  ],
  lastCheckedAt: '2026-07-13T01:00:00Z',
  lastNonZeroSuccess: '2026-07-12T23:00:00Z',
  lastError: '415 Unsupported Media Type',
  reasons: ['persistent_zero_item_feed_streak', 'source_warning_status'],
};

describe('SectionHealthPopover', () => {
  it('renders normalized health fields without dumping raw JSON', () => {
    render(<SectionHealthPopover summary={muscatWarning} onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: /section health diagnostics/i });
    const view = within(dialog);
    expect(dialog).toBeTruthy();
    expect(view.getByText('sectionId')).toBeTruthy();
    expect(view.getByText('muscat')).toBeTruthy();
    expect(view.getByText('status')).toBeTruthy();
    expect(view.getByText('warning')).toBeTruthy();
    expect(view.getByText('storyCount')).toBeTruthy();
    expect(view.getByText('12')).toBeTruthy();
    expect(view.getByText('sourceGroupCount')).toBeTruthy();
    expect(view.getByText('Times of Oman (12)')).toBeTruthy();
    expect(view.getAllByText(/muscat_daily/).length).toBeGreaterThan(0);
    expect(view.getAllByText(/zero-item runs: 12/).length).toBeGreaterThan(0);
    expect(view.getAllByText(/415 Unsupported Media Type/).length).toBeGreaterThan(0);
    expect(view.getByText('persistent zero item feed streak')).toBeTruthy();
  });

  it('handles empty arrays gracefully', () => {
    render(
      <SectionHealthPopover
        summary={{
          sectionId: 'world',
          status: 'ok',
          storyCount: 8,
          sourceGroupCount: 2,
          topSources: [],
          warningFeeds: [],
          deadFeeds: [],
          staleFeeds: [],
          zeroItemFeeds: [],
          reasons: [],
        }}
      />
    );

    expect(screen.getAllByText('None recorded').length).toBeGreaterThanOrEqual(5);
  });

  it('renders unknown diagnostics when no summary is supplied', () => {
    render(<SectionHealthPopover summary={null} />);

    expect(screen.getByText('unknown — diagnostics unavailable')).toBeTruthy();
  });
});