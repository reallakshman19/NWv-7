// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TravelLocalStories from './TravelLocalStories.jsx';
import { getTravelLocationProfile } from '../../services/travelLocationProfile.js';

const profileFor = city => getTravelLocationProfile({ travelLocation: { city } });
const publishedAt = new Date().toISOString();
const newsData = {
  local: [
    {
      id: 'chennai-local',
      title: 'Chennai corporation announces new roadworks',
      url: 'https://example.com/chennai-roadworks',
      publishedAt,
    },
    {
      id: 'muscat-local',
      title: 'Muscat Municipality launches new public transport routes',
      url: 'https://example.com/muscat-routes',
      publishedAt,
    },
  ],
};

afterEach(cleanup);

describe('Travel local disclosure', () => {
  it('starts collapsed and opens/closes with an accessible native summary', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <TravelLocalStories profile={profileFor('chennai')} newsData={newsData} />,
    );
    const details = container.querySelector('details');
    const toggle = screen.getByText(/Travel local/i).closest('summary');

    expect(details).not.toBeNull();
    expect(details.open).toBe(false);
    expect(toggle).not.toBeNull();
    expect(toggle.textContent).toContain('Chennai / India');

    await user.click(toggle);
    expect(details.open).toBe(true);
    expect(screen.getByText('Chennai corporation announces new roadworks')).toBeTruthy();
    expect(screen.queryByText('Muscat Municipality launches new public transport routes')).toBeNull();

    await user.click(toggle);
    expect(details.open).toBe(false);
  });

  it('resets to collapsed when the user switches weather cities', async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(
      <TravelLocalStories profile={profileFor('chennai')} newsData={newsData} />,
    );

    await user.click(screen.getByText(/Travel local/i).closest('summary'));
    expect(container.querySelector('details').open).toBe(true);

    rerender(<TravelLocalStories profile={profileFor('muscat')} newsData={newsData} />);
    expect(container.querySelector('details').open).toBe(false);
    expect(screen.getByText('Muscat / Oman')).toBeTruthy();

    await user.click(screen.getByText(/Travel local/i).closest('summary'));
    expect(container.querySelector('details').open).toBe(true);
    expect(screen.getByText('Muscat Municipality launches new public transport routes')).toBeTruthy();
    expect(screen.queryByText('Chennai corporation announces new roadworks')).toBeNull();
  });

  it('keeps a no-results location available while collapsed', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <TravelLocalStories profile={profileFor('colombo')} newsData={{ local: [] }} />,
    );

    const details = container.querySelector('details');
    expect(details.open).toBe(false);
    expect(screen.getByText('Colombo / Sri Lanka')).toBeTruthy();
    await user.click(screen.getByText(/Travel local/i).closest('summary'));
    expect(details.open).toBe(true);
    expect(screen.getByText(/No strong Colombo local story match yet/)).toBeTruthy();
  });
});
