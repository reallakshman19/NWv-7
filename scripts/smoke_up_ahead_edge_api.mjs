const ENDPOINT_PATH = '/api/datasets/upAhead';
const REQUIRED_JSON_KEYS = ['timeline', 'sections', 'weekly_plan', 'auditSummary', 'dropReport'];

function usage() {
  return [
    'Usage:',
    '  UP_AHEAD_API_BASE_URL=https://<deployed-worker-host> node scripts/smoke_up_ahead_edge_api.mjs',
    '  node scripts/smoke_up_ahead_edge_api.mjs https://<deployed-worker-host>',
    '',
    `Do not include ${ENDPOINT_PATH} in the supplied base URL.`,
  ].join('\n');
}

function getRawBaseUrl(argv = process.argv, env = process.env) {
  return argv[2] || env.UP_AHEAD_API_BASE_URL || '';
}

function parseBaseUrl(rawBaseUrl) {
  const value = String(rawBaseUrl || '').trim();
  if (!value) throw new Error(usage());

  const url = new URL(value);
  url.search = '';
  url.hash = '';

  if (url.pathname.includes(ENDPOINT_PATH)) {
    throw new Error(`Supply the base URL only; remove ${ENDPOINT_PATH}.`);
  }

  url.pathname = url.pathname.replace(/\/+$/, '');
  return url;
}

function buildEndpointUrl(baseUrl) {
  const endpoint = new URL(baseUrl.toString());
  endpoint.pathname = `${endpoint.pathname.replace(/\/+$/, '')}${ENDPOINT_PATH}`;
  return endpoint;
}

function headerIncludes(headers, name, expected) {
  return String(headers.get(name) || '').toLowerCase().includes(expected.toLowerCase());
}

function headerAllowsAnyOrigin(headers) {
  return String(headers.get('access-control-allow-origin') || '').includes('*');
}

function getAllowedMethods(headers) {
  return String(headers.get('access-control-allow-methods') || '').toUpperCase();
}

function assertCheck(condition, message, failures) {
  if (!condition) failures.push(message);
}

async function readJson(response, failures) {
  try {
    return await response.json();
  } catch (error) {
    failures.push(`JSON parse failed: ${error?.message || error}`);
    return null;
  }
}

async function verifyGet(endpointUrl, fetchImpl) {
  const failures = [];
  const response = await fetchImpl(endpointUrl, { method: 'GET', cache: 'no-cache' });
  assertCheck(response.status === 200, `GET status expected 200, got ${response.status}`, failures);
  assertCheck(headerIncludes(response.headers, 'content-type', 'application/json'), 'GET Content-Type must include application/json', failures);
  assertCheck(headerIncludes(response.headers, 'cache-control', 'no-cache'), 'GET Cache-Control must include no-cache', failures);
  assertCheck(headerAllowsAnyOrigin(response.headers), 'GET Access-Control-Allow-Origin must include *', failures);

  const payload = await readJson(response, failures);
  const isObject = payload && typeof payload === 'object' && !Array.isArray(payload);
  assertCheck(isObject, 'GET JSON payload must be an object', failures);

  if (isObject) {
    REQUIRED_JSON_KEYS.forEach(key => assertCheck(key in payload, `GET JSON missing key: ${key}`, failures));
  }

  return { ok: failures.length === 0, failures, payload };
}

async function verifyOptions(endpointUrl, fetchImpl) {
  const failures = [];
  const response = await fetchImpl(endpointUrl, { method: 'OPTIONS', cache: 'no-cache' });
  const methods = getAllowedMethods(response.headers);

  assertCheck(response.status === 200 || response.status === 204, `OPTIONS status expected 200 or 204, got ${response.status}`, failures);
  assertCheck(headerAllowsAnyOrigin(response.headers), 'OPTIONS Access-Control-Allow-Origin must include *', failures);
  assertCheck(methods.includes('GET'), 'OPTIONS Access-Control-Allow-Methods must include GET', failures);
  assertCheck(methods.includes('OPTIONS'), 'OPTIONS Access-Control-Allow-Methods must include OPTIONS', failures);

  return { ok: failures.length === 0, failures };
}

function printSummary({ baseUrl, endpointUrl, getResult, optionsResult }) {
  const shapePass = getResult.failures.every(item => !item.includes('JSON'));
  const passed = getResult.ok && optionsResult.ok;

  console.log('Up Ahead edge API smoke');
  console.log(`Base URL: ${baseUrl.origin}`);
  console.log(`Endpoint: ${endpointUrl.origin}${endpointUrl.pathname}`);
  console.log(`GET: ${getResult.ok ? 'PASS' : 'FAIL'}`);
  console.log(`OPTIONS: ${optionsResult.ok ? 'PASS' : 'FAIL'}`);
  console.log(`Shape: ${shapePass ? 'PASS' : 'FAIL'}`);
  console.log(`Result: ${passed ? 'PASS' : 'FAIL'}`);

  [...getResult.failures, ...optionsResult.failures].forEach(item => console.error(`- ${item}`));
  return passed;
}

async function main() {
  const baseUrl = parseBaseUrl(getRawBaseUrl());
  const endpointUrl = buildEndpointUrl(baseUrl);
  const getResult = await verifyGet(endpointUrl, fetch);
  const optionsResult = await verifyOptions(endpointUrl, fetch);
  const passed = printSummary({ baseUrl, endpointUrl, getResult, optionsResult });
  if (!passed) process.exitCode = 1;
}

main().catch(error => {
  console.error(error?.message || String(error));
  process.exitCode = 1;
});
