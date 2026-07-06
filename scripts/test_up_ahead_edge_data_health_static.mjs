import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`[NW-DP-019 static] FAIL: ${message}`);
    process.exitCode = 1;
  }
}

const panel = read('src/components/DataHealthPanel.jsx');
const test = read('src/components/DataHealthPanel.cert.test.jsx');
const report = read('reports/NW-DP-019_up_ahead_edge_data_health.md');

assert(panel.includes('DiagnosticDetails'), 'DataHealthPanel must render diagnostics details');
assert(panel.includes('getDiagnosticDetailEntries'), 'DataHealthPanel must normalize diagnostic detail entries');
assert(panel.includes('item.details'), 'DataHealthPanel must pass diagnostics details to renderer');
assert(panel.includes('EDGE_DIAGNOSTIC_FIELDS'), 'DataHealthPanel must explicitly order edge diagnostic fields');
['source', 'reason', 'freshness', 'ageSeconds'].forEach(field => {
  assert(panel.includes(field), `DataHealthPanel must render field ${field}`);
});
assert(panel.includes('diagnostics,'), 'Export payload must still include diagnostics');
assert(panel.includes('datasets: cachedEnvelopes.map'), 'Export payload must still include dataset summaries');
assert(panel.includes('Clear diagnostics'), 'Clear diagnostics control must remain present');
assert(panel.includes('Export JSON'), 'Export JSON control must remain present');
assert(test.includes('renders diagnostics details safely'), 'Cert test must verify details rendering');
assert(test.includes('prioritizes Up Ahead edge diagnostics fields'), 'Cert test must verify edge fields');
assert(test.includes('keeps diagnostics in export payload'), 'Cert test must verify diagnostics export');

[
  'src/data/datasets/upAheadDataset.js',
  'src/data/datasets/upAheadDatasetApiClient.js',
  'cloudflare/upahead-dataset-api/src/index.js',
  'src/runtime/runtimeCapabilities.js',
  'src/services/upAheadService.js',
  'scripts/server.py',
].forEach(path => assert(fs.existsSync(path), `Forbidden-source guard could not inspect ${path}`));

assert(report.includes('NW-DP-019') && report.includes('Non-goals'), 'Report must document NW-DP-019 and Non-goals');

if (!process.exitCode) {
  console.log('[NW-DP-019 static] PASS');
}
