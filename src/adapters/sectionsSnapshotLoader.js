import {
  getCloudflareSectionsPreviewUrl,
  getSectionsDataSource,
  getSectionsDataSourceRuntimeStatus,
  publishSectionsDataSourceStatus,
  SECTIONS_DATA_SOURCES,
} from '../utils/sectionsDataSource.js';
import { classifySectionsSnapshotAuthority } from './sectionsSnapshotAuthority.js';

const SECTION_SNAPSHOT_PATH = '/newsdata/sections_latest.json';
const SECTION_SNAPSHOT_TTL_MS = 10 * 60 * 1000;
const PREVIEW_SNAPSHOT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export const SECTION_SNAPSHOT_FOREGROUND_BUDGET_MS = 1500;
export const SECTION_SNAPSHOT_RETRY_BACKOFF_MS = Object.freeze([250, 500]);

let memorySnapshot = null;
let activeSnapshotLoad = null;
let activeSnapshotSource = null;
let activeSnapshotForce = false;
let cacheGeneration = 0;

export function isSupportedSectionsSnapshot(snapshot) {
  const schema = Number(snapshot?.schemaVersion || 0);
  return schema === 1 || schema === 2;
}

function getGithubSnapshotUrl() {
  const location = globalThis.window?.location;
  if (location?.origin === 'https://reallakshman19.github.io'
    && (location.pathname === '/NWv-7' || location.pathname.startsWith('/NWv-7/'))) {
    // Data refreshes commit independently of Pages builds. Read the published
    // repository snapshot so a working collector cannot leave the app stale.
    return 'https://raw.githubusercontent.com/reallakshman19/NWv-7/main/public/newsdata/sections_latest.json';
  }
  const base = import.meta.env.BASE_URL || '/';
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${cleanBase}${SECTION_SNAPSHOT_PATH}?t=${Date.now()}`;
}

function isUsablePreviewSnapshot(snapshot) {
  return classifySectionsSnapshotAuthority(snapshot).valid;
}

function checkSnapshotAuthority(snapshot, provider) {
  const quality = classifySectionsSnapshotAuthority(snapshot);
  if (quality.valid) return quality;
  const error = new Error(provider + ' sections snapshot invalid: ' + quality.reason);
  error.code = provider === 'Cloudflare' ? 'preview_snapshot_unusable' : 'github_snapshot_unusable';
  error.validationReason = quality.reason;
  throw error;
}

function withRuntimeSource(snapshot, requested, effective, fallbackReason = null, fallbackDetail = null) {
  const runtimeDataSource = { requested, effective, fallback: requested !== effective, fallbackReason };
  if (fallbackDetail) runtimeDataSource.fallbackDetail = fallbackDetail;
  return { ...snapshot, runtimeDataSource };
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function getRemainingBudgetMs(startedAt, budgetMs) {
  return Math.max(0, Number(budgetMs || 0) - (Date.now() - startedAt));
}

export function makeBudgetError(startedAt, budgetMs) {
  const elapsedMs = Date.now() - startedAt;
  const error = new Error(`sections snapshot budget exceeded after ${elapsedMs}ms`);
  error.code = 'snapshot-budget-exceeded';
  error.elapsedMs = elapsedMs;
  error.budgetMs = budgetMs;
  return error;
}

export function makeBudgetExit(error) {
  if (error?.code !== 'snapshot-budget-exceeded') return null;
  return {
    fallbackReason: 'snapshot-budget-exceeded',
    snapshotBudgetExceeded: true,
    snapshotElapsedMs: Number(error.elapsedMs || 0),
    snapshotBudgetMs: Number(error.budgetMs || 0),
  };
}

async function fetchWithBudget(url, remainingMs, {
  bypassCache = true, startedAt = Date.now(), budgetMs = remainingMs,
} = {}) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(makeBudgetError(startedAt, budgetMs));
    }, remainingMs);
  });
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, {
          cache: bypassCache ? 'no-store' : 'default',
          signal: controller.signal,
          headers: bypassCache && !/^https?:\/\//i.test(url) ? {
            'cache-control': 'no-cache',
            pragma: 'no-cache',
          } : undefined,
        });
        if (!response.ok) throw new Error(`sections snapshot fetch failed: HTTP ${response.status}`);
        return response.json();
      })(),
      deadline,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function requestSnapshotUrl(url, budgetMs, options = {}, startedAt = Date.now()) {
  let snapshot;
  let lastError;
  for (let attempt = 0; attempt <= SECTION_SNAPSHOT_RETRY_BACKOFF_MS.length; attempt += 1) {
    const remainingMs = getRemainingBudgetMs(startedAt, budgetMs);
    if (remainingMs <= 0) throw makeBudgetError(startedAt, budgetMs);
    try {
      snapshot = await fetchWithBudget(url, remainingMs, { ...options, startedAt, budgetMs });
      break;
    } catch (error) {
      lastError = error?.name === 'AbortError'
        ? makeBudgetError(startedAt, budgetMs)
        : error;
      const retryMs = SECTION_SNAPSHOT_RETRY_BACKOFF_MS[attempt] || 0;
      const waitMs = Math.min(retryMs, getRemainingBudgetMs(startedAt, budgetMs));
      if (attempt < SECTION_SNAPSHOT_RETRY_BACKOFF_MS.length && waitMs > 0) await sleep(waitMs);
    }
  }
  if (!snapshot) throw lastError || new Error('sections snapshot fetch failed');
  if (!isSupportedSectionsSnapshot(snapshot)) {
    throw new Error(`unsupported sections snapshot schema: ${snapshot?.schemaVersion}`);
  }
  return snapshot;
}

async function requestSectionsSnapshot(budgetMs, requestedSource = getSectionsDataSource()) {
  const startedAt = Date.now();
  const previewBudgetMs = Math.max(1, Math.floor(budgetMs * 2 / 3));
  if (requestedSource === SECTIONS_DATA_SOURCES.CLOUDFLARE_PREVIEW) {
    const previewUrl = getCloudflareSectionsPreviewUrl();
    if (previewUrl) {
      try {
        const previewSnapshot = await requestSnapshotUrl(previewUrl, previewBudgetMs, { bypassCache: true }, startedAt);
        checkSnapshotAuthority(previewSnapshot, 'Cloudflare');
        return withRuntimeSource(
          previewSnapshot,
          requestedSource,
          SECTIONS_DATA_SOURCES.CLOUDFLARE_PREVIEW,
        );
      } catch (error) {
        let githubSnapshot;
        try {
          githubSnapshot = await requestSnapshotUrl(getGithubSnapshotUrl(), budgetMs, {}, startedAt);
          checkSnapshotAuthority(githubSnapshot, 'GitHub');
        } catch (fallbackError) {
          fallbackError.primaryFailure = error?.code || error?.message || 'preview_snapshot_unavailable';
          fallbackError.primaryFailureDetail = error?.validationReason || null;
          throw fallbackError;
        }
        return withRuntimeSource(
          githubSnapshot,
          requestedSource,
          SECTIONS_DATA_SOURCES.GITHUB,
          error?.code || error?.message || 'preview_snapshot_unavailable',
          error?.validationReason || null,
        );
      }
    }
    const githubSnapshot = await requestSnapshotUrl(getGithubSnapshotUrl(), budgetMs, {}, startedAt);
    checkSnapshotAuthority(githubSnapshot, 'GitHub');
    return withRuntimeSource(
      githubSnapshot,
      requestedSource,
      SECTIONS_DATA_SOURCES.GITHUB,
      'preview_not_configured',
    );
  }

  const githubSnapshot = await requestSnapshotUrl(getGithubSnapshotUrl(), budgetMs, {}, startedAt);
  checkSnapshotAuthority(githubSnapshot, 'GitHub');
  return withRuntimeSource(
    githubSnapshot,
    requestedSource,
    SECTIONS_DATA_SOURCES.GITHUB,
  );
}

function completeSnapshotLoad(shared, snapshot, generation, requestedSource) {
  // A superseded load may resolve, but must never overwrite authority status.
  if (generation === cacheGeneration && activeSnapshotLoad === shared) {
    const now = Date.now();
    memorySnapshot = { loadedAt: now, requestedSource, snapshot };
    publishSectionsDataSourceStatus({
      ...snapshot.runtimeDataSource,
      failed: false,
      successfulAt: now,
      lastSuccessfulAt: now,
      lastSuccessfulEffective: snapshot.runtimeDataSource?.effective || null,
    });
    activeSnapshotLoad = null;
    activeSnapshotSource = null;
    activeSnapshotForce = false;
  }
  return snapshot;
}

function failSnapshotLoad(shared, error, generation) {
  if (generation === cacheGeneration && activeSnapshotLoad === shared) {
    const previous = getSectionsDataSourceRuntimeStatus();
    publishSectionsDataSourceStatus({
      requested: activeSnapshotSource,
      effective: 'unavailable',
      fallback: false,
      failed: true,
      failureAt: Date.now(),
      fallbackReason: error?.code || error?.message || 'all_sources_unavailable',
      failureDetail: error?.validationReason || null,
      primaryFailure: error?.primaryFailure || null,
      primaryFailureDetail: error?.primaryFailureDetail || null,
      lastSuccessfulAt: previous?.lastSuccessfulAt || previous?.successfulAt || null,
      lastSuccessfulEffective: previous?.lastSuccessfulEffective || (previous?.failed ? null : previous?.effective) || null,
    });
    memorySnapshot = null;
    activeSnapshotLoad = null;
    activeSnapshotSource = null;
    activeSnapshotForce = false;
  }
  throw error;
}

function startSnapshotLoad(budgetMs, requestedSource, force) {
  const generation = cacheGeneration;
  let shared;
  shared = requestSectionsSnapshot(budgetMs, requestedSource).then(
    snapshot => completeSnapshotLoad(shared, snapshot, generation, requestedSource),
    error => failSnapshotLoad(shared, error, generation),
  );
  activeSnapshotLoad = shared;
  activeSnapshotSource = requestedSource;
  activeSnapshotForce = force;
  return shared;
}

function getFreshMemorySnapshot(force, requestedSource = getSectionsDataSource()) {
  if (force || !memorySnapshot) return null;
  if (memorySnapshot.requestedSource !== requestedSource) return null;
  const ageMs = Date.now() - memorySnapshot.loadedAt;
  if (ageMs < 0 || ageMs >= SECTION_SNAPSHOT_TTL_MS ||
      getSectionsDataSourceRuntimeStatus()?.failed ||
      !classifySectionsSnapshotAuthority(memorySnapshot.snapshot).valid) return null;
  return memorySnapshot.snapshot;
}

export function loadSectionsSnapshot({
  force = false,
  budgetMs = SECTION_SNAPSHOT_FOREGROUND_BUDGET_MS,
} = {}) {
  const requestedSource = getSectionsDataSource();
  if (activeSnapshotLoad && activeSnapshotSource === requestedSource && (!force || activeSnapshotForce)) return activeSnapshotLoad;
  const cached = getFreshMemorySnapshot(force, requestedSource);
  if (cached) return Promise.resolve(cached);
  return startSnapshotLoad(budgetMs, requestedSource, force);
}

export function clearSectionsSnapshotLoadCache() {
  cacheGeneration += 1;
  memorySnapshot = null;
  activeSnapshotLoad = null;
  activeSnapshotSource = null;
  activeSnapshotForce = false;
}

export const __sectionsSnapshotLoaderInternalsForTest = {
  getFreshMemorySnapshot,
  isUsablePreviewSnapshot,
  requestSnapshotUrl,
  requestSectionsSnapshot,
};
