import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`[NW-DP-017 static] FAIL: ${message}`);
    process.exitCode = 1;
  }
}

const client = read('src/data/datasets/upAheadDatasetApiClient.js');
const provider = read('src/data/datasets/upAheadDataset.js');
const clientTest = read('src/data/datasets/upAheadDatasetApiClient.cert.test.js');
const providerTest = read('src/data/datasets/upAheadDataset.providerChain.cert.test.js');
const report = read('reports/NW-DP-017_up_ahead_edge_dataset_diagnostics.md');

assert(client.includes('fetchUpAheadDatasetApiResponse'), 'Client must expose metadata-aware response helper');
assert(client.includes('fetchUpAheadDatasetApiData'), 'Client must preserve plain JSON helper');
assert(client.includes('normalizeUpAheadEdgeDiagnostics'), 'Client must expose diagnostics normalizer');
['X-NW-UpAhead-Source', 'X-NW-UpAhead-Reason', 'X-NW-UpAhead-Freshness', 'X-NW-UpAhead-Age-Seconds'].forEach(header => {
  assert(client.includes(header), `Client must read ${header}`);
});
assert(client.includes("'unknown'"), 'Client must normalize absent headers to unknown');
assert(provider.includes('fetchUpAheadDatasetApiResponse'), 'Provider must use metadata-aware helper');
assert(provider.includes('upAheadDataset.api_edge_diagnostics'), 'Provider must push api_edge_diagnostics');
assert(provider.includes('hasVisibleUpAheadContent(apiData)'), 'Provider must preserve visible-content gate');
assert(clientTest.includes('captures edge metadata headers when present'), 'Client tests must cover present headers');
assert(clientTest.includes('normalizes absent edge metadata headers to unknown'), 'Client tests must cover absent headers');
assert(clientTest.includes('keeps plain JSON helper backward compatible'), 'Client tests must cover backward compatibility');
assert(providerTest.includes('records edge API diagnostics when API is attempted'), 'Provider tests must cover diagnostics event');
assert(providerTest.includes('edge freshness is stale'), 'Provider tests must cover stale metadata acceptance');
assert(providerTest.includes('edge freshness is unknown'), 'Provider tests must cover unknown metadata acceptance');
assert(fs.existsSync('cloudflare/upahead-dataset-api/src/index.js'), 'Worker source must remain outside this guard scope');
assert(fs.existsSync('src/runtime/runtimeCapabilities.js'), 'Runtime source must remain outside this guard scope');
assert(fs.existsSync('scripts/server.py'), 'Server script must remain outside this guard scope');
assert(report.includes('NW-DP-017') && report.includes('Non-goals'), 'Report must document NW-DP-017 and Non-goals');

if (!process.exitCode) {
  console.log('[NW-DP-017 static] PASS');
}
