import { isDigestDate } from './contracts.js';
import { readSnapshot } from './snapshotStore.js';

const DATASET_PATH = '/api/datasets/dailyDigest';
const CORS_HEADERS = Object.freeze({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
});

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    },
  });
}

function corsResponse() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function requestedDate(url) {
  const value = url.searchParams.get('date');
  if (value === null) return { value: null, valid: true };
  return { value, valid: isDigestDate(value) };
}

export async function handleDailyDigestRequest(request, env = {}) {
  const url = new URL(request.url);
  if (url.pathname !== DATASET_PATH) return jsonResponse({ error: 'not_found' }, 404);
  if (request.method === 'OPTIONS') return corsResponse();
  if (request.method !== 'GET') return jsonResponse({ error: 'method_not_allowed' }, 405);
  const date = requestedDate(url);
  if (!date.valid) return jsonResponse({ error: 'invalid_digest_date' }, 400);
  if (!env.DB) return jsonResponse({ error: 'daily_digest_store_unavailable' }, 503);
  const snapshot = await readSnapshot(env.DB, date.value);
  if (!snapshot) return jsonResponse({ error: 'snapshot_not_found', digestDate: date.value }, 404);
  return jsonResponse(snapshot);
}

export function runScheduledFoundation() {
  return {
    status: 'SOURCE_ADAPTERS_NOT_AUTHORIZED',
    snapshotWritten: false,
  };
}

export default {
  fetch(request, env) {
    return handleDailyDigestRequest(request, env);
  },
  scheduled(_controller, _env, ctx) {
    ctx?.waitUntil?.(Promise.resolve(runScheduledFoundation()));
  },
};
