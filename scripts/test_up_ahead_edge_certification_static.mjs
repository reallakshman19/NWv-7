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
const runner = read('scripts/run_up_ahead_edge_api_tests.mjs');
const report = read('reports/NW-DP-015_up_ahead_edge_certification_wiring.md');
const dp018Report = read('reports/NW-DP-018_up_ahead_edge_dataset_diagnostics_certification.md');
const dp021Report = read('reports/NW-DP-021_up_ahead_edge_data_health_certification.md');
const dp023Report = read('reports/NW-DP-023_up_ahead_edge_data_health_export_certification.md');
const dp024Report = read('reports/NW-DP-024_up_ahead_edge_certification_runner.md');
const dp026Report = read('reports/NW-DP-026_up_ahead_edge_readiness_certification.md');

const edgeScript = pkg.scripts?.['test:upahead-edge-api'] || '';
assert(edgeScript === 'node scripts/run_up_ahead_edge_api_tests.mjs', 'test:upahead-edge-api must delegate to run_up_ahead_edge_api_tests.mjs');
assert(runner.includes('UP_AHEAD_EDGE_API_TEST_COMMANDS'), 'Runner must expose ordered edge API command list');
assert(runner.includes('node:child_process'), 'Runner must use Node child_process built-in');
assert(runner.includes('spawn('), 'Runner must execute commands through spawn');
assert(runner.includes('shell: false'), 'Runner must avoid shell execution');
assert(!runner.includes('npm run test:upahead-edge-readiness'), 'Runner must not recursively call readiness package script');
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
  'node scripts/test_up_ahead_edge_data_health_static.mjs',
  'node scripts/test_up_ahead_edge_data_health_summary_static.mjs',
  'node scripts/test_up_ahead_edge_data_health_export_static.mjs',
  'npx vitest run --config vitest.config.js src/components/DataHealthPanel.cert.test.jsx',
  'node scripts/test_up_ahead_edge_readiness_static.mjs',
].forEach(command => assert(runner.includes(command), `runner must include ${command}`));

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
  'scripts/run_up_ahead_edge_api_tests.mjs',
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
  'scripts/test_up_ahead_edge_data_health_static.mjs',
  'scripts/test_up_ahead_edge_data_health_summary_static.mjs',
  'scripts/test_up_ahead_edge_data_health_export_static.mjs',
  'scripts/test_up_ahead_edge_readiness_static.mjs',
  'src/components/DataHealthPanel.cert.test.jsx',
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
assert(dp021Report.includes('NW-DP-021') && dp021Report.includes('Non-goals'), 'Report must document NW-DP-021 and Non-goals');
assert(dp023Report.includes('NW-DP-023') && dp023Report.includes('Non-goals'), 'Report must document NW-DP-023 and Non-goals');
assert(dp024Report.includes('NW-DP-024') && dp024Report.includes('Non-goals'), 'Report must document NW-DP-024 and Non-goals');
assert(dp026Report.includes('NW-DP-026') && dp026Report.includes('Non-goals'), 'Report must document NW-DP-026 and Non-goals');

if (!process.exitCode) {
  console.log('[NW-DP-015 static] PASS');
}
