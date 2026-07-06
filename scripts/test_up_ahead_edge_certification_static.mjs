import fs from 'node:fs';

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`[NW-DP-015 static] FAIL: ${message}`);
    process.exitCode = 1;
  }
}

const pkg = readJson('package.json');
const manifest = readJson('scripts/certification_manifest.json');
const report = read('reports/NW-DP-015_up_ahead_edge_certification_wiring.md');
const dp018Report = read('reports/NW-DP-018_up_ahead_edge_dataset_diagnostics_certification.md');

const edgeScript = pkg.scripts?.['test:upahead-edge-api'] || '';
assert(edgeScript, 'package.json must define test:upahead-edge-api');
[
  'node scripts/test_up_ahead_edge_worker_contract.mjs',
  'node scripts/test_up_ahead_edge_worker_contract_static.mjs',
  'node scripts/test_up_ahead_edge_cors_exposed_headers_static.mjs',
  'node scripts/test_up_ahead_edge_freshness_diagnostics_static.mjs',
  'node scripts/test_up_ahead_edge_source_diagnostics_static.mjs',
  'node scripts/test_up_ahead_edge_payload_contract_static.mjs',
  'node scripts/test_up_ahead_edge_smoke_static.mjs',
  'node scripts/test_up_ahead_edge_dataset_diagnostics_static.mjs',
  'npx vitest run --config vitest.config.js src/data/datasets/upAheadDatasetApiClient.cert.test.js src/data/datasets/upAheadDataset.providerChain.cert.test.js',
].forEach(command => assert(edgeScript.includes(command), `test:upahead-edge-api must include ${command}`));

const certificationScript = pkg.scripts?.['test:certification-manifest'] || '';
assert(certificationScript.startsWith('npm run test:upahead-edge-api && '), 'test:certification-manifest must run Up Ahead edge pack before manifest validators');
assert(certificationScript.includes('node scripts/test_certification_manifest_static.mjs'), 'test:certification-manifest must preserve static manifest validator');
assert(certificationScript.includes('node scripts/validate_certification_manifest.mjs'), 'test:certification-manifest must preserve manifest validator');

const manifestEntry = manifest.commands.find(entry => entry.id === 'certification-manifest');
assert(manifestEntry, 'certification manifest must include certification-manifest command');
assert(manifestEntry.cmd === 'npm', 'certification-manifest command must use npm');
assert(Array.isArray(manifestEntry.args) && manifestEntry.args.join(' ') === 'run test:certification-manifest', 'certification-manifest command must call npm run test:certification-manifest');
assert(Array.isArray(manifestEntry.requiredFor) && manifestEntry.requiredFor.includes('full'), 'certification-manifest command must be required for full profile');
assert(Array.isArray(manifestEntry.requiredFor) && manifestEntry.requiredFor.includes('workflow'), 'certification-manifest command must remain required for workflow profile');

[
  'scripts/test_up_ahead_edge_worker_contract.mjs',
  'scripts/test_up_ahead_edge_worker_contract_static.mjs',
  'scripts/test_up_ahead_edge_cors_exposed_headers_static.mjs',
  'scripts/test_up_ahead_edge_freshness_diagnostics_static.mjs',
  'scripts/test_up_ahead_edge_source_diagnostics_static.mjs',
  'scripts/test_up_ahead_edge_payload_contract_static.mjs',
  'scripts/test_up_ahead_edge_smoke_static.mjs',
  'scripts/test_up_ahead_edge_dataset_diagnostics_static.mjs',
  'src/data/datasets/upAheadDatasetApiClient.cert.test.js',
  'src/data/datasets/upAheadDataset.providerChain.cert.test.js',
].forEach(path => assert(fs.existsSync(path), `Expected edge test file must exist: ${path}`));

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
].forEach(path => assert(fs.existsSync(path), `Forbidden-source guard could not inspect ${path}`));

assert(report.includes('NW-DP-015') && report.includes('Non-goals'), 'Report must document NW-DP-015 and Non-goals');
assert(dp018Report.includes('NW-DP-018') && dp018Report.includes('Non-goals'), 'Report must document NW-DP-018 and Non-goals');

if (!process.exitCode) {
  console.log('[NW-DP-015 static] PASS');
}
