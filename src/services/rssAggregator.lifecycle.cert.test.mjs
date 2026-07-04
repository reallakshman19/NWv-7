import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  SERVED_FROM,
  attachFetchDiagnostics,
  createFetchTrace,
  markFetchPhase,
  withInFlightCleanup,
} from './fetchLifecycleDiagnostics.js';
import { selectPrefetchedSectionItems } from '../adapters/sectionsSnapshotFetcher.js';

function readRepoFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function listFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath, { withFileTypes: true }).flatMap(entry => {
    const nextPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) return listFiles(nextPath);
    return nextPath;
  });
}

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

function testAggregatorPostMarkerCleanupWrapper() {
  const src = readRepoFile('src/services/rssAggregator.js');
  const marker = 'inFlightFetches.set(cacheKey, inFlightPromise);';
  const markerIndex = src.indexOf(marker);
  const wrapperIndex = src.indexOf('return withInFlightCleanup(inFlightFetches, cacheKey, resolveInFlight, async () => {', markerIndex);
  const between = src.slice(markerIndex + marker.length, wrapperIndex);
  assert.ok(markerIndex > 0, 'rssAggregator must set in-flight marker');
  assert.ok(wrapperIndex > markerIndex, 'post-marker paths must enter cleanup wrapper');
  assert.doesNotMatch(between, /return\s+/, 'no post-marker return may precede cleanup wrapper');
}

function testSectionsDatasetCanonicalPath() {
  const src = readRepoFile('src/data/datasets/sectionsDataset.js');
  assert.match(src, /from '..\/..\/services\/rssAggregator\.js'/);
  assert.doesNotMatch(src, /rssSectionLifecycleFetcher/);
}

function testNoLifecycleFetcherReferencesRemain() {
  assert.equal(fs.existsSync('src/services/rssSectionLifecycleFetcher.js'), false);
  const files = listFiles('src').filter(file => /\.(js|jsx|mjs|ts|tsx)$/.test(file));
  const hits = files.filter(file => readRepoFile(file).includes('rssSectionLifecycleFetcher'));
  assert.deepEqual(hits, []);
}

await testCleanupOnReturn();
await testCleanupOnFailure();
testStaleFallbackKeepsRows();
testDiagnostics();
testAggregatorPostMarkerCleanupWrapper();
testSectionsDatasetCanonicalPath();
testNoLifecycleFetcherReferencesRemain();

console.log('PASS: RSS Hybrid fetch lifecycle guardrails');
