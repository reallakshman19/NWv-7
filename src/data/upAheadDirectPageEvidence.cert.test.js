import { afterEach, describe, expect, it } from 'vitest';
import { clearDiagnostics, listDiagnostics } from './diagnosticsStore.js';
import {
  UP_AHEAD_DIRECT_PAGE_EVENT,
  combineDatasetHealthEntries,
  getDirectUpAheadEnvelopeEntry,
  publishDirectUpAheadEnvelope,
} from './upAheadDirectPageEvidence.js';

afterEach(() => clearDiagnostics());

describe('A06 direct page to Data Health provider chain', () => {
  it('publishes upstream Worker headers and direct page receipt without raw item data', () => {
    const data = { sourceMode: 'dataset-api', raw: { items: [{ id: 'secret-item' }] } };
    const envelope = {
      ok: true, datasetId: 'upAhead', source: 'live', freshness: 'fresh',
      fetchedAt: 1700000000000, lastGoodAt: 1700000000100,
      payloadHash: 'test-hash', fallbackUsed: false, data,
      diagnostics: [{
        event: 'upAheadDataset.api_edge_diagnostics', severity: 'info',
        details: { source: 'upstream', reason: 'ok', freshness: 'fresh', ageSeconds: '30' },
      }],
    };
    const result = publishDirectUpAheadEnvelope(envelope);
    const events = listDiagnostics();
    expect(result.sourceMode).toBe('dataset-api');
    expect(events.map(item => item.event)).toEqual([
      'upAheadDataset.api_edge_diagnostics', UP_AHEAD_DIRECT_PAGE_EVENT,
    ]);
    expect(events[0].details).toEqual({
      source: 'upstream', reason: 'ok', freshness: 'fresh', ageSeconds: '30',
    });
    expect(JSON.stringify(events)).not.toContain('secret-item');
    const entry = getDirectUpAheadEnvelopeEntry(events);
    expect(entry).toMatchObject({
      datasetId: 'upAhead (page)',
      envelope: { ok: true, sourceMode: 'dataset-api', freshness: 'fresh' },
    });
  });

  it('adds a direct page receipt beside the orchestrator cache in Data Health', () => {
    const cached = [{ datasetId: 'weather', cacheKey: 'weather', envelope: { ok: true } }];
    expect(combineDatasetHealthEntries(cached, [])).toEqual(cached);
    publishDirectUpAheadEnvelope({
      ok: false, source: 'failed', freshness: 'unknown',
      error: 'Worker timed out', data: { sourceMode: 'failed' },
    });
    const health = combineDatasetHealthEntries(cached, listDiagnostics());
    expect(health).toHaveLength(2);
    expect(health[0].datasetId).toBe('weather');
    expect(health[1]).toMatchObject({
      datasetId: 'upAhead (page)',
      envelope: { ok: false, source: 'failed', error: 'Worker timed out' },
    });
  });
});
