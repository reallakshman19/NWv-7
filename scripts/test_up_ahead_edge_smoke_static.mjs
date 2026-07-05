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
const workerPath = 'cloudflare/upahead-dataset-api/src/index.js';
const deploymentPath = 'cloudflare/upahead-dataset-api/DEPLOYMENT.md';
const reportPath = 'reports/NW-DP-009_up_ahead_edge_smoke_verification.md';

assert(fs.existsSync(smokePath), 'Smoke script must exist');
assert(fs.existsSync(workerPath), 'Worker source must exist');
assert(fs.existsSync(reportPath), 'Report must exist');

const smoke = read(smokePath);
const worker = read(workerPath);
const deployment = read(deploymentPath);
const report = read(reportPath);

assert(smoke.includes('UP_AHEAD_API_BASE_URL'), 'Smoke script must accept UP_AHEAD_API_BASE_URL');
assert(smoke.includes('argv[2]'), 'Smoke script must accept CLI argument');
assert(smoke.includes("const ENDPOINT_PATH = '/api/datasets/upAhead'"), 'Smoke script must append exact endpoint path');
assert(smoke.includes('remove /api/datasets/upAhead') || smoke.includes('remove ${ENDPOINT_PATH}'), 'Smoke script must reject endpoint path in base URL');
assert(smoke.includes("method: 'GET'"), 'Smoke script must verify GET');
assert(smoke.includes('response.status === 200'), 'Smoke script must check GET status 200');
assert(smoke.includes('content-type') && smoke.includes('application/json'), 'Smoke script must check JSON content type');
assert(smoke.includes('cache-control') && smoke.includes('no-cache'), 'Smoke script must check no-cache header');
assert(smoke.includes('access-control-allow-origin'), 'Smoke script must check Access-Control-Allow-Origin');
assert(smoke.includes("method: 'OPTIONS'"), 'Smoke script must verify OPTIONS');
assert(smoke.includes('response.status === 200 || response.status === 204'), 'Smoke script must allow OPTIONS 200 or 204');
assert(smoke.includes('access-control-allow-methods'), 'Smoke script must check allowed methods');
assert(smoke.includes("methods.includes('GET')"), 'Smoke script must check GET method allowed');
assert(smoke.includes("methods.includes('OPTIONS')"), 'Smoke script must check OPTIONS method allowed');

['timeline', 'sections', 'weekly_plan', 'auditSummary', 'dropReport'].forEach(key => {
  assert(smoke.includes(key), `Smoke script must validate JSON key: ${key}`);
});

assert(smoke.includes('url.search =') && smoke.includes('url.hash ='), 'Smoke script must strip query/hash from input');
assert(smoke.includes('Result:') && smoke.includes('PASS') && smoke.includes('FAIL'), 'Smoke script must print PASS/FAIL summary');
assert(!/https:\/\/[^<\s`"']+\.workers\.dev/i.test(smoke), 'Smoke script must not contain a real workers.dev URL');
assert(!/account_id|zone_id|api_token|CLOUDFLARE_API_TOKEN|secret/i.test(smoke), 'Smoke script must not contain account/token/secret patterns');

assert(worker.includes("'/api/datasets/upAhead'"), 'Worker source must remain aligned with endpoint path');
assert(deployment.includes('UP_AHEAD_API_BASE_URL=https://<deployed-worker-host> node scripts/smoke_up_ahead_edge_api.mjs'), 'DEPLOYMENT.md must reference smoke command');
assert(report.includes('NW-DP-009') && report.includes('Non-goals'), 'Report must document NW-DP-009 and Non-goals');

[
  '.github/workflows/deploy.yml',
  '.env.example',
  'vite.config.js',
  'cloudflare/upahead-dataset-api/src/index.js',
  'cloudflare/upahead-dataset-api/wrangler.toml.example',
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
