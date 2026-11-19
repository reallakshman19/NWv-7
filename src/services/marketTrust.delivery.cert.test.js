import { describe, expect, it } from 'vitest';
import { summarizeMarketSourceHealth } from './marketTrust.js';

describe('Market delivery and source provenance', () => {
  const upstream = { indices: { status: 'live', provider: 'Yahoo' } };

  it.each([
    ['cache', 'Cached', 'cached'],
    ['stale-cache', 'Stale', 'degraded'],
    ['stale-snapshot', 'Stale', 'degraded'],
    ['snapshot', 'Snapshot', 'snapshot'],
    ['seed', 'Unavailable', 'degraded'],
    ['live', 'Delayed', 'cached'],
  ])('uses delivery mode %s even when prior source status was live', (sourceMode, modeLabel, modeStr) => {
    const result = summarizeMarketSourceHealth({ sourceMode, sourceHealth: upstream });
    expect(result).toMatchObject({ modeLabel, modeStr });
    expect(result.counts.live).toBe(1);
  });
});
