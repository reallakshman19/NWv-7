const ENDPOINT_PATH = '/api/datasets/upAhead';
const REQUIRED_JSON_KEYS = ['timeline', 'sections', 'weekly_plan', 'auditSummary', 'dropReport'];
const REQUIRED_EXPOSED_HEADERS = [
  'x-nw-upahead-source',
  'x-nw-upahead-reason',
  'x-nw-upahead-freshness',
  'x-nw-upahead-age-seconds',
];
const ALLOWED_SOURCES = ['upstream', 'fallback'];
const ALLOWED_REASONS = ['ok', 'missing-url', 'fetch-error', 'upstream-non-ok', 'invalid-json', 'invalid-shape'];
const ALLOWED_FRESHNESS = ['fresh', 'stale', 'unknown'];

function getInputBaseUrl() {
  return process.argv[2] || process.env.UP_AHEAD_API_BASE_URL || '';
}

export function normalizeBaseUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) return { error: 'Usage: UP_AHEAD_API_BASE_URL=https://<deployed-worker-host> node scripts/smoke_up_ahead_edge_api.mjs' };

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return { error: `Invalid URL: ${raw}` };
  }

  if (parsed.pathname.includes(ENDPOINT_PATH)) {
    return { error: `Base URL must not include ${ENDPOINT_PATH}; provide only the Worker base URL.` };
  }

  const path = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
  return { baseUrl: `${parsed.origin}${path}` };
}

export function buildEndpointUrl(baseUrl) {
  return `${baseUrl.replace(/\/+$/, '')}${ENDPOINT_PATH}`;
}

function headerValue(response, name) {
  return response.headers.get(name) || '';
}

function pass(condition, message) {
  return { ok: Boolean(condition), message };
}

function hasJsonShape(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  return REQUIRED_JSON_KEYS.every(key => Object.prototype.hasOwnProperty.call(payload, key));
}

function isNonNegativeIntegerText(value) {
  return /^\d+$/.test(value);
}

function parseExposedHeaders(response) {
  return headerValue(response, 'access-control-expose-headers')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
}

function getExposeHeaderChecks(response, label) {
  const exposedHeaders = parseExposedHeaders(response);
  return REQUIRED_EXPOSED_HEADERS.map(header => pass(
    exposedHeaders.includes(header),
    `${label} Access-Control-Expose-Headers includes ${header}`
  ));
}

function getDiagnostics(response) {
  const source = headerValue(response, 'x-nw-upahead-source') || 'unknown';
  const reason = headerValue(response, 'x-nw-upahead-reason') || 'unknown';
  const freshness = headerValue(response, 'x-nw-upahead-freshness') || 'unknown';
  const ageSeconds = headerValue(response, 'x-nw-upahead-age-seconds') || 'unknown';
  return { source, reason, freshness, ageSeconds };
}

function getDiagnosticsChecks(diagnostics) {
  return [
    pass(diagnostics.source === 'unknown' || ALLOWED_SOURCES.includes(diagnostics.source), 'diagnostics source upstream/fallback/unknown'),
    pass(diagnostics.reason === 'unknown' || ALLOWED_REASONS.includes(diagnostics.reason), 'diagnostics reason allowed-or-unknown'),
    pass(ALLOWED_FRESHNESS.includes(diagnostics.freshness), 'freshness fresh/stale/unknown'),
    pass(diagnostics.ageSeconds === 'unknown' || isNonNegativeIntegerText(diagnostics.ageSeconds), 'age seconds non-negative integer-or-unknown'),
  ];
}

async function verifyGet(endpointUrl, fetchImpl) {
  const response = await fetchImpl(endpointUrl, { method: 'GET' });
  const contentType = headerValue(response, 'content-type');
  const cacheControl = headerValue(response, 'cache-control');
  const cors = headerValue(response, 'access-control-allow-origin');
  const diagnostics = getDiagnostics(response);
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  return {
    diagnostics,
    checks: [
      pass(response.status === 200, 'GET status 200'),
      pass(contentType.includes('application/json'), 'Content-Type application/json'),
      pass(cacheControl.includes('no-cache'), 'Cache-Control no-cache'),
      pass(cors.includes('*'), 'Access-Control-Allow-Origin *'),
      ...getExposeHeaderChecks(response, 'GET'),
      pass(hasJsonShape(payload), 'JSON shape timeline/sections/weekly_plan/auditSummary/dropReport'),
      ...getDiagnosticsChecks(diagnostics),
    ],
  };
}

async function verifyOptions(endpointUrl, fetchImpl) {
  const response = await fetchImpl(endpointUrl, { method: 'OPTIONS' });
  const cors = headerValue(response, 'access-control-allow-origin');
  const methods = headerValue(response, 'access-control-allow-methods');

  return [
    pass(response.status === 200 || response.status === 204, 'OPTIONS status 200 or 204'),
    pass(cors.includes('*'), 'OPTIONS Access-Control-Allow-Origin *'),
    pass(methods.includes('GET'), 'OPTIONS allows GET'),
    pass(methods.includes('OPTIONS'), 'OPTIONS allows OPTIONS'),
    ...getExposeHeaderChecks(response, 'OPTIONS'),
  ];
}

function printResults({ baseUrl, endpointUrl, getResult, optionChecks }) {
  const allChecks = [...getResult.checks, ...optionChecks];
  const ok = allChecks.every(check => check.ok);
  console.log('Up Ahead edge API smoke');
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Endpoint: ${endpointUrl}`);
  console.log(`Source: ${getResult.diagnostics.source}`);
  console.log(`Reason: ${getResult.diagnostics.reason}`);
  console.log(`Freshness: ${getResult.diagnostics.freshness}`);
  console.log(`Age Seconds: ${getResult.diagnostics.ageSeconds}`);
  console.log(`GET: ${getResult.checks.every(check => check.ok) ? 'PASS' : 'FAIL'}`);
  console.log(`OPTIONS: ${optionChecks.every(check => check.ok) ? 'PASS' : 'FAIL'}`);
  console.log(`Shape: ${getResult.checks.find(check => check.message.startsWith('JSON shape'))?.ok ? 'PASS' : 'FAIL'}`);
  allChecks.forEach(check => console.log(`- ${check.ok ? 'PASS' : 'FAIL'} ${check.message}`));
  console.log(`Result: ${ok ? 'PASS' : 'FAIL'}`);
  return ok;
}

export async function runSmoke({ inputBaseUrl = getInputBaseUrl(), fetchImpl = fetch } = {}) {
  const normalized = normalizeBaseUrl(inputBaseUrl);
  if (normalized.error) {
    console.error(normalized.error);
    return 2;
  }

  const endpointUrl = buildEndpointUrl(normalized.baseUrl);
  const getResult = await verifyGet(endpointUrl, fetchImpl);
  const optionChecks = await verifyOptions(endpointUrl, fetchImpl);
  return printResults({ baseUrl: normalized.baseUrl, endpointUrl, getResult, optionChecks }) ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSmoke().then(code => {
    process.exitCode = code;
  }).catch(error => {
    console.error(error?.message || String(error));
    process.exitCode = 1;
  });
}
