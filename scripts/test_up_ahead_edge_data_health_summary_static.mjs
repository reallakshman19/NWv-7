import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`[NW-DP-020 static] FAIL: ${message}`);
    process.exitCode = 1;
  }
}

const panel = read('src/components/DataHealthPanel.jsx');
const test = read('src/components/DataHealthPanel.cert.test.jsx');
const report = read('reports/NW-DP-020_up_ahead_edge_data_health_summary.md');

assert(panel.includes('getLatestUpAheadEdgeDiagnostics'), 'DataHealthPanel must derive latest Up Ahead edge diagnostics');
assert(panel.includes('upAheadDataset.api_edge_diagnostics'), 'DataHealthPanel must reference Up Ahead edge diagnostics event');
assert(panel.includes('latestUpAheadEdgeDiagnostics'), 'DataHealthPanel must store latest edge diagnostics for card rendering');
assert(panel.includes("datasetId === 'upAhead'"), 'Edge summary must be restricted to upAhead dataset card');
assert(panel.includes('EdgeApiSummary'), 'DataHealthPanel must render EdgeApiSummary');
assert(panel.includes('Edge API'), 'Edge summary must be labeled Edge API');
['Source:', 'Reason:', 'Freshness:', 'Age seconds:'].forEach(label => {
  assert(panel.includes(label), `Edge summary must render ${label}`);
});
assert(panel.includes('DiagnosticDetails') && panel.includes('item.details'), 'Recent diagnostics detail rendering must remain present');
assert(panel.includes('diagnostics,'), 'Export payload must still include diagnostics');
assert(panel.includes('datasets: cachedEnvelopes.map'), 'Export payload must still include dataset summaries');
assert(panel.includes('Clear diagnostics'), 'Clear diagnostics control must remain present');
assert(panel.includes('Export JSON'), 'Export JSON control must remain present');
assert(test.includes('derives latest Up Ahead edge diagnostics for the dataset card'), 'Cert test must verify latest edge derivation');
assert(test.includes('renders a pinned Edge API summary with edge metadata fields'), 'Cert test must verify pinned Edge API summary');
assert(test.includes('keeps diagnostics in export payload'), 'Cert test must verify export payload remains intact');

[
  'src/data/datasets/upAheadDataset.js',
  'src/data/datasets/upAheadDatasetApiClient.js',
  'cloudflare/upahead-dataset-api/src/index.js',
  'src/runtime/runtimeCapabilities.js',
  'src/services/upAheadService.js',
  'scripts/server.py',
].forEach(path => assert(fs.existsSync(path), `Forbidden-source guard could not inspect ${path}`));

assert(report.includes('NW-DP-020') && report.includes('Non-goals'), 'Report must document NW-DP-020 and Non-goals');

if (!process.exitCode) {
  console.log('[NW-DP-020 static] PASS');
}
