const UP_AHEAD_DATASET_PATH = '/api/datasets/upAhead';
const SOURCE_HEADER = 'X-NW-UpAhead-Source';
const REASON_HEADER = 'X-NW-UpAhead-Reason';
const FRESHNESS_HEADER = 'X-NW-UpAhead-Freshness';
const AGE_SECONDS_HEADER = 'X-NW-UpAhead-Age-Seconds';
const EXPOSED_DIAGNOSTIC_HEADERS = [
  SOURCE_HEADER,
  REASON_HEADER,
  FRESHNESS_HEADER,
  AGE_SECONDS_HEADER,
].join(', ');
const FRESHNESS_STALE_AFTER_MS = 12 * 60 * 60 * 1000;
const DEFAULT_UPSTREAM_TIMEOUT_MS = 3500;
const MAX_UPSTREAM_TIMEOUT_MS = 10000;
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Expose-Headers': EXPOSED_DIAGNOSTIC_HEADERS,
};

export function isUpAheadDatasetPath(pathname) {
  return pathname === UP_AHEAD_DATASET_PATH;
}

export function isObjectRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function isValidUpAheadPayload(payload) {
  if (!isObjectRecord(payload)) return false;
  // Accept the canonical raw publication produced by scripts/fetch_upahead_events.py.
  // Never discard lifecycle and original source metadata in the Worker.
  if (Array.isArray(payload.items)) {
    return Number(payload.schemaVersion) === 1
      && Number.isFinite(Number(payload.fetchedAt))
      && Number(payload.fetchedAt) > 0
      && payload.items.length > 0
      && payload.items.every(item => isObjectRecord(item)
        && typeof item.title === 'string' && item.title.trim()
        && typeof item.id === 'string' && item.id.trim());
  }
  if (!Array.isArray(payload.timeline)) return false;
  if (!isObjectRecord(payload.sections)) return false;
  if (!Array.isArray(payload.weekly_plan)) return false;
  if (!(payload.auditSummary === null || isObjectRecord(payload.auditSummary))) return false;
  return Array.isArray(payload.dropReport);
}

export function selectValidUpAheadPayload(payload) {
  return isValidUpAheadPayload(payload) ? payload : buildFallbackPayload();
}

export function parseLastUpdatedMillis(value) {
  if (!value) return null;
  const millis = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(millis) ? millis : null;
}

export function buildFreshnessDiagnostics(payload, nowMs = Date.now()) {
  const lastUpdatedMs = parseLastUpdatedMillis(payload?.lastUpdated ?? payload?.fetchedAt);
  if (lastUpdatedMs === null || lastUpdatedMs > nowMs) {
    return { freshness: 'unknown', ageSeconds: 'unknown' };
  }

  const ageMs = Math.max(0, nowMs - lastUpdatedMs);
  return {
    freshness: ageMs <= FRESHNESS_STALE_AFTER_MS ? 'fresh' : 'stale',
    ageSeconds: String(Math.floor(ageMs / 1000)),
  };
}

export function buildFallbackPayload() {
  return {
    timeline: [],
    sections: {},
    weekly_plan: [],
    lastUpdated: null,
    auditSummary: { fallback: 'missing_or_invalid_up_ahead_dataset' },
    dropReport: [],
  };
}

export function buildPayloadResult(payload, source = 'upstream', reason = 'ok') {
  return { payload, source, reason };
}

export function buildFallbackResult(reason) {
  return buildPayloadResult(buildFallbackPayload(), 'fallback', reason);
}

export function jsonResponse(payload, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('Content-Type', 'application/json');
  headers.set('Cache-Control', 'no-cache');
  Object.entries(CORS_HEADERS).forEach(([key, value]) => headers.set(key, value));
  return new Response(JSON.stringify(payload), { ...init, headers });
}

export function datasetJsonResponse(result, init = {}) {
  const freshness = buildFreshnessDiagnostics(result.payload);
  return jsonResponse(result.payload, {
    ...init,
    headers: {
      ...(init.headers || {}),
      [SOURCE_HEADER]: result.source,
      [REASON_HEADER]: result.reason,
      [FRESHNESS_HEADER]: freshness.freshness,
      [AGE_SECONDS_HEADER]: freshness.ageSeconds,
    },
  });
}

export function corsResponse(init = {}) {
  return new Response(null, {
    status: init.status || 204,
    headers: CORS_HEADERS,
  });
}

export async function fetchUpAheadPayloadResult(env = {}, fetchImpl = fetch) {
  const upstreamUrl = String(env.UP_AHEAD_DATASET_URL || '').trim();
  if (!upstreamUrl || typeof fetchImpl !== 'function') return buildFallbackResult('missing-url');

  let deadlineExpired = false;
  try {
    const specifiedTimeout = Number(env.UP_AHEAD_UPSTREAM_TIMEOUT_MS);
    const timeoutMs = Number.isFinite(specifiedTimeout) && specifiedTimeout > 0
      ? Math.min(MAX_UPSTREAM_TIMEOUT_MS, Math.max(10, specifiedTimeout))
      : DEFAULT_UPSTREAM_TIMEOUT_MS;
    const controller = new AbortController();
    let timeoutId;
    const deadline = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        deadlineExpired = true;
        controller.abort();
        const error = new Error('Up Ahead upstream deadline exceeded');
        error.code = 'upstream-timeout';
        reject(error);
      }, timeoutMs);
    });
    let payload;
    try {
      payload = await Promise.race([
        (async () => {
          const response = await fetchImpl(upstreamUrl, { cache: 'no-cache', signal: controller.signal });
          if (!response?.ok) return { nonOk: true };
          return { data: await response.json() };
        })(),
        deadline,
      ]);
    } finally {
      clearTimeout(timeoutId);
    }
    if (payload?.nonOk) return buildFallbackResult('upstream-non-ok');
    payload = payload?.data;
    const selectedPayload = selectValidUpAheadPayload(payload);
    return selectedPayload === payload
      ? buildPayloadResult(payload, 'upstream', 'ok')
      : buildFallbackResult('invalid-shape');
  } catch (error) {
    return deadlineExpired || error?.code === 'upstream-timeout'
      ? buildFallbackResult('upstream-timeout')
      : error instanceof SyntaxError
        ? buildFallbackResult('invalid-json')
        : buildFallbackResult('fetch-error');
  }
}

export async function fetchUpAheadPayload(env = {}, fetchImpl = fetch) {
  const result = await fetchUpAheadPayloadResult(env, fetchImpl);
  return result.payload;
}

export function methodNotAllowedResponse() {
  return jsonResponse({ error: 'method_not_allowed' }, { status: 405 });
}

export function notFoundResponse() {
  return jsonResponse({ error: 'not_found' }, { status: 404 });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!isUpAheadDatasetPath(url.pathname)) return notFoundResponse();
    if (request.method === 'OPTIONS') return corsResponse();
    if (request.method !== 'GET') return methodNotAllowedResponse();

    const result = await fetchUpAheadPayloadResult(env);
    return datasetJsonResponse(result);
  },
};
