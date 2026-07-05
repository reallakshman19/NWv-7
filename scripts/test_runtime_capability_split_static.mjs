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

assert(runtime.includes('resolveRuntimeCapabilities'), 'runtime must expose pure resolver');
assert(runtime.includes('isStaticFrontend'), 'runtime must expose static frontend status');
assert(runtime.includes('canUseDatasetApi'), 'runtime must expose dataset API capability');
assert(runtime.includes('datasetApiConfigured'), 'runtime must expose configured dataset API status');
assert(runtime.includes('static-host-with-dataset-api'), 'runtime must label static host with dataset API');
assert(runtime.includes('configuredBackendUrl'), 'runtime must keep configured API URL observable');
assert(runtime.includes('canUseBackendApi: backendConfigured'), 'legacy backend API field must remain compatible');
assert(cert.includes('example.github.io'), 'cert must cover static-host frontend');
assert(cert.includes('https://data.example.test'), 'cert must cover configured dataset API');
assert(report.includes('NW-DP-002') && report.includes('Non-goals'), 'report must document mission and non-goals');

if (!process.exitCode) {
  console.log('[NW-DP-002 static] PASS');
}
