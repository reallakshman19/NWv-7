import {
  readCurrentSection,
  readCurrentSnapshot,
  readLatestParity,
} from './epochStore.js';

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
      'Cache-Control': 'no-store',
    },
  });
}

function corsResponse() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function parseSectionPath(pathname) {
  const prefix = '/api/shadow/sections/';
  if (!pathname.startsWith(prefix)) return null;
  const section = decodeURIComponent(pathname.slice(prefix.length)).trim();
  if (!section || section === 'latest') return null;
  return section;
}

export async function handleSectionsShadowRequest(request, env = {}) {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return corsResponse();
  if (request.method !== 'GET') return jsonResponse({ error: 'method_not_allowed' }, 405);
  if (!env.DB) return jsonResponse({ error: 'sections_shadow_store_unavailable' }, 503);

  if (url.pathname === '/api/shadow/sections/latest') {
    const snapshot = await readCurrentSnapshot(env.DB);
    if (!snapshot) return jsonResponse({ error: 'committed_snapshot_not_found' }, 404);
    return jsonResponse(snapshot);
  }

  const section = parseSectionPath(url.pathname);
  if (section) {
    const payload = await readCurrentSection(env.DB, section);
    if (!payload) return jsonResponse({ error: 'committed_snapshot_not_found' }, 404);
    return jsonResponse(payload);
  }

  if (url.pathname === '/api/shadow/parity/latest') {
    const parity = await readLatestParity(env.DB);
    if (!parity) return jsonResponse({ error: 'parity_record_not_found' }, 404);
    return jsonResponse(parity);
  }

  return jsonResponse({ error: 'not_found' }, 404);
}

export function runScheduledFoundation() {
  return {
    status: 'LIVE_ACQUISITION_NOT_AUTHORIZED_PR_B',
    snapshotWritten: false,
  };
}

export default {
  fetch(request, env) {
    return handleSectionsShadowRequest(request, env);
  },
  scheduled(controller, env, ctx) {
    const result = Promise.resolve(runScheduledFoundation(controller, env));
    ctx?.waitUntil?.(result);
    return result;
  },
};
