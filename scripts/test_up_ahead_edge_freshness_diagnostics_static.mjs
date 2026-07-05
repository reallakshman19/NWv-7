import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`[NW-DP-012 static] FAIL: ${message}`);
    process.exitCode = 1;
  }
}

const worker = read('cloudflare/upahead-dataset-api/src/index.js');
const smoke = read('scripts/smoke_up_ahead_edge_api.mjs');
const report = read('reports/NW-DP-012_up_ahead_edge_freshness_diagnostics.md');

assert(worker.includes('X-NW-UpAhead-Freshness'), 'Worker must emit X-NW-UpAhead-Freshness');
assert(worker.includes('X-NW-UpAhead-Age-Seconds'), 'Worker must emit X-NW-UpAhead-Age-Seconds');
assert(worker.includes('lastUpdated'), 'Worker must inspect payload.lastUpdated');
assert(worker.includes('FRESHNESS_STALE_AFTER_MS = 12 * 60 * 60 * 1000'), 'Worker must define 12-hour stale threshold');
assert(worker.includes("freshness: 'unknown'") && worker.includes("? 'fresh' : 'stale'"), 'Worker must support fresh/stale/unknown');
assert(worker.includes('parseLastUpdatedMillis') && worker.includes('buildFreshnessDiagnostics'), 'Worker must define freshness helpers');
assert(worker.includes('[SOURCE_HEADER]: result.source') && worker.includes('[REASON_HEADER]: result.reason'), 'Worker must preserve source/reason diagnostics');
assert(worker.includes('[FRESHNESS_HEADER]: freshness.freshness'), 'Worker must set freshness header');
assert(worker.includes('[AGE_SECONDS_HEADER]: freshness.ageSeconds'), 'Worker must set age seconds header');
assert(worker.includes("const UP_AHEAD_DATASET_PATH = '/api/datasets/upAhead'"), 'Endpoint path must remain /api/datasets/upAhead');
assert(worker.includes('Access-Control-Allow-Origin'), 'Worker must preserve CORS behavior');
assert(worker.includes('Cache-Control') && worker.includes('no-cache'), 'Worker must preserve no-cache behavior');
assert(worker.includes("request.method === 'OPTIONS'"), 'Worker must preserve OPTIONS behavior');
assert(worker.includes("request.method !== 'GET'"), 'Worker must preserve method guard');
assert(worker.includes('status: 405'), 'Worker must preserve 405 behavior');
assert(worker.includes('status: 404'), 'Worker must preserve 404 behavior');
assert(worker.includes('missing_or_invalid_up_ahead_dataset'), 'Fallback marker must remain unchanged');
assert(smoke.includes('x-nw-upahead-freshness') && smoke.includes('x-nw-upahead-age-seconds'), 'Smoke must read freshness headers');
assert(smoke.includes('Freshness:') && smoke.includes('Age Seconds:'), 'Smoke must report freshness headers');
assert(smoke.includes('ALLOWED_FRESHNESS') && smoke.includes('isNonNegativeIntegerText'), 'Smoke must validate freshness values and age seconds');
assert(smoke.includes("'unknown'") && smoke.includes('non-negative integer-or-unknown'), 'Smoke must accept absent freshness as unknown');
assert(!smoke.includes("stale' ? 'FAIL") && !smoke.includes("unknown' ? 'FAIL"), 'Smoke must not fail solely because freshness is stale or unknown');

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

assert(report.includes('NW-DP-012') && report.includes('Non-goals'), 'Report must document NW-DP-012 and Non-goals');

if (!process.exitCode) {
  console.log('[NW-DP-012 static] PASS');
}
