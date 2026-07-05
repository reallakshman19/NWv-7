import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`[NW-DP-010 static] FAIL: ${message}`);
    process.exitCode = 1;
  }
}

const worker = read('cloudflare/upahead-dataset-api/src/index.js');
const smoke = read('scripts/smoke_up_ahead_edge_api.mjs');
const report = read('reports/NW-DP-010_up_ahead_edge_payload_contract.md');

assert(worker.includes('export function isObjectRecord'), 'Worker must define/export isObjectRecord');
assert(worker.includes('export function isValidUpAheadPayload'), 'Worker must define/export explicit payload validator');
assert(worker.includes('payload.timeline') && worker.includes('Array.isArray(payload.timeline)'), 'Worker must validate timeline array');
assert(worker.includes('payload.sections') && worker.includes('isObjectRecord(payload.sections)'), 'Worker must validate sections object');
assert(worker.includes('payload.weekly_plan') && worker.includes('Array.isArray(payload.weekly_plan)'), 'Worker must validate weekly_plan array');
assert(worker.includes('payload.auditSummary') && worker.includes('payload.auditSummary === null'), 'Worker must validate auditSummary object-or-null');
assert(worker.includes('payload.dropReport') && worker.includes('Array.isArray(payload.dropReport)'), 'Worker must validate dropReport array');
assert(worker.includes('!Array.isArray(value)'), 'Worker object validator must reject arrays');
assert(worker.includes('isValidUpAheadPayload(payload) ? payload : buildFallbackPayload()'), 'fetchUpAheadPayload must validate parsed JSON before returning it');
assert(worker.includes('missing_or_invalid_up_ahead_dataset'), 'Fallback marker must remain unchanged');
assert(worker.includes("const UP_AHEAD_DATASET_PATH = '/api/datasets/upAhead'"), 'Endpoint path must remain /api/datasets/upAhead');
assert(worker.includes('Cache-Control') && worker.includes('no-cache'), 'Worker must preserve no-cache behavior');
assert(worker.includes('Access-Control-Allow-Origin'), 'Worker must preserve CORS behavior');
assert(worker.includes("request.method === 'OPTIONS'"), 'Worker must preserve OPTIONS behavior');
assert(worker.includes("request.method !== 'GET'"), 'Worker must preserve method guard');
assert(worker.includes('status: 405'), 'Worker must preserve 405 behavior');
assert(worker.includes('status: 404'), 'Worker must preserve 404 behavior');
['timeline', 'sections', 'weekly_plan', 'auditSummary', 'dropReport'].forEach(key => {
  assert(smoke.includes(`'${key}'`), `Smoke script must still validate JSON key ${key}`);
});

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

assert(report.includes('NW-DP-010') && report.includes('Non-goals'), 'Report must document NW-DP-010 and Non-goals');

if (!process.exitCode) {
  console.log('[NW-DP-010 static] PASS');
}
