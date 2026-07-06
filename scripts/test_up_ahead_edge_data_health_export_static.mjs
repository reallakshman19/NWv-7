import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`[NW-DP-022 static] FAIL: ${message}`);
    process.exitCode = 1;
  }
}

const panel = read('src/components/DataHealthPanel.jsx');
const test = read('src/components/DataHealthPanel.cert.test.jsx');
const report = read('reports/NW-DP-022_up_ahead_edge_data_health_export.md');

assert(panel.includes('buildEdgeApiDiagnosticsExport'), 'DataHealthPanel must build edge diagnostics export summary');
assert(panel.includes('edgeApiDiagnostics'), 'Export dataset summary must include edgeApiDiagnostics');
assert(panel.includes('getLatestUpAheadEdgeDiagnostics'), 'Export summary must use latest edge diagnostics helper');
assert(panel.includes('latestUpAheadEdgeDiagnostics'), 'Export summary must use latestUpAheadEdgeDiagnostics value');
assert(panel.includes("datasetId === 'upAhead'"), 'Edge diagnostics export must be scoped to upAhead dataset');
['source', 'reason', 'freshness', 'ageSeconds'].forEach(field => {
  assert(panel.includes(`${field}: formatDiagnosticValue(details.${field})`), `edgeApiDiagnostics must include ${field}`);
});
assert(panel.includes('diagnostics,'), 'Global diagnostics array must remain exported');
assert(panel.includes('datasets: cachedEnvelopes.map'), 'Dataset summaries must remain exported');
['payloadHash', 'fetchedAt', 'lastGoodAt', 'validation', 'slo', 'error'].forEach(field => {
  assert(panel.includes(`${field}: envelope?.${field}`), `Existing dataset summary field must remain exported: ${field}`);
});
assert(test.includes('exports Up Ahead edge diagnostics in the dataset summary'), 'Cert test must verify edge diagnostics export');
assert(test.includes('keeps existing dataset export summary fields'), 'Cert test must verify existing export fields');
assert(report.includes('NW-DP-022') && report.includes('Non-goals'), 'Report must document NW-DP-022 and Non-goals');

[
  'src/data/datasets/upAheadDataset.js',
  'src/data/datasets/upAheadDatasetApiClient.js',
  'cloudflare/upahead-dataset-api/src/index.js',
  'src/runtime/runtimeCapabilities.js',
  'src/services/upAheadService.js',
  'scripts/server.py',
].forEach(path => assert(fs.existsSync(path), `Forbidden-source guard could not inspect ${path}`));

if (!process.exitCode) {
  console.log('[NW-DP-022 static] PASS');
}
