import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`[NW-DP-013 static] FAIL: ${message}`);
    process.exitCode = 1;
  }
}

const worker = read('cloudflare/upahead-dataset-api/src/index.js');
const smoke = read('scripts/smoke_up_ahead_edge_api.mjs');
const report = read('reports/NW-DP-013_up_ahead_edge_cors_exposed_headers.md');

assert(worker.includes('Access-Control-Expose-Headers'), 'Worker must emit Access-Control-Expose-Headers');
assert(worker.includes('EXPOSED_DIAGNOSTIC_HEADERS'), 'Worker must define deterministic exposed diagnostics header list');
['X-NW-UpAhead-Source', 'X-NW-UpAhead-Reason', 'X-NW-UpAhead-Freshness', 'X-NW-UpAhead-Age-Seconds'].forEach(header => {
  assert(worker.includes(header), `Worker must include ${header}`);
});
assert(worker.includes("'Access-Control-Allow-Origin': '*'"), 'Worker must preserve Access-Control-Allow-Origin: *');
assert(worker.includes("'Access-Control-Allow-Methods': 'GET, OPTIONS'"), 'Worker must preserve Access-Control-Allow-Methods: GET, OPTIONS');
assert(worker.includes("'Access-Control-Allow-Headers': 'Content-Type'"), 'Worker must preserve Access-Control-Allow-Headers: Content-Type');
assert(worker.includes("const UP_AHEAD_DATASET_PATH = '/api/datasets/upAhead'"), 'Endpoint path must remain /api/datasets/upAhead');
assert(worker.includes('Cache-Control') && worker.includes('no-cache'), 'Worker must preserve no-cache behavior');
assert(worker.includes("request.method === 'OPTIONS'"), 'Worker must preserve OPTIONS behavior');
assert(worker.includes("request.method !== 'GET'"), 'Worker must preserve method guard');
assert(worker.includes('status: 405'), 'Worker must preserve 405 behavior');
assert(worker.includes('status: 404'), 'Worker must preserve 404 behavior');
assert(worker.includes('missing_or_invalid_up_ahead_dataset'), 'Fallback marker must remain unchanged');
assert(smoke.includes('access-control-expose-headers'), 'Smoke must inspect Access-Control-Expose-Headers');
assert(smoke.includes('REQUIRED_EXPOSED_HEADERS'), 'Smoke must define required exposed headers');
['x-nw-upahead-source', 'x-nw-upahead-reason', 'x-nw-upahead-freshness', 'x-nw-upahead-age-seconds'].forEach(header => {
  assert(smoke.includes(header), `Smoke must validate exposed header ${header}`);
});
assert(smoke.includes('getExposeHeaderChecks(response, \'GET\')'), 'Smoke must verify GET exposed headers');
assert(smoke.includes('getExposeHeaderChecks(response, \'OPTIONS\')'), 'Smoke must verify OPTIONS exposed headers');
assert(smoke.includes('Access-Control-Expose-Headers includes'), 'Smoke must report exposed-header checks');

[
  '.github/workflows/deploy.yml',
  '.env.example',
  'vite.config.js',
  'src/runtime/runtimeCapabilities.js',
  'src/data/orchestrator/useDataset.js',
  'src/data/orchestrator/datasetPolicy.js',
  'src/data/datasets/upAheadDataset.js',
  'src/data/datasets/upAheadDatasetApiClient.js',
  'src/data/datasets/upAheadProviderPolicy.js',
  'src/services/upAheadService.js',
  'src/services/intelligentUpAheadFetcher.js',
  'src/services/rssAggregator.js',
  'scripts/server.py',
].forEach(path => assert(fs.existsSync(path), `Forbidden-file guard could not inspect ${path}`));

assert(report.includes('NW-DP-013') && report.includes('Non-goals'), 'Report must document NW-DP-013 and Non-goals');

if (!process.exitCode) {
  console.log('[NW-DP-013 static] PASS');
}
