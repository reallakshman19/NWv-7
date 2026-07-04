import assert from 'node:assert/strict';
import {
  SERVED_FROM,
  attachFetchDiagnostics,
  createFetchTrace,
  markFetchPhase,
  withInFlightCleanup,
} from './fetchLifecycleDiagnostics.js';
import { selectPrefetchedSectionItems } from '../adapters/sectionsSnapshotFetcher.js';

async function testCleanupOnReturn() {
  const map = new Map([['india', Promise.resolve()]]);
  const result = await withInFlightCleanup(map, 'india', null, async () => ['ok']);
  assert.deepEqual(result, ['ok']);
  assert.equal(map.has('india'), false);
}

async function testCleanupOnFailure() {
  const map = new Map([['india', Promise.resolve()]]);
  let failed = false;
  try {
    await withInFlightCleanup(map, 'india', null, async () => { failed = true; return Promise.reject('x'); });
  } catch {
    assert.equal(failed, true);
  }
  assert.equal(map.has('india'), false);
}

function testStaleFallbackKeepsRows() {
  const old = Date.now() - 72 * 60 * 60 * 1000;
  const snapshot = {
    schemaVersion: 2,
    fetchedAt: old,
    sections: {
      india: [{ title: 'Old but usable', id: 'a', publishedAt: old }],
    },
    sectionQuality: { india: { status: 'stale' } },
  };
  const result = selectPrefetchedSectionItems(snapshot, 'india', 5);
  assert.equal(result.items.length, 1);
  assert.equal(result.stale, true);
  assert.equal(result.staleReason, 'sections_snapshot_stale');
}

function testDiagnostics() {
  const trace = createFetchTrace({ datasetId: 'sections', section: 'india', fetchMode: 'hybrid', nowMs: 1000 });
  markFetchPhase(trace, 'snapshot-fetch', { itemCount: 3 }, 1015);
  const rows = [{ title: 'A' }];
  const result = attachFetchDiagnostics(rows, trace, { servedFrom: SERVED_FROM.STATIC_SNAPSHOT, ageMs: 100 });
  assert.equal(result.servedFrom, SERVED_FROM.STATIC_SNAPSHOT);
  assert.equal(result.fetchDiagnostics.phases[0].phase, 'snapshot-fetch');
}

await testCleanupOnReturn();
await testCleanupOnFailure();
testStaleFallbackKeepsRows();
testDiagnostics();

console.log('PASS: RSS Hybrid fetch lifecycle guardrails');
