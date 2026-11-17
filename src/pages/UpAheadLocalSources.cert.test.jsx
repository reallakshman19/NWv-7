import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UpAheadSourceDirectory } from './UpAheadPage.jsx';

describe('Up Ahead usable official source directories', () => {
  it('shows official sources, city coverage and limits even with zero alert cards', () => {
    const html = renderToStaticMarkup(<UpAheadSourceDirectory channel="alerts" alerts={[]} />);
    expect(html).toContain('Chennai: 0 matching card(s)');
    expect(html).toContain('Muscat: 0 matching card(s)');
    expect(html).toContain('https://mausam.imd.gov.in/chennai/');
    expect(html).toContain('https://met.caa.gov.om/');
    expect(html).toContain('not a complete official alert feed');
  });
  it('keeps source links outside the Planner item list and restricts markets by channel', () => {
    const html = renderToStaticMarkup(<UpAheadSourceDirectory channel="online" />);
    expect(html).toContain('Amazon India');
    expect(html).toContain('Flipkart India');
    expect(html).toContain('LuLu Oman');
    expect(html).toContain('HyperMax Oman');
    expect(html).not.toContain('Sharaf DG');
    expect(html).not.toContain('+ Plan');
    expect(html).toContain('not verified offers');
  });
});
