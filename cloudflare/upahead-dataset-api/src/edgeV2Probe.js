/**
 * Opt-in UpAhead v2 identity/generation verification endpoint.
 *
 * This module MUST NOT select or publish user-visible data. It verifies two
 * explicitly configured HTTPS shadow artifacts and returns bounded diagnostic
 * metadata only. Both configuration and route exposure are off by default.
 * A matching digest checks integrity, NOT author/organizer authenticity.
 */
import { verifyGeneration } from './identityV2Shadow.js';

export const EDGE_V2_SHADOW_PATH = '/api/datasets/upAhead/v2/verify';
export const EDGE_V2_MAX_PAYLOAD_BYTES = 8_000_000;
const MAX_MANIFEST_BYTES = 64_000;
const DEFAULT_TIMEOUT_MS = 3500;
const MAX_TIMEOUT_MS = 10000;
const FRESHNESS_MS = 12 * 60 * 60 * 1000;

const record = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const status = (state, reason, detail = {}) => ({ state, reason, ...detail });

export function isV2ShadowEnabled(env = {}) {
  return env.UP_AHEAD_V2_SHADOW_ENABLED === 'true';
}

export function checkShadowUrls(env = {}) {
  const values = [env.UP_AHEAD_V2_SHADOW_MANIFEST_URL, env.UP_AHEAD_V2_SHADOW_PAYLOAD_URL];
  if (values.some(value => typeof value !== 'string' || !value)) return { ok: false, reason: 'shadow-urls-not-configured' };
  const parsed = [];
  for (const value of values) {
    try {
      const u = new URL(value);
      if (u.protocol !== 'https:' || u.username || u.password || u.hash || !u.hostname) {
        return { ok: false, reason: 'invalid-shadow-url' };
      }
      parsed.push(u);
    } catch {
      return { ok: false, reason: 'invalid-shadow-url' };
    }
  }
  if (parsed[0].href === parsed[1].href || parsed[0].origin !== parsed[1].origin) {
    return { ok: false, reason: 'shadow-url-origin-or-path-mismatch' };
  }
  return { ok: true, manifestUrl: parsed[0].href, payloadUrl: parsed[1].href };
}

function timeoutBudget(env = {}) {
  const n = Number(env.UP_AHEAD_V2_SHADOW_TIMEOUT_MS);
  return Number.isSafeInteger(n) && n > 0 ? Math.min(MAX_TIMEOUT_MS, n) : DEFAULT_TIMEOUT_MS;
}

async function readArtifact(url, fetchImpl, controller, byteLimit) {
  const res = await fetchImpl(url, { cache: 'no-store', signal: controller.signal });
  if (!res?.ok) throw Object.assign(new Error('upstream-non-ok'), { reason: 'upstream-non-ok' });
  const declared = res.headers?.get?.('Content-Length');
  if (declared != null && /^\d+$/.test(declared) && Number(declared) > byteLimit) {
    throw Object.assign(new Error('artifact-oversize'), { reason: 'artifact-oversize' });
  }
  // The maximum applies to actual UTF-8 bytes, not string code units.
  const raw = await res.text();
  if (new TextEncoder().encode(raw).byteLength > byteLimit) {
    throw Object.assign(new Error('artifact-oversize'), { reason: 'artifact-oversize' });
  }
  try { return JSON.parse(raw); }
  catch { throw Object.assign(new Error('invalid-json'), { reason: 'invalid-json' }); }
}

export async function verifyEdgeV2Shadow(env, fetchImpl, opts = {}) {
  if (!isV2ShadowEnabled(env)) return status('NOT_CONFIGURED', 'shadow-disabled');
  const urls = checkShadowUrls(env);
  if (!urls.ok) return status('NOT_CONFIGURED', urls.reason);
  if (typeof fetchImpl !== 'function') return status('UPSTREAM_UNAVAILABLE', 'fetch-unavailable');
  const nowMs = opts.nowMs ?? Date.now();
  const controller = new AbortController();
  const timeoutMs = timeoutBudget(env);
  let timer;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(Object.assign(new Error('upstream-timeout'), { reason: 'upstream-timeout' }));
      }, timeoutMs);
    });
    const readBoth = async () => {
      const manifest = await readArtifact(urls.manifestUrl, fetchImpl, controller, MAX_MANIFEST_BYTES);
      // Manifest is received first, but NEVER controls the URL used for payload acquisition.
      if (!record(manifest)) return { manifest, payload: null };
      const payload = await readArtifact(urls.payloadUrl, fetchImpl, controller, EDGE_V2_MAX_PAYLOAD_BYTES);
      return { manifest, payload };
    };
    const { manifest, payload } = await Promise.race([readBoth(), timeout]);
    const verified = await verifyGeneration(payload, manifest, { nowMs, freshnessMs: FRESHNESS_MS });
    if (!verified.usable) return status('INVALID', verified.reason);
    const detail = {
      generationId: verified.generationId,
      semanticDigest: verified.semanticDigest,
      sourceCommit: verified.sourceCommit,
      identityVersion: verified.identityVersion,
      ageSeconds: Math.floor(verified.ageMs / 1000),
      counts: verified.counts,
    };
    return verified.status === 'STALE_VALID'
      ? status('STALE_VALID', 'source-generation-stale', detail)
      : status('VALID', 'source-generation-verified', detail);
  } catch (error) {
    const reason = error?.reason || 'fetch-error';
    if (reason === 'artifact-oversize' || reason === 'invalid-json') return status('INVALID', reason);
    return status('UPSTREAM_UNAVAILABLE', reason);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

export function edgeV2DiagnosticResponse(result, jsonResponse) {
  const ok = result.state === 'VALID';
  const code = ok ? 200 : result.state === 'NOT_CONFIGURED' ? 503
    : result.state === 'INVALID' ? 422 : 503;
  const res = jsonResponse(result, { status: code, headers: {
    'X-NW-UpAhead-Source': 'v2-shadow',
    'X-NW-UpAhead-Reason': result.reason,
    'X-NW-UpAhead-Freshness': result.state === 'VALID' ? 'fresh' : result.state === 'STALE_VALID' ? 'stale' : 'unknown',
    'X-NW-UpAhead-Generation': result.generationId || '',
    'X-NW-UpAhead-Digest': result.semanticDigest || '',
  } });
  res.headers.set('Access-Control-Expose-Headers', [
    res.headers.get('Access-Control-Expose-Headers') || '',
    'X-NW-UpAhead-Generation', 'X-NW-UpAhead-Digest',
  ].filter(Boolean).join(', '));
  return res;
}
