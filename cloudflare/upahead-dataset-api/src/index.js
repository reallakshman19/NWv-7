const UP_AHEAD_DATASET_PATH = '/api/datasets/upAhead';
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function isUpAheadDatasetPath(pathname) {
  return pathname === UP_AHEAD_DATASET_PATH;
}

export function isObjectRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function isValidUpAheadPayload(payload) {
  if (!isObjectRecord(payload)) return false;
  if (!Array.isArray(payload.timeline)) return false;
  if (!isObjectRecord(payload.sections)) return false;
  if (!Array.isArray(payload.weekly_plan)) return false;
  if (!(payload.auditSummary === null || isObjectRecord(payload.auditSummary))) return false;
  return Array.isArray(payload.dropReport);
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

export function jsonResponse(payload, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('Content-Type', 'application/json');
  headers.set('Cache-Control', 'no-cache');
  Object.entries(CORS_HEADERS).forEach(([key, value]) => headers.set(key, value));
  return new Response(JSON.stringify(payload), { ...init, headers });
}

export function corsResponse(init = {}) {
  return new Response(null, {
    status: init.status || 204,
    headers: CORS_HEADERS,
  });
}

export async function fetchUpAheadPayload(env = {}, fetchImpl = fetch) {
  const upstreamUrl = String(env.UP_AHEAD_DATASET_URL || '').trim();
  if (!upstreamUrl || typeof fetchImpl !== 'function') return buildFallbackPayload();

  try {
    const response = await fetchImpl(upstreamUrl, { cache: 'no-cache' });
    if (!response?.ok) return buildFallbackPayload();
    const payload = await response.json();
    return isValidUpAheadPayload(payload) ? payload : buildFallbackPayload();
  } catch {
    return buildFallbackPayload();
  }
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

    const payload = await fetchUpAheadPayload(env);
    return jsonResponse(payload);
  },
};
