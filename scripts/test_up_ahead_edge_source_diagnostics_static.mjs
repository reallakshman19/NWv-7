import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`[NW-DP-011 static] FAIL: ${message}`);
    process.exitCode = 1;
  }
}

const worker = read('cloudflare/upahead-dataset-api/src/index.js');
const smoke = read('scripts/smoke_up_ahead_edge_api.mjs');
const report = read('reports/NW-DP-011_up_ahead_edge_source_diagnostics.md');

assert(worker.includes('X-NW-UpAhead-Source'), 'Worker must emit X-NW-UpAhead-Source');
assert(worker.includes('X-NW-UpAhead-Reason'), 'Worker must emit X-NW-UpAhead-Reason');
assert(worker.includes("source = 'upstream'") && worker.includes("reason = 'ok'"), 'Worker must distinguish upstream ok result');
['missing-url', 'fetch-error', 'upstream-non-ok', 'invalid-json', 'invalid-shape'].forEach(reason => {
  assert(worker.includes(reason), `Worker must include reason ${reason}`);
});
assert(worker.includes('datasetJsonResponse') && worker.includes('[SOURCE_HEADER]') && worker.includes('[REASON_HEADER]'), 'Worker must set diagnostics through response headers');
assert(!worker.includes('headers.set(SOURCE_HEADER, upstreamUrl)'), 'Worker must not expose UP_AHEAD_DATASET_URL value in headers');
assert(worker.includes("const UP_AHEAD_DATASET_PATH = '/api/datasets/upAhead'"), 'Endpoint path must remain /api/datasets/upAhead');
assert(worker.includes('Access-Control-Allow-Origin'), 'Worker must preserve CORS behavior');
assert(worker.includes('Cache-Control') && worker.includes('no-cache'), 'Worker must preserve no-cache behavior');
assert(worker.includes("request.method === 'OPTIONS'"), 'Worker must preserve OPTIONS behavior');
assert(worker.includes("request.method !== 'GET'"), 'Worker must preserve method guard');
assert(worker.includes('status: 405'), 'Worker must preserve 405 behavior');
assert(worker.includes('status: 404'), 'Worker must preserve 404 behavior');
assert(worker.includes('missing_or_invalid_up_ahead_dataset'), 'Fallback marker must remain unchanged');
assert(smoke.includes('x-nw-upahead-source') && smoke.includes('x-nw-upahead-reason'), 'Smoke must read diagnostics headers');
assert(smoke.includes('Source:') && smoke.includes('Reason:'), 'Smoke must report diagnostics headers');
assert(smoke.includes("'unknown'") && smoke.includes('allowed-or-unknown'), 'Smoke must accept absent diagnostics as unknown');
assert(smoke.includes('ALLOWED_SOURCES') && smoke.includes('ALLOWED_REASONS'), 'Smoke must validate diagnostics values');
assert(!smoke.includes("fallback' ? 'FAIL"), 'Smoke must not fail solely because source is fallback');

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

assert(report.includes('NW-DP-011') && report.includes('Non-goals'), 'Report must document NW-DP-011 and Non-goals');

if (!process.exitCode) {
  console.log('[NW-DP-011 static] PASS');
}
