import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`[NW-DP-016 static] FAIL: ${message}`);
    process.exitCode = 1;
  }
}

const verifierPath = 'scripts/verify_up_ahead_edge_activation_config.mjs';
assert(fs.existsSync(verifierPath), 'Activation config verifier must exist');

const verifier = read(verifierPath);
const deployment = read('cloudflare/upahead-dataset-api/DEPLOYMENT.md');
const report = read('reports/NW-DP-016_up_ahead_edge_activation_config.md');

assert(verifier.includes('VITE_API_BASE_URL'), 'Verifier must check VITE_API_BASE_URL');
assert(verifier.includes('UP_AHEAD_API_BASE_URL'), 'Verifier must accept UP_AHEAD_API_BASE_URL');
assert(verifier.includes('process.argv.slice(2)') && verifier.includes('positional'), 'Verifier must accept CLI argument');
assert(verifier.includes('--allow-empty'), 'Verifier must support --allow-empty');
assert(verifier.includes('--smoke'), 'Verifier must support optional --smoke');
assert(verifier.includes("'/api/datasets/upAhead'"), 'Verifier must use exact endpoint path');
assert(verifier.includes('parsed.pathname.includes(ENDPOINT_PATH)'), 'Verifier must reject endpoint-in-base');
assert(verifier.includes('parsed.search'), 'Verifier must reject query string');
assert(verifier.includes('parsed.hash'), 'Verifier must reject hash fragment');
assert(verifier.includes("'http:'") && verifier.includes("'https:'"), 'Verifier must require http/https');
assert(verifier.includes('buildEndpointUrl') && verifier.includes('exactly once'), 'Verifier must build endpoint exactly once');
assert(verifier.includes("Network: ${smoke ? 'smoke requested' : 'not used'}"), 'Verifier must make no-network default visible');
assert(verifier.includes("await import('./smoke_up_ahead_edge_api.mjs')"), 'Verifier must integrate optional smoke harness dynamically');
assert(!verifier.includes('.workers.dev'), 'Verifier must not contain real Worker URL');
assert(!/https:\/\/[^<][^\s'"`]*\.workers\.dev/.test(verifier), 'Verifier must not contain deployed Worker URL');
assert(!/account[_-]?id|api[_-]?token|secret/i.test(verifier), 'Verifier must not contain account/token/secret patterns');
assert(deployment.includes('verify_up_ahead_edge_activation_config.mjs'), 'Deployment runbook must reference verifier');
assert(deployment.includes('VITE_API_BASE_URL=https://<deployed-worker-host> node scripts/verify_up_ahead_edge_activation_config.mjs'), 'Deployment runbook must show placeholder verifier command');

[
  'cloudflare/upahead-dataset-api/src/index.js',
  'cloudflare/upahead-dataset-api/wrangler.toml.example',
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
  'scripts/run_certification_gate.mjs',
].forEach(path => assert(fs.existsSync(path), `Forbidden-source guard could not inspect ${path}`));

assert(report.includes('NW-DP-016') && report.includes('Non-goals'), 'Report must document NW-DP-016 and Non-goals');

if (!process.exitCode) {
  console.log('[NW-DP-016 static] PASS');
}
