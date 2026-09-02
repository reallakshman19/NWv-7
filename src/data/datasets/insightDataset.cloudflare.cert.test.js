import { describe, expect, it } from 'vitest';
import { __insightDatasetInternalsForTest } from './insightDataset.js';

const { getSource, getStaleLabel } = __insightDatasetInternalsForTest;

describe('NW-INSIGHT-CF-001 Insight dataset Cloudflare provenance', () => {
  it('does not relabel Cloudflare Sections as live', () => {
    expect(getSource('cloudflare-sections')).toBe('cloudflare-sections');
  });

  it('reports Cloudflare data age explicitly', () => {
    const timestamp = Date.now() - 60 * 60 * 1000;
    expect(getStaleLabel('cloudflare-sections', timestamp)).toContain('Cloudflare ·');
  });
});
