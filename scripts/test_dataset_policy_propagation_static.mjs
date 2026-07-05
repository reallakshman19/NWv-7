import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`[NW-DP-001 static] FAIL: ${message}`);
    process.exitCode = 1;
  }
}

const useDataset = read('src/data/orchestrator/useDataset.js');
const policy = read('src/data/orchestrator/datasetPolicy.js');
const cert = read('src/data/orchestrator/datasetPolicyPropagation.cert.test.js');
const report = read('reports/NW-DP-001_dataset_policy_propagation.md');

assert(
  useDataset.includes('loader.load(context.normalizedOptions)'),
  'useDataset must pass normalizedOptions into loader.load(...)'
);

assert(
  !/loader\.load\(\s*\)/.test(useDataset),
  'useDataset must not call bare loader.load()'
);

assert(
  useDataset.includes('buildDatasetCacheKey(datasetId, normalizedOptions)'),
  'useDataset must build policy-aware cache keys'
);

assert(
  policy.includes("'developer-live'") && policy.includes('normalizeDatasetOptions'),
  'datasetPolicy must normalize developer-live policy options'
);

assert(
  cert.includes('includeInsight') && cert.includes('asOfDate') && cert.includes('liveOnly'),
  'cert test must cover includeInsight, asOfDate, and liveOnly'
);

assert(
  report.includes('NW-DP-001') && report.includes('Non-goals'),
  'report must document NW-DP-001 and explicit non-goals'
);

if (!process.exitCode) {
  console.log('[NW-DP-001 static] PASS');
}
