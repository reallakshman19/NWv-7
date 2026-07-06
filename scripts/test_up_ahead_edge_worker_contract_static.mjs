import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`[NW-DP-014 static] FAIL: ${message}`);
    process.exitCode = 1;
  }
}

const contractPath = 'scripts/test_up_ahead_edge_worker_contract.mjs';
assert(fs.existsSync(contractPath), 'Executable Worker contract test must exist');

const contract = read(contractPath);
const report = read('reports/NW-DP-014_up_ahead_edge_worker_contract_tests.md');

assert(contract.includes("import worker from '../cloudflare/upahead-dataset-api/src/index.js'"), 'Contract test must import Worker module');
assert(contract.includes('new Request'), 'Contract test must use real Request objects');
assert(contract.includes('globalThis.fetch'), 'Contract test must mock global fetch instead of using network access');
assert(contract.includes('valid upstream payload -> upstream/ok/fresh'), 'Contract test must cover valid upstream payload');
assert(contract.includes('missing upstream URL -> fallback/missing-url'), 'Contract test must cover missing upstream URL');
assert(contract.includes('upstream non-OK -> fallback/upstream-non-ok'), 'Contract test must cover upstream non-OK');
assert(contract.includes('JSON parse failure -> fallback/invalid-json'), 'Contract test must cover invalid JSON');
assert(contract.includes('invalid shape -> fallback/invalid-shape'), 'Contract test must cover invalid shape');
assert(contract.includes('stale valid payload -> stale freshness'), 'Contract test must cover stale payload');
assert(contract.includes('null lastUpdated -> unknown freshness'), 'Contract test must cover null lastUpdated');
assert(contract.includes('OPTIONS preflight -> CORS allow/expose headers'), 'Contract test must cover OPTIONS preflight');
assert(contract.includes('POST endpoint -> 405'), 'Contract test must cover POST 405');
assert(contract.includes('wrong path -> 404'), 'Contract test must cover wrong-path 404');
['X-NW-UpAhead-Source', 'X-NW-UpAhead-Reason', 'X-NW-UpAhead-Freshness', 'X-NW-UpAhead-Age-Seconds'].forEach(header => {
  assert(contract.includes(header), `Contract test must verify ${header}`);
});
assert(contract.includes('Access-Control-Expose-Headers') || contract.includes('access-control-expose-headers'), 'Contract test must verify exposed diagnostics headers');
assert(contract.includes('Content-Type') && contract.includes('application/json'), 'Contract test must verify JSON Content-Type');
assert(contract.includes('Cache-Control') && contract.includes('no-cache'), 'Contract test must verify no-cache behavior');
assert(contract.includes('missing_or_invalid_up_ahead_dataset'), 'Contract test must verify fallback marker');
assert(!contract.includes('fetch(') || contract.includes('globalThis.fetch'), 'Contract test must not perform unmocked network fetches');

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

assert(report.includes('NW-DP-014') && report.includes('Non-goals'), 'Report must document NW-DP-014 and Non-goals');

if (!process.exitCode) {
  console.log('[NW-DP-014 static] PASS');
}
