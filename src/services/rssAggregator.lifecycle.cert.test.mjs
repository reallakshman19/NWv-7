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
import {
  SECTION_SNAPSHOT_FOREGROUND_BUDGET_MS,
  SECTION_SNAPSHOT_RETRY_BACKOFF_MS,
  selectPrefetchedSectionItems,
} from '../adapters/sectionsSnapshotFetcher.js';

const THIS_CERT = path.normalize('src/services/rssAggregator.lifecycle.cert.test.mjs');

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
  const result = attachFetchDiagnostics(rows, trace, {
    servedFrom: SERVED_FROM.STATIC_SNAPSHOT,
    ageMs: 100,
    snapshotBudgetExceeded: true,
    snapshotElapsedMs: 1501,
    snapshotBudgetMs: 1500,
    liveRssAttempted: true,
    liveRssDurationMs: 300,
    failedFeedCount: 1,
    successfulFeedCount: 2,
    timedOutFeedCount: 0,
    proxyFallbackReason: 'test',
  });
  assert.equal(result.servedFrom, SERVED_FROM.STATIC_SNAPSHOT);
  assert.equal(result.fetchDiagnostics.phases[0].phase, 'snapshot-fetch');
  assert.equal(result.fetchDiagnostics.snapshotBudgetExceeded, true);
  assert.equal(result.snapshotBudgetMs, 1500);
  assert.equal(result.fetchDiagnostics.liveRssAttempted, true);
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

function testDirectCallersUseCanonicalAggregator() {
  const newsContext = readRepoFile('src/context/NewsContext.jsx');
  const virtualPaper = readRepoFile('src/services/virtualPaperService.js');
  assert.match(newsContext, /from '..\/services\/rssAggregator'/);
  assert.match(virtualPaper, /from '.\/rssAggregator'/);
}

function testNoLifecycleFetcherReferencesRemain() {
  assert.equal(fs.existsSync('src/services/rssSectionLifecycleFetcher.js'), false);
  const files = listFiles('src')
    .filter(file => /\.(js|jsx|mjs|ts|tsx)$/.test(file))
    .filter(file => path.normalize(file) !== THIS_CERT);
  const hits = files.filter(file => readRepoFile(file).includes('rssSectionLifecycleFetcher'));
  assert.deepEqual(hits, []);
}

function testForegroundSnapshotBudgetIsBounded() {
  assert.equal(SECTION_SNAPSHOT_FOREGROUND_BUDGET_MS, 1500);
  assert.ok(SECTION_SNAPSHOT_RETRY_BACKOFF_MS.reduce((sum, ms) => sum + ms, 0) < SECTION_SNAPSHOT_FOREGROUND_BUDGET_MS);
  const src = readRepoFile('src/adapters/sectionsSnapshotFetcher.js');
  assert.match(src, /budgetMs = SECTION_SNAPSHOT_FOREGROUND_BUDGET_MS/);
  assert.match(src, /AbortController/);
  assert.match(src, /snapshot-budget-exceeded/);
  assert.doesNotMatch(src, /\[2000, 4000, 8000\]/);
}

function testLiveRssProxyBudgetIsBounded() {
  const proxy = readRepoFile('src/services/proxyManager.js');
  assert.match(proxy, /LIVE_RSS_PROXY_BUDGET_MS = 6000/);
  assert.match(proxy, /LIVE_RSS_PROXY_ATTEMPT_TIMEOUT_MS = 2000/);
  assert.match(proxy, /live-rss-budget-exceeded/);
  assert.match(proxy, /remainingBudgetMs/);
}

function testCanonicalHelperAddsRequiredPhases() {
  const helper = readRepoFile('src/services/fetchLifecycleDiagnostics.js');
  [
    'memory-cache-hit',
    'in-flight-wait',
    'hybrid-static-snapshot-start',
    'hybrid-static-snapshot-hit',
    'hybrid-stale-fallback',
    'hybrid-snapshot-budget-exceeded',
    'static-host-empty',
    'live-rss-start',
    'live-rss-feed-settled',
    'live-rss-timeout',
    'ranking-start',
    'ranking-complete',
    'ranking-fallback',
  ].forEach(phase => assert.match(helper, new RegExp(phase)));
}

function testBudgetExitDiagnosticsAreSurfaced() {
  const adapter = readRepoFile('src/adapters/sectionsSnapshotFetcher.js');
  const dataset = readRepoFile('src/data/datasets/sectionsDataset.js');
  const helper = readRepoFile('src/services/fetchLifecycleDiagnostics.js');
  assert.match(adapter, /consumeSectionsSnapshotBudgetExit/);
  assert.match(dataset, /attachBudgetExitDiagnostics/);
  assert.match(helper, /buildCanonicalSectionDiagnostics/);
  assert.match(helper, /liveRssAttempted/);
  assert.match(helper, /timedOutFeedCount/);
}

function testAggregatePerformanceSummaryExists() {
  const dataset = readRepoFile('src/data/datasets/sectionsDataset.js');
  assert.match(dataset, /performanceSummary: getPerformanceSummary\(summaries\)/);
  assert.match(dataset, /totalSectionFetchDurationMs/);
  assert.match(dataset, /slowestSection/);
  assert.match(dataset, /servedFromCounts/);
  assert.match(dataset, /fallbackReasonCounts/);
  assert.match(dataset, /snapshotBudgetExitCount/);
  assert.match(dataset, /sectionFetchDurationMs/);
}

function testLiveModeStillBypassesSnapshot() {
  const src = readRepoFile('src/services/rssAggregator.js');
  assert.match(src, /if \(!isLiveMode\(\) && settings\.usePrefetchedSections !== false\)/);
}

function testNoGeneratedSnapshotFilesChanged() {
  const diffNameOnly = process.env.GITHUB_PR_CHANGED_FILES || '';
  assert.doesNotMatch(diffNameOnly, /public\/(newsdata|data)\//);
}

await testCleanupOnReturn();
await testCleanupOnFailure();
testStaleFallbackKeepsRows();
testDiagnostics();
testAggregatorPostMarkerCleanupWrapper();
testSectionsDatasetCanonicalPath();
testDirectCallersUseCanonicalAggregator();
testNoLifecycleFetcherReferencesRemain();
testForegroundSnapshotBudgetIsBounded();
testLiveRssProxyBudgetIsBounded();
testCanonicalHelperAddsRequiredPhases();
testBudgetExitDiagnosticsAreSurfaced();
testAggregatePerformanceSummaryExists();
testLiveModeStillBypassesSnapshot();
testNoGeneratedSnapshotFilesChanged();

console.log('PASS: RSS Hybrid fetch lifecycle guardrails');
