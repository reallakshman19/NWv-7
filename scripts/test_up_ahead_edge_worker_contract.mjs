import worker from '../cloudflare/upahead-dataset-api/src/index.js';

const ENDPOINT_PATH = '/api/datasets/upAhead';
const BASE_URL = 'https://worker.test';
const UPSTREAM_URL = 'https://snapshot.test/data/up_ahead.json';
const DIAGNOSTIC_HEADERS = [
  'X-NW-UpAhead-Source',
  'X-NW-UpAhead-Reason',
  'X-NW-UpAhead-Freshness',
  'X-NW-UpAhead-Age-Seconds',
];

let failures = 0;

function assert(condition, message) {
  if (!condition) {
    failures += 1;
    console.error(`[NW-DP-014 contract] FAIL: ${message}`);
  }
}

function validPayload(overrides = {}) {
  return {
    timeline: [],
    sections: {},
    weekly_plan: [],
    lastUpdated: new Date(Date.now() - 60_000).toISOString(),
    auditSummary: {},
    dropReport: [],
    ...overrides,
  };
}

function jsonFetch(payload, status = 200) {
  return async url => new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function withMockFetch(fetchImpl, fn) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    return await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function runWorker({ method = 'GET', path = ENDPOINT_PATH, env = {}, fetchImpl = async () => { throw new Error('unexpected fetch'); } } = {}) {
  return withMockFetch(fetchImpl, () => worker.fetch(new Request(`${BASE_URL}${path}`, { method }), env));
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function header(response, name) {
  return response.headers.get(name) || '';
}

function assertJsonHeaders(response, label) {
  assert(header(response, 'content-type').includes('application/json'), `${label}: Content-Type must include application/json`);
  assert(header(response, 'cache-control').includes('no-cache'), `${label}: Cache-Control must include no-cache`);
}

function exposedHeaderNames(response) {
  return header(response, 'access-control-expose-headers')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
}

function assertCorsExposeHeaders(response, label) {
  const exposed = exposedHeaderNames(response);
  DIAGNOSTIC_HEADERS.forEach(name => {
    assert(exposed.includes(name.toLowerCase()), `${label}: Access-Control-Expose-Headers must include ${name}`);
  });
}

function assertCorsBaseHeaders(response, label) {
  assert(header(response, 'access-control-allow-origin') === '*', `${label}: Access-Control-Allow-Origin must be *`);
  assert(header(response, 'access-control-allow-methods').includes('GET'), `${label}: Access-Control-Allow-Methods must include GET`);
  assert(header(response, 'access-control-allow-methods').includes('OPTIONS'), `${label}: Access-Control-Allow-Methods must include OPTIONS`);
  assert(header(response, 'access-control-allow-headers').includes('Content-Type'), `${label}: Access-Control-Allow-Headers must include Content-Type`);
  assertCorsExposeHeaders(response, label);
}

function assertDatasetHeaders(response, { source, reason, freshness, age = 'integer' }, label) {
  assert(response.status === 200, `${label}: status must be 200`);
  assertJsonHeaders(response, label);
  assertCorsBaseHeaders(response, label);
  assert(header(response, 'x-nw-upahead-source') === source, `${label}: source must be ${source}`);
  assert(header(response, 'x-nw-upahead-reason') === reason, `${label}: reason must be ${reason}`);
  assert(header(response, 'x-nw-upahead-freshness') === freshness, `${label}: freshness must be ${freshness}`);
  const ageSeconds = header(response, 'x-nw-upahead-age-seconds');
  if (age === 'integer') {
    assert(/^\d+$/.test(ageSeconds), `${label}: age seconds must be a non-negative integer`);
  } else {
    assert(ageSeconds === age, `${label}: age seconds must be ${age}`);
  }
}

function assertFallbackPayload(payload, label) {
  assert(Array.isArray(payload.timeline), `${label}: fallback timeline must be an array`);
  assert(payload.sections && typeof payload.sections === 'object' && !Array.isArray(payload.sections), `${label}: fallback sections must be an object`);
  assert(Array.isArray(payload.weekly_plan), `${label}: fallback weekly_plan must be an array`);
  assert(Array.isArray(payload.dropReport), `${label}: fallback dropReport must be an array`);
  assert(payload.auditSummary?.fallback === 'missing_or_invalid_up_ahead_dataset', `${label}: fallback marker must be missing_or_invalid_up_ahead_dataset`);
}

async function testValidUpstreamFresh() {
  const response = await runWorker({
    env: { UP_AHEAD_DATASET_URL: UPSTREAM_URL },
    fetchImpl: jsonFetch(validPayload()),
  });
  const payload = await readJson(response);
  assertDatasetHeaders(response, { source: 'upstream', reason: 'ok', freshness: 'fresh' }, 'valid upstream payload');
  assert(Array.isArray(payload.timeline), 'valid upstream payload: body timeline must be preserved');
  assert(payload.auditSummary?.fallback !== 'missing_or_invalid_up_ahead_dataset', 'valid upstream payload: body must not be fallback');
}

async function testMissingUpstreamUrl() {
  const response = await runWorker({ env: {} });
  const payload = await readJson(response);
  assertDatasetHeaders(response, { source: 'fallback', reason: 'missing-url', freshness: 'unknown', age: 'unknown' }, 'missing upstream URL');
  assertFallbackPayload(payload, 'missing upstream URL');
}

async function testUpstreamNonOk() {
  const response = await runWorker({
    env: { UP_AHEAD_DATASET_URL: UPSTREAM_URL },
    fetchImpl: jsonFetch({ error: 'unavailable' }, 503),
  });
  const payload = await readJson(response);
  assertDatasetHeaders(response, { source: 'fallback', reason: 'upstream-non-ok', freshness: 'unknown', age: 'unknown' }, 'upstream non-OK');
  assertFallbackPayload(payload, 'upstream non-OK');
}

async function testInvalidJson() {
  const response = await runWorker({
    env: { UP_AHEAD_DATASET_URL: UPSTREAM_URL },
    fetchImpl: async () => new Response('not json', { status: 200, headers: { 'Content-Type': 'application/json' } }),
  });
  const payload = await readJson(response);
  assertDatasetHeaders(response, { source: 'fallback', reason: 'invalid-json', freshness: 'unknown', age: 'unknown' }, 'JSON parse failure');
  assertFallbackPayload(payload, 'JSON parse failure');
}

async function testInvalidShape() {
  const response = await runWorker({
    env: { UP_AHEAD_DATASET_URL: UPSTREAM_URL },
    fetchImpl: jsonFetch({ items: [] }),
  });
  const payload = await readJson(response);
  assertDatasetHeaders(response, { source: 'fallback', reason: 'invalid-shape', freshness: 'unknown', age: 'unknown' }, 'invalid shape');
  assertFallbackPayload(payload, 'invalid shape');
}

async function testStalePayload() {
  const response = await runWorker({
    env: { UP_AHEAD_DATASET_URL: UPSTREAM_URL },
    fetchImpl: jsonFetch(validPayload({ lastUpdated: new Date(Date.now() - (13 * 60 * 60 * 1000)).toISOString() })),
  });
  const payload = await readJson(response);
  assertDatasetHeaders(response, { source: 'upstream', reason: 'ok', freshness: 'stale' }, 'stale valid payload');
  assert(payload.auditSummary?.fallback !== 'missing_or_invalid_up_ahead_dataset', 'stale valid payload: body must not be fallback');
}

async function testNullLastUpdated() {
  const response = await runWorker({
    env: { UP_AHEAD_DATASET_URL: UPSTREAM_URL },
    fetchImpl: jsonFetch(validPayload({ lastUpdated: null })),
  });
  const payload = await readJson(response);
  assertDatasetHeaders(response, { source: 'upstream', reason: 'ok', freshness: 'unknown', age: 'unknown' }, 'null lastUpdated');
  assert(payload.auditSummary?.fallback !== 'missing_or_invalid_up_ahead_dataset', 'null lastUpdated: body must not be fallback');
}

async function testOptionsPreflight() {
  const response = await runWorker({ method: 'OPTIONS' });
  assert(response.status === 204, 'OPTIONS preflight: status must be 204');
  assertCorsBaseHeaders(response, 'OPTIONS preflight');
}

async function testPostMethodNotAllowed() {
  const response = await runWorker({ method: 'POST' });
  const payload = await readJson(response);
  assert(response.status === 405, 'POST endpoint: status must be 405');
  assertJsonHeaders(response, 'POST endpoint');
  assertCorsBaseHeaders(response, 'POST endpoint');
  assert(payload?.error === 'method_not_allowed', 'POST endpoint: body error must be method_not_allowed');
}

async function testWrongPathNotFound() {
  const response = await runWorker({ path: '/wrong-path' });
  const payload = await readJson(response);
  assert(response.status === 404, 'wrong path: status must be 404');
  assertJsonHeaders(response, 'wrong path');
  assertCorsBaseHeaders(response, 'wrong path');
  assert(payload?.error === 'not_found', 'wrong path: body error must be not_found');
}

const tests = [
  ['valid upstream payload -> upstream/ok/fresh', testValidUpstreamFresh],
  ['missing upstream URL -> fallback/missing-url', testMissingUpstreamUrl],
  ['upstream non-OK -> fallback/upstream-non-ok', testUpstreamNonOk],
  ['JSON parse failure -> fallback/invalid-json', testInvalidJson],
  ['invalid shape -> fallback/invalid-shape', testInvalidShape],
  ['stale valid payload -> stale freshness', testStalePayload],
  ['null lastUpdated -> unknown freshness', testNullLastUpdated],
  ['OPTIONS preflight -> CORS allow/expose headers', testOptionsPreflight],
  ['POST endpoint -> 405', testPostMethodNotAllowed],
  ['wrong path -> 404', testWrongPathNotFound],
];

for (const [name, fn] of tests) {
  await fn();
  if (!failures) console.log(`[NW-DP-014 contract] PASS: ${name}`);
}

if (failures) {
  console.error(`[NW-DP-014 contract] FAIL: ${failures} assertion(s) failed`);
  process.exitCode = 1;
} else {
  console.log('[NW-DP-014 contract] PASS');
}
