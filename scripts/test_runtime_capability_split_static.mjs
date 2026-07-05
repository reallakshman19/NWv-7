import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`[NW-DP-002 static] FAIL: ${message}`);
    process.exitCode = 1;
  }
}

const runtime = read('src/runtime/runtimeCapabilities.js');
const cert = read('src/runtime/runtimeCapabilities.cert.test.js');
const report = read('reports/NW-DP-002_runtime_capability_split.md');

const requiredRuntimeFields = [
  'resolveRuntimeCapabilities',
  'staticFrontend',
  'canUseDatasetApi',
  'datasetApiConfigured',
  'preferDatasetApi',
  'preferStaticSnapshots',
  'staticSnapshotFallback',
  'browserWideFeedFetchAllowed',
  'forceSnapshots',
  'runtimeKind',
];

requiredRuntimeFields.forEach(field => {
  assert(runtime.includes(field), `runtime must expose ${field}`);
});

assert(runtime.includes('static-with-dataset-api'), 'runtime must classify static host with dataset API');
assert(runtime.includes('allowWideFeedFetch: values.browserWideFeedFetchAllowed'), 'legacy wide feed field must map to split field');
assert(runtime.includes('canUseBackendApi: values.backendConfigured'), 'legacy backend API field must remain compatible');
assert(cert.includes('example.pages.dev'), 'cert must cover Cloudflare Pages frontend');
assert(cert.includes('site.netlify.app'), 'cert must cover Netlify frontend');
assert(cert.includes('site.vercel.app'), 'cert must cover Vercel frontend');
assert(cert.includes('server-or-test'), 'cert must cover non-browser runtime');
assert(cert.includes('browserWideFeedFetchAllowed'), 'cert must guard browser feed fetch permission');
assert(report.includes('NW-DP-002') && report.includes('Non-goals'), 'report must document mission and non-goals');

if (!process.exitCode) {
  console.log('[NW-DP-002 static] PASS');
}
