import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`[NW-DP-005 static] FAIL: ${message}`);
    process.exitCode = 1;
  }
}

const server = read('scripts/server.py');
const client = read('src/data/datasets/upAheadDatasetApiClient.js');
const report = read('reports/NW-DP-005_up_ahead_dataset_api_endpoint.md');

assert(server.includes("UP_AHEAD_DATASET_ENDPOINT = '/api/datasets/upAhead'"), 'server must define exact endpoint path');
assert(server.includes("UP_AHEAD_DATASET_FILE = os.path.join(DATA_DIR, 'up_ahead.json')"), 'server must map to public/data/up_ahead.json');
assert(server.includes("'fallback': 'missing_or_invalid_up_ahead_dataset'"), 'server must include structured Up Ahead fallback');
assert(server.includes("if __name__ == '__main__':"), 'server must be import-safe for tests');
assert(server.includes('Cache-Control') && server.includes('no-cache'), 'endpoint should send no-cache header');
assert(client.includes('/api/datasets/upAhead'), 'DP-004 client endpoint path must remain unchanged');

[
  'src/runtime/runtimeCapabilities.js',
  'src/data/orchestrator/useDataset.js',
  'src/data/orchestrator/datasetPolicy.js',
  'src/data/datasets/upAheadDataset.js',
  'src/data/datasets/upAheadDatasetApiClient.js',
  'src/data/datasets/upAheadProviderPolicy.js',
  'src/services/upAheadService.js',
  'src/services/intelligentUpAheadFetcher.js',
  'src/services/rssAggregator.js',
].forEach(path => assert(fs.existsSync(path), `Forbidden-file guard could not inspect ${path}`));

assert(report.includes('NW-DP-005') && report.includes('Non-goals'), 'report must document NW-DP-005 and Non-goals');

if (!process.exitCode) {
  console.log('[NW-DP-005 static] PASS');
}
