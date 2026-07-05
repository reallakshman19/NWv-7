import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`[NW-DP-006 static] FAIL: ${message}`);
    process.exitCode = 1;
  }
}

const deploy = read('.github/workflows/deploy.yml');
const envExample = read('.env.example');
const viteConfig = read('vite.config.js');
const client = read('src/data/datasets/upAheadDatasetApiClient.js');
const server = read('scripts/server.py');
const report = read('reports/NW-DP-006_dataset_api_env_integration.md');

assert(deploy.includes('workflow_run:'), 'deploy workflow must preserve workflow_run trigger');
assert(deploy.includes('VITE_API_BASE_URL: ${{ vars.VITE_API_BASE_URL }}'), 'deploy build must expose VITE_API_BASE_URL from vars');
assert(deploy.includes('VITE_BACKEND_URL: ${{ vars.VITE_BACKEND_URL }}'), 'deploy build must expose VITE_BACKEND_URL from vars');
assert(deploy.includes('run: npm run build'), 'deploy workflow must preserve npm run build semantics');
assert(envExample.includes('VITE_API_BASE_URL='), '.env.example must document VITE_API_BASE_URL');
assert(envExample.includes('VITE_BACKEND_URL='), '.env.example must document VITE_BACKEND_URL');
assert(envExample.includes('preferred dataset API base URL'), '.env.example must mark VITE_API_BASE_URL preferred');
assert(envExample.includes('backward-compatible API base URL fallback'), '.env.example must document VITE_BACKEND_URL compatibility');
assert(envExample.includes('Do not include a trailing /api/datasets/upAhead path'), '.env.example must warn not to include endpoint path');
assert(envExample.includes('Leave unset to use static snapshot fallback'), '.env.example must document unset fallback');
assert(viteConfig.includes("'/api'") && viteConfig.includes("'http://127.0.0.1:3001'"), 'Vite /api proxy to local server must remain intact');
assert(client.includes("const UP_AHEAD_DATASET_API_PATH = '/api/datasets/upAhead'"), 'DP-004 client path must remain /api/datasets/upAhead');
assert(server.includes("UP_AHEAD_DATASET_ENDPOINT = '/api/datasets/upAhead'"), 'DP-005 server endpoint must remain /api/datasets/upAhead');

[
  'src/runtime/runtimeCapabilities.js',
  'src/data/orchestrator/useDataset.js',
  'src/data/orchestrator/datasetPolicy.js',
  'src/data/datasets/upAheadDataset.js',
  'src/data/datasets/upAheadProviderPolicy.js',
  'src/data/datasets/upAheadDatasetApiClient.js',
  'src/services/upAheadService.js',
  'src/services/intelligentUpAheadFetcher.js',
  'src/services/rssAggregator.js',
  'scripts/server.py',
].forEach(path => assert(fs.existsSync(path), `Forbidden-file guard could not inspect ${path}`));

assert(report.includes('NW-DP-006') && report.includes('Non-goals'), 'report must document NW-DP-006 and Non-goals');

if (!process.exitCode) {
  console.log('[NW-DP-006 static] PASS');
}
