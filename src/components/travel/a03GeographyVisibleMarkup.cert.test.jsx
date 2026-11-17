import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import TravelLocalStories from './TravelLocalStories.jsx';
import { getTravelLocationProfile } from '../../services/travelLocationProfile.js';

const muscat = getTravelLocationProfile({ travelLocation: { city: 'muscat' } });
const wrong = {
  id: 'tokyo', title: 'Global arts festival opens in Tokyo',
  source: 'Muscat Daily', section: 'local',
};
const real = {
  id: 'qurum', title: 'Muscat Municipality announces road closure in Qurum',
  source: 'Global Wire', section: 'local',
};

describe('A03 visible travel-local component — actual React HTML', () => {
  it('does not render publisher-only foreign story in Muscat local panel', () => {
    const html = renderToStaticMarkup(
      <TravelLocalStories newsData={{ local: [wrong, real] }} profile={muscat} />,
    );
    expect(html).toContain('Muscat Municipality announces road closure in Qurum');
    expect(html).toContain('Muscat / Oman');
    expect(html).not.toContain('Global arts festival opens in Tokyo');
    expect(html).toContain('data-travel-local-stories="true"');
  });

  it('renders fail-closed empty panel, not a misleading local story', () => {
    const html = renderToStaticMarkup(
      <TravelLocalStories newsData={{ local: [wrong] }} profile={muscat} />,
    );
    expect(html).toContain('No strong Muscat local story match yet');
    expect(html).not.toContain('Global arts festival opens in Tokyo');
    expect(html).toContain('data-travel-local-stories="empty"');
  });
});
