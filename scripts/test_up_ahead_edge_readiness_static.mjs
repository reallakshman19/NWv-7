import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function readJson(path) {
  return JSON.parse(read(path));
}

function assert(condition, message) {
  if (!condition) {
    console.error(`[NW-DP-025 static] FAIL: ${message}`);
    process.exitCode = 1;
  }
}

const pkg = readJson('package.json');
const readiness = read('scripts/check_up_ahead_edge_readiness.mjs');
const deployment = read('cloudflare/upahead-dataset-api/DEPLOYMENT.md');
const report = read('reports/NW-DP-025_up_ahead_edge_readiness.md');

assert(fs.existsSync('scripts/check_up_ahead_edge_readiness.mjs'), 'Readiness command must exist');
assert(pkg.scripts?.['test:upahead-edge-readiness'] === 'node scripts/check_up_ahead_edge_readiness.mjs', 'Package script test:upahead-edge-readiness must delegate to readiness command');
assert(readiness.includes('node:child_process'), 'Readiness command must use Node child_process built-in');
assert(readiness.includes('spawn('), 'Readiness command must run commands through spawn');
assert(readiness.includes('shell: false'), 'Readiness command must avoid shell execution');
assert(readiness.includes('scripts/verify_up_ahead_edge_activation_config.mjs'), 'Readiness command must run activation config verifier');
assert(readiness.includes("'--allow-empty'"), 'Readiness command must default to allow-empty no-network config validation');
assert(readiness.includes('scripts/run_up_ahead_edge_api_tests.mjs'), 'Readiness command must run edge API runner');
assert(readiness.includes('--require-config'), 'Readiness command must support --require-config');
assert(readiness.includes('--smoke'), 'Readiness command must support --smoke');
assert(readiness.includes('options.requireConfig') && readiness.includes('!options.requireConfig'), 'Readiness command must remove allow-empty when config is required');
assert(readiness.includes('options.smoke') && readiness.includes("args.push('--smoke')"), 'Readiness command must forward optional smoke flag');
assert(readiness.includes('Unknown argument'), 'Readiness command must reject unknown arguments');
assert(readiness.includes('runUpAheadEdgeReadiness'), 'Readiness command must expose a testable runner function');
assert(deployment.includes('test:upahead-edge-readiness'), 'Deployment runbook must reference readiness command');
assert(deployment.includes('--require-config'), 'Deployment runbook must document require-config mode');
assert(deployment.includes('--smoke'), 'Deployment runbook must document optional smoke mode');
assert(deployment.includes('no-network'), 'Deployment runbook must document no-network default behavior');
assert(report.includes('NW-DP-025') && report.includes('Non-goals'), 'Report must document NW-DP-025 and Non-goals');

[
  'scripts/verify_up_ahead_edge_activation_config.mjs',
  'scripts/run_up_ahead_edge_api_tests.mjs',
  'cloudflare/upahead-dataset-api/src/index.js',
  'src/data/datasets/upAheadDataset.js',
  'src/data/datasets/upAheadDatasetApiClient.js',
  'src/runtime/runtimeCapabilities.js',
  'src/services/upAheadService.js',
  'scripts/server.py',
].forEach(path => assert(fs.existsSync(path), `Scope guard could not inspect ${path}`));

if (!process.exitCode) {
  console.log('[NW-DP-025 static] PASS');
}
