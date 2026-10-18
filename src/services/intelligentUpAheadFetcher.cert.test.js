import { describe, expect, it } from 'vitest';
import { __intelligentUpAheadFetcherInternalsForTest } from './intelligentUpAheadFetcher.js';

const { makeAcquisitionSummary } = __intelligentUpAheadFetcherInternalsForTest;

describe('Up Ahead acquisition diagnostics', () => {
  it('tracks attempted source coverage per category before fetching', () => {
    const summary = makeAcquisitionSummary([
      {
        category: 'shopping',
        sources: [
          { category: 'shopping', url: 'https://example.com/a' },
          { category: 'shopping', url: 'https://example.com/b' },
        ],
      },
      {
        category: 'airlines',
        sources: [
          { category: 'airlines', url: 'https://example.com/c' },
        ],
      },
    ]);

    expect(summary.status).toBe('running');
    expect(summary.attemptedSources).toBe(3);
    expect(summary.byCategory.shopping.attemptedSources).toBe(2);
    expect(summary.byCategory.airlines.attemptedSources).toBe(1);
  });

  it('reports no-sources when a category plan has no providers', () => {
    const summary = makeAcquisitionSummary([
      { category: 'shopping', sources: [] },
    ]);

    expect(summary.status).toBe('no-sources');
    expect(summary.attemptedSources).toBe(0);
  });
});
