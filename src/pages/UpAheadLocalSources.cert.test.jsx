import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UpAheadSourceDirectory } from './UpAheadPage.jsx';

describe('Up Ahead local source coverage', () => {
  it('does not substitute a directory or claim no warnings without a checked bulletin', () => {
    const html = renderToStaticMarkup(<UpAheadSourceDirectory channel="alerts" />);
    expect(html).toContain('Chennai: coverage unverified');
    expect(html).toContain('Muscat: coverage unverified');
    expect(html).not.toContain('https://mausam.imd.gov.in/chennai/');
    expect(html).not.toContain('No warnings');
    expect(html).toContain('does not establish that your area is unaffected');
  });
  it('does not substitute a retailer directory for populated offers', () => {
    const html = renderToStaticMarkup(<UpAheadSourceDirectory channel="online" />);
    expect(html).toBe('');
  });
});
