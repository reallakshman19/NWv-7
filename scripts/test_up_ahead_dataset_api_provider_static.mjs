import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`[NW-DP-004 static] FAIL: ${message}`);
    process.exitCode = 1;
  }
}

const dataset = read('src/data/datasets/upAheadDataset.js');
const policy = read('src/data/datasets/upAheadProviderPolicy.js');
const client = read('src/data/datasets/upAheadDatasetApiClient.js');
const report = read('reports/NW-DP-004_up_ahead_dataset_api_provider_chain.md');
const apiBranchIndex = dataset.indexOf('initialPolicy.shouldAttemptDatasetApi');
const staticBranchIndex = dataset.indexOf('initialPolicy.shouldReadStatic');

assert(
  dataset.includes("from './upAheadDatasetApiClient.js'"),
  'upAheadDataset.js must import the API client'
);

assert(
  apiBranchIndex >= 0 && staticBranchIndex >= 0 && apiBranchIndex < staticBranchIndex,
  'API provider branch must appear before static fallback branch in load flow'
);

assert(
  dataset.includes('providerDecision.shouldAttemptLive'),
  'browser live fetch must remain guarded by providerDecision.shouldAttemptLive'
);

assert(
  dataset.includes('upAheadDataset.api_attempted') && dataset.includes('upAheadDataset.api_loaded'),
  'dataset diagnostics must include API attempt/load events'
);

assert(
  policy.includes('shouldAttemptDatasetApi') && policy.includes('apiSkippedReason'),
  'provider policy must expose API attempt and skip decision fields'
);

assert(
  client.includes('/api/datasets/upAhead') && client.includes("cache: 'no-cache'"),
  'API client must use stable endpoint and no-cache fetch'
);

[
  'src/runtime/runtimeCapabilities.js',
  'src/data/orchestrator/useDataset.js',
  'src/data/orchestrator/datasetPolicy.js',
  'src/services/upAheadService.js',
  'src/services/intelligentUpAheadFetcher.js',
  'src/services/rssAggregator.js',
].forEach(path => assert(fs.existsSync(path), `Forbidden-file guard could not inspect ${path}`));

assert(report.includes('NW-DP-004') && report.includes('Non-goals'), 'report must document NW-DP-004 and Non-goals');

if (!process.exitCode) {
  console.log('[NW-DP-004 static] PASS');
}
