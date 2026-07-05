import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`[NW-DP-007 static] FAIL: ${message}`);
    process.exitCode = 1;
  }
}

const workerPath = 'cloudflare/upahead-dataset-api/src/index.js';
const wranglerPath = 'cloudflare/upahead-dataset-api/wrangler.toml.example';
const readmePath = 'cloudflare/upahead-dataset-api/README.md';

assert(fs.existsSync(workerPath), 'Worker file must exist');
assert(fs.existsSync(wranglerPath), 'wrangler.toml.example must exist');
assert(fs.existsSync(readmePath), 'Worker README must exist');

const worker = read(workerPath);
const wrangler = read(wranglerPath);
const readme = read(readmePath);
const client = read('src/data/datasets/upAheadDatasetApiClient.js');
const server = read('scripts/server.py');
const report = read('reports/NW-DP-007_up_ahead_edge_api_host.md');

assert(worker.includes("'/api/datasets/upAhead'"), 'Worker must route /api/datasets/upAhead');
assert(worker.includes('UP_AHEAD_DATASET_URL'), 'Worker must read UP_AHEAD_DATASET_URL');
assert(worker.includes('missing_or_invalid_up_ahead_dataset'), 'Worker must include structured fallback marker');
assert(worker.includes('Access-Control-Allow-Origin'), 'Worker must send CORS allow-origin header');
assert(worker.includes("request.method === 'OPTIONS'"), 'Worker must handle OPTIONS preflight');
assert(worker.includes("request.method !== 'GET'"), 'Worker must guard unsupported methods');
assert(worker.includes('methodNotAllowedResponse') && worker.includes('status: 405'), 'Worker must return 405 for unsupported methods');
assert(worker.includes('notFoundResponse') && worker.includes('status: 404'), 'Worker must return 404 for unknown paths');
assert(worker.includes('export default') && worker.includes('async fetch(request, env)'), 'Worker must use module-worker fetch export');
assert(worker.includes('Cache-Control') && worker.includes('no-cache'), 'Worker must include no-cache response behavior');

assert(wrangler.includes('name = "upahead-dataset-api"'), 'Wrangler example must include placeholder worker name');
assert(wrangler.includes('main = "src/index.js"'), 'Wrangler example must point to src/index.js');
assert(wrangler.includes('compatibility_date'), 'Wrangler example must include compatibility_date');
assert(wrangler.includes('https://<github-pages-host>/data/up_ahead.json'), 'Wrangler example must use placeholder upstream URL');
assert(!wrangler.includes('account_id') && !wrangler.includes('zone_id') && !wrangler.includes('routes ='), 'Wrangler example must not include account, zone, or route IDs');

assert(readme.includes('VITE_API_BASE_URL'), 'README must document VITE_API_BASE_URL');
assert(readme.includes('Do not include `/api/datasets/upAhead`'), 'README must say base URL excludes endpoint path');
assert(readme.includes('R2') && readme.includes('not use R2'), 'README must document R2 is not used');
assert(client.includes("const UP_AHEAD_DATASET_API_PATH = '/api/datasets/upAhead'"), 'DP-004 client path must remain aligned');
assert(server.includes("UP_AHEAD_DATASET_ENDPOINT = '/api/datasets/upAhead'"), 'DP-005 server endpoint must remain aligned');

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

assert(report.includes('NW-DP-007') && report.includes('Non-goals'), 'report must document NW-DP-007 and Non-goals');

if (!process.exitCode) {
  console.log('[NW-DP-007 static] PASS');
}
