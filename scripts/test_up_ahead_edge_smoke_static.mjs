import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`[NW-DP-009 static] FAIL: ${message}`);
    process.exitCode = 1;
  }
}

const smokePath = 'scripts/smoke_up_ahead_edge_api.mjs';
assert(fs.existsSync(smokePath), 'Smoke script must exist');

const smoke = read(smokePath);
const worker = read('cloudflare/upahead-dataset-api/src/index.js');
const deployment = read('cloudflare/upahead-dataset-api/DEPLOYMENT.md');
const report = read('reports/NW-DP-009_up_ahead_edge_smoke_verification.md');

assert(smoke.includes('UP_AHEAD_API_BASE_URL'), 'Smoke script must accept UP_AHEAD_API_BASE_URL');
assert(smoke.includes('process.argv[2]'), 'Smoke script must accept CLI base URL argument');
assert(smoke.includes("const ENDPOINT_PATH = '/api/datasets/upAhead'"), 'Smoke script must append exact endpoint path');
assert(smoke.includes('response.status === 200'), 'Smoke script must check GET status 200');
assert(smoke.includes("contentType.includes('application/json')"), 'Smoke script must check JSON content type');
assert(smoke.includes("cacheControl.includes('no-cache')"), 'Smoke script must check no-cache header');
assert(smoke.includes("cors.includes('*')"), 'Smoke script must check Access-Control-Allow-Origin');
assert(smoke.includes("method: 'OPTIONS'"), 'Smoke script must check OPTIONS');
assert(smoke.includes("methods.includes('GET')"), 'Smoke script must check OPTIONS allows GET');
assert(smoke.includes("methods.includes('OPTIONS')"), 'Smoke script must check OPTIONS allows OPTIONS');
['timeline', 'sections', 'weekly_plan', 'auditSummary', 'dropReport'].forEach(key => {
  assert(smoke.includes(`'${key}'`), `Smoke script must validate JSON key ${key}`);
});
assert(!smoke.includes('.workers.dev'), 'Smoke script must not contain real workers.dev URL');
assert(!/account[_-]?id|api[_-]?token|secret/i.test(smoke), 'Smoke script must not contain account/token/secret patterns');
assert(worker.includes("'/api/datasets/upAhead'"), 'Worker source must remain aligned with endpoint path');
assert(deployment.includes('scripts/smoke_up_ahead_edge_api.mjs'), 'DEPLOYMENT.md must reference smoke command');
assert(report.includes('NW-DP-009') && report.includes('Non-goals'), 'Report must document NW-DP-009 and Non-goals');

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

if (!process.exitCode) {
  console.log('[NW-DP-009 static] PASS');
}
