import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`[NW-DP-003 static] FAIL: ${message}`);
    process.exitCode = 1;
  }
}

const dataset = read('src/data/datasets/upAheadDataset.js');
const policy = read('src/data/datasets/upAheadProviderPolicy.js');
const cert = read('src/data/datasets/upAheadProviderPolicy.cert.test.js');
const report = read('reports/NW-DP-003_up_ahead_provider_policy.md');

assert(
  dataset.includes("from './upAheadProviderPolicy.js'"),
  'upAheadDataset.js must import provider policy helper'
);

assert(
  dataset.includes('providerDecision.shouldAttemptLive'),
  'live fetch must be guarded by explicit provider decision'
);

assert(
  !/try\s*{\s*const\s+liveData\s*=\s*await\s+fetchLiveUpAheadData/.test(dataset),
  'upAheadDataset.js must not keep the old unconditional live fetch block'
);

assert(
  dataset.includes('upAheadDataset.provider_policy'),
  'dataset diagnostics must include provider-policy decision event'
);

assert(
  policy.includes('resolveUpAheadProviderPolicy') && policy.includes('shouldAttemptUpAheadLiveFetch'),
  'provider policy helper must expose explicit decision functions'
);

assert(
  cert.includes('static-with-dataset-api') && cert.includes('forceRefresh'),
  'cert must cover static-with-dataset-api and forceRefresh cases'
);

assert(
  report.includes('NW-DP-003') && report.includes('Non-goals'),
  'report must document NW-DP-003 and explicit non-goals'
);

if (!process.exitCode) {
  console.log('[NW-DP-003 static] PASS');
}
