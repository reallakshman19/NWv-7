/**
 * Public, read-only Sections source readiness check.
 *
 * It deliberately never fabricates or republishes news, uses no secrets, and
 * records only source freshness, counts and bounded provenance identifiers.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCTION_RUNTIME_ENDPOINTS } from '../src/config/runtimeEndpoints.js';

export const MAX_AUTHORITY_AGE_MS = 3 * 60 * 60 * 1000;
export const MAX_FALLBACK_AGE_MS = 12 * 60 * 60 * 1000;
export const MAX_STORY_AGE_MS = 36 * 60 * 60 * 1000;
export const ALLOWED_FUTURE_SKEW_MS = 5 * 60 * 1000;

const DEFAULT_WORKER_URL = PRODUCTION_RUNTIME_ENDPOINTS.sectionsAuthorityUrl;
const DEFAULT_FALLBACK_URL = 'https://reallakshman19.github.io/NWv-7/newsdata/sections_latest.json';

function timestampMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 0 && value < 10_000_000_000 ? value * 1000 : value;
  }
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return timestampMs(numeric);
    }
    return Date.parse(value);
  }
  return NaN;
}

function inAgeWindow(atMs, nowMs, maxAgeMs) {
  return Number.isFinite(atMs) &&
    atMs > 0 &&
    nowMs - atMs >= -ALLOWED_FUTURE_SKEW_MS &&
    nowMs - atMs <= maxAgeMs;
}

export function assessWorkerHealth(health) {
  const failures = [];
  if (health?.status !== 'ok') failures.push('worker_health_not_ok');
  if (health?.previewReadEnabled !== true) failures.push('preview_read_disabled');
  if (health?.shadowScheduleEnabled !== true) failures.push('shadow_schedule_disabled');
  if (health?.liveAcquisitionEnabled !== true) failures.push('live_acquisition_disabled');
  return { ok: failures.length === 0, failures };
}

export function assessSectionsSnapshot(snapshot, {
  nowMs = Date.now(),
  maxAgeMs = MAX_AUTHORITY_AGE_MS,
  requireCommittedEvidence = true,
} = {}) {
  const failures = [];
  if (![1, 2].includes(Number(snapshot?.schemaVersion))) {
    failures.push('unsupported_snapshot_schema');
  }
  const fetchedAt = timestampMs(snapshot?.fetchedAt);
  if (!inAgeWindow(fetchedAt, nowMs, maxAgeMs)) {
    failures.push('snapshot_not_fresh');
  }
  if (requireCommittedEvidence) {
    if (snapshot?.preview?.evidenceVerified !== true ||
      !String(snapshot?.preview?.epochId || '').trim()) {
      failures.push('committed_epoch_not_verified');
    }
  }
  const sectionMap = snapshot?.sections && typeof snapshot.sections === 'object' &&
    !Array.isArray(snapshot.sections) ? snapshot.sections : {};
  const worldRows = Array.isArray(sectionMap.world) ? sectionMap.world : [];
  const freshWorldRows = worldRows.filter(row =>
    row && inAgeWindow(timestampMs(row.publishedAt || row.pubDate || row.date), nowMs, MAX_STORY_AGE_MS)
  );
  if (freshWorldRows.length === 0) failures.push('no_fresh_world_stories');
  const sourceFamilies = new Set(freshWorldRows.map(row =>
    String(row.sourceGroup || row.source || '').trim().toLowerCase()
  ).filter(Boolean));
  if (sourceFamilies.size === 0) failures.push('world_source_provenance_missing');
  const representableFetchedAt = Number.isFinite(fetchedAt) &&
    Math.abs(fetchedAt) <= 8_640_000_000_000_000;
  return {
    ok: failures.length === 0,
    failures,
    fetchedAt: representableFetchedAt ? new Date(fetchedAt).toISOString() : null,
    ageMinutes: representableFetchedAt ? Math.round((nowMs - fetchedAt) / 60000) : null,
    epochId: requireCommittedEvidence
      ? String(snapshot?.preview?.epochId || '').slice(0, 96) || null : null,
    totalWorldRows: worldRows.length,
    freshWorldRows: freshWorldRows.length,
    freshWorldSourceGroups: sourceFamilies.size,
  };
}

async function publicGetJson(fetchImpl, url, { timeoutMs = 10000 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!response.ok) {
      return { ok: false, error: 'HTTP_' + response.status };
    }
    return { ok: true, body: await response.json() };
  } catch (error) {
    return {
      ok: false,
      error: error?.name === 'AbortError' ? 'request_timeout' : 'request_failed',
    };
  } finally {
    clearTimeout(timeout);
  }
}

function checkedResult(reply, validator, reason) {
  if (!reply.ok) return { ok: false, failures: [reason + '_' + reply.error] };
  return validator(reply.body);
}

export async function inspectSectionsSourceLiveness({
  fetchImpl = fetch,
  nowMs = Date.now(),
  workerUrl = DEFAULT_WORKER_URL,
  fallbackUrl = DEFAULT_FALLBACK_URL,
} = {}) {
  const healthUrl = new URL('/health', workerUrl).toString();
  // Each check is independent; a failed primary must never mask stale fallback.
  const [healthResponse, primaryResponse, fallbackResponse] = await Promise.all([
    publicGetJson(fetchImpl, healthUrl),
    publicGetJson(fetchImpl, workerUrl),
    publicGetJson(fetchImpl, fallbackUrl),
  ]);
  const worker = checkedResult(healthResponse, assessWorkerHealth, 'worker');
  const primary = checkedResult(primaryResponse, data =>
    assessSectionsSnapshot(data, { nowMs }), 'preview');
  const fallback = checkedResult(fallbackResponse, data =>
    assessSectionsSnapshot(data, {
      nowMs,
      maxAgeMs: MAX_FALLBACK_AGE_MS,
      requireCommittedEvidence: false,
    }), 'pages_fallback');
  const failures = [
    ...worker.failures.map(v => 'worker:' + v),
    ...primary.failures.map(v => 'preview:' + v),
    ...fallback.failures.map(v => 'pages_fallback:' + v),
  ];
  return {
    schemaVersion: 'nw-sections-operational-liveness/v1',
    checkedAt: new Date(nowMs).toISOString(),
    status: failures.length === 0 ? 'PASS' : 'FAIL',
    worker, primary, fallback, failures,
    verifiedProductionBrowser: false,
    note: 'Read-only public HTTP check. Browser UI and deployment validation are separate.',
  };
}

async function main() {
  const result = await inspectSectionsSourceLiveness();
  const output = process.env.SECTIONS_LIVENESS_REPORT || 'reports/sections-source-liveness.json';
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(result, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'PASS') process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error('Sections source liveness checker failed:', error?.message || String(error));
    process.exitCode = 1;
  });
}
