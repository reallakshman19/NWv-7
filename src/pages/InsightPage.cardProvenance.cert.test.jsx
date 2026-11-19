import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ICard } from './InsightPage.jsx';

describe('Insight card publisher and acquisition provenance', () => {
  afterEach(()=>vi.restoreAllMocks());
  const id='90a0cf4d9bca8455';
  const row={id,title:'Storm report',source:'The Hindu',sourceGroup:'the_hindu'};
  const story={canonicalHeadline:'Coastal update',clusterStoryIds:[id],childStoryIds:[id],latestSeenAt:Date.parse('2026-11-18T12:00:00Z')};
  it('shows the actual snapshot source, publication age and publisher instead of an opaque ID', () => {
    vi.spyOn(Date,'now').mockReturnValue(Date.parse('2026-11-18T14:00:00Z'));
    const html=renderToStaticMarkup(<ICard story={story} index={0} storiesById={new Map([[id,row]])} source="snapshot" />);
    expect(html).toContain('Snapshot'); expect(html).toContain('2h ago'); expect(html).toContain('The Hindu');
    expect(html).not.toContain(id); expect(html).not.toContain('>Live<');
  });
  it('preserves actual Live acquisition and does not invent a time or publisher for missing evidence', () => {
    const html=renderToStaticMarkup(<ICard story={{...story,latestSeenAt:null}} index={0} source="live" />);
    expect(html).toContain('>Live<'); expect(html).toContain('Time unknown'); expect(html).not.toContain(id);
  });
});
