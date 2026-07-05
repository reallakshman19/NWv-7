import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`[NW-DP-008 static] FAIL: ${message}`);
    process.exitCode = 1;
  }
}

const runbookPath = 'cloudflare/upahead-dataset-api/DEPLOYMENT.md';
const readmePath = 'cloudflare/upahead-dataset-api/README.md';
const workerPath = 'cloudflare/upahead-dataset-api/src/index.js';
const wranglerPath = 'cloudflare/upahead-dataset-api/wrangler.toml.example';

assert(fs.existsSync(runbookPath), 'DEPLOYMENT.md must exist');
assert(fs.existsSync(workerPath), 'Worker source must exist');
assert(fs.existsSync(wranglerPath), 'wrangler.toml.example must exist');

const runbook = read(runbookPath);
const readme = read(readmePath);
const worker = read(workerPath);
const wrangler = read(wranglerPath);
const report = read('reports/NW-DP-008_up_ahead_edge_activation_runbook.md');

[
  'Purpose',
  'Prerequisites',
  'Local configuration',
  'Local validation',
  'Manual deployment',
  'GitHub repository variable activation',
  'Post-deploy API verification',
  'Frontend verification',
  'Rollback / disable path',
  'Troubleshooting',
  'Non-goals',
].forEach(section => assert(runbook.includes(`## ${section}`), `Runbook missing section: ${section}`));

assert(runbook.includes('cp wrangler.toml.example wrangler.toml'), 'Runbook must include local wrangler copy command');
assert(runbook.includes('UP_AHEAD_DATASET_URL = "https://<github-pages-host>/data/up_ahead.json"'), 'Runbook must include upstream placeholder');
assert(runbook.includes('wrangler.toml should remain local and uncommitted'), 'Runbook must keep wrangler.toml local/uncommitted');
assert(runbook.includes('npx wrangler dev'), 'Runbook must include wrangler dev');
assert(runbook.includes('npx wrangler deploy'), 'Runbook must include wrangler deploy');
assert(runbook.includes('curl -i http://127.0.0.1:<port>/api/datasets/upAhead'), 'Runbook must include local API curl verification');
assert(runbook.includes('curl -i https://<deployed-worker-host>/api/datasets/upAhead'), 'Runbook must include deployed API curl verification');
assert(runbook.includes('curl -i -X OPTIONS https://<deployed-worker-host>/api/datasets/upAhead'), 'Runbook must include deployed OPTIONS verification');
assert(runbook.includes('Name: VITE_API_BASE_URL'), 'Runbook must include VITE_API_BASE_URL variable setup');
assert(runbook.includes('Do not include `/api/datasets/upAhead` in `VITE_API_BASE_URL`'), 'Runbook must warn not to include endpoint path');
assert(runbook.includes('VITE_BACKEND_URL') && runbook.includes('backward-compatible fallback'), 'Runbook must mention VITE_BACKEND_URL only as fallback');
assert(runbook.includes('clearing or removing the GitHub Actions repository variable'), 'Runbook must include rollback by clearing variable');
assert(runbook.includes('Access-Control-Allow-Methods: GET, OPTIONS'), 'Runbook must verify preflight methods');
assert(runbook.includes('timeline, sections, weekly_plan, auditSummary, dropReport'), 'Runbook must verify JSON shape');

const forbiddenConcreteValues = [
  /account_id\s*=/i,
  /zone_id\s*=/i,
  /api_token\s*=/i,
  /CLOUDFLARE_API_TOKEN/i,
  /https:\/\/[^<\s`"]+\.workers\.dev/i,
];
forbiddenConcreteValues.forEach(pattern => assert(!pattern.test(runbook), `Runbook contains forbidden concrete value pattern: ${pattern}`));

assert(readme.includes('DEPLOYMENT.md'), 'README must link to DEPLOYMENT.md');
assert(worker.includes("'/api/datasets/upAhead'"), 'Worker source must still expose aligned endpoint');
assert(wrangler.includes('https://<github-pages-host>/data/up_ahead.json'), 'Wrangler example must retain placeholder upstream');
assert(!wrangler.includes('account_id') && !wrangler.includes('zone_id') && !wrangler.includes('routes ='), 'Wrangler example must remain placeholder-only');

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

assert(report.includes('NW-DP-008') && report.includes('Non-goals'), 'Report must document NW-DP-008 and Non-goals');

if (!process.exitCode) {
  console.log('[NW-DP-008 static] PASS');
}
