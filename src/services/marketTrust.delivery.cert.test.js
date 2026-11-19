import { describe, expect, it } from 'vitest';
import { summarizeMarketSourceHealth, normalizeSourceHealth } from './marketTrust.js';

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

describe('partial tracked-share provenance', () => {
  it('does not describe partial acquisitions as fully available or official', () => {
    expect(normalizeSourceHealth({equities: {status:'partial', provider:'Yahoo Finance', count:12}}).equities.status).toBe('partial');
    const state = summarizeMarketSourceHealth({sourceMode:'snapshot', sourceHealth:{equities:{status:'partial',provider:'Yahoo Finance'}}});
    expect(state.counts.partial).toBe(1);
    expect(state.counts.official).toBe(0);
  });
});
