import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`[NW-DP-027 static] FAIL: ${message}`);
    process.exitCode = 1;
  }
}

const panel = read('src/components/DataHealthPanel.jsx');
const certTest = read('src/components/DataHealthPanel.cert.test.jsx');
const report = read('reports/NW-DP-027_up_ahead_edge_activation_status_panel.md');

assert(panel.includes('UpAheadEdgeActivationStatus'), 'DataHealthPanel must include Up Ahead activation status component');
assert(panel.includes('Up Ahead Edge Activation'), 'Activation panel title must be visible');
assert(panel.includes('Up Ahead Edge Activation status'), 'Activation panel must expose an accessible status label');
assert(panel.includes('Dataset API mode'), 'Activation panel must show dataset API mode');
assert(panel.includes('Worker/API base URL'), 'Activation panel must show Worker/API base URL status');
assert(panel.includes('ACTIVATION_STATUS_LABELS'), 'Activation panel must include status labels');
['configured', 'not configured', 'missing', 'unknown'].forEach(label => {
  assert(panel.includes(label), `Activation panel must include status label: ${label}`);
});
['Latest edge source', 'Latest edge reason', 'Latest edge freshness', 'Latest edge age seconds', 'Last diagnostics timestamp'].forEach(label => {
  assert(panel.includes(label), `Activation panel must show ${label}`);
});
assert(panel.includes('getLatestUpAheadEdgeDiagnosticEvent'), 'Activation panel must use latest edge diagnostic event');
assert(panel.includes('formatTime(diagnosticEvent?.ts)'), 'Activation panel must show latest diagnostics timestamp');
assert(panel.includes('getRuntimeCapabilities'), 'Activation panel must use existing runtime capability indicators');
assert(panel.includes('getDatasetApiModeStatus'), 'Activation panel must derive dataset API mode status');
assert(panel.includes('getWorkerBaseUrlStatus'), 'Activation panel must derive Worker/API base URL status');
assert(panel.includes('READINESS_COMMAND'), 'Activation panel must include readiness command constant');
assert(panel.includes('SMOKE_COMMAND'), 'Activation panel must include smoke command constant');
assert(panel.includes('npm run test:upahead-edge-readiness'), 'Activation panel must show readiness command');
assert(panel.includes('VITE_API_BASE_URL=https://<worker-host> npm run test:upahead-edge-readiness -- --require-config --smoke'), 'Activation panel must show smoke command');
assert(panel.includes('EdgeApiSummary'), 'Pinned Edge API summary must remain present');
assert(panel.includes('DiagnosticDetails'), 'Diagnostics detail rendering must remain present');
assert(panel.includes('edgeApiDiagnostics'), 'Data Health edge export field must remain present');
assert(panel.includes('Clear diagnostics'), 'Clear diagnostics control must remain present');
assert(panel.includes('Export JSON'), 'Export JSON control must remain present');
assert(!panel.includes('fetch('), 'Activation panel must not introduce browser fetch path');
assert(!panel.includes('upAheadDatasetApiClient'), 'Activation panel must not import or call dataset API client');
assert(!panel.includes('smoke_up_ahead_edge_api'), 'Activation panel must not run browser-side smoke harness');
assert(!panel.includes('runUpAheadEdgeReadiness'), 'Activation panel must not run readiness command from browser');
assert(certTest.includes('renders Up Ahead Edge Activation status panel'), 'Cert test must cover activation panel rendering');
assert(certTest.includes('shows activation status labels without inventing unavailable URLs'), 'Cert test must cover status labels');
assert(certTest.includes('shows latest edge activation diagnostics and timestamp fields'), 'Cert test must cover latest edge diagnostics and timestamp');
assert(certTest.includes('shows operator readiness and smoke commands'), 'Cert test must cover operator commands');
assert(report.includes('NW-DP-027') && report.includes('Non-goals'), 'Report must document NW-DP-027 and Non-goals');

[
  'src/data/datasets/upAheadDataset.js',
  'src/data/datasets/upAheadDatasetApiClient.js',
  'cloudflare/upahead-dataset-api/src/index.js',
  'src/runtime/runtimeCapabilities.js',
  'src/services/upAheadService.js',
  'scripts/server.py',
].forEach(path => assert(fs.existsSync(path), `Scope guard could not inspect ${path}`));

if (!process.exitCode) {
  console.log('[NW-DP-027 static] PASS');
}
