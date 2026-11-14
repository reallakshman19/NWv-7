import {
  getCloudflareSectionsPreviewUrl,
  getSectionsDataSource,
  publishSectionsDataSourceStatus,
  SECTIONS_DATA_SOURCES,
} from '../utils/sectionsDataSource.js';

const SECTION_SNAPSHOT_PATH = '/newsdata/sections_latest.json';
const SECTION_SNAPSHOT_TTL_MS = 10 * 60 * 1000;
const PREVIEW_SNAPSHOT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export const SECTION_SNAPSHOT_FOREGROUND_BUDGET_MS = 1500;
export const SECTION_SNAPSHOT_RETRY_BACKOFF_MS = Object.freeze([250, 500]);

let memorySnapshot = null;
let activeSnapshotLoad = null;
let activeSnapshotSource = null;
let cacheGeneration = 0;

export function isSupportedSectionsSnapshot(snapshot) {
  const schema = Number(snapshot?.schemaVersion || 0);
  return schema === 1 || schema === 2;
}

function getGithubSnapshotUrl() {
  const base = import.meta.env.BASE_URL || '/';
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${cleanBase}${SECTION_SNAPSHOT_PATH}?t=${Date.now()}`;
}

function isUsablePreviewSnapshot(snapshot) {
  const fetchedAt = Number(snapshot?.fetchedAt || 0);
  const ageMs = Date.now() - fetchedAt;
  const sections = snapshot?.sections;
  return isSupportedSectionsSnapshot(snapshot) &&
    Number.isFinite(fetchedAt) &&
    fetchedAt > 0 &&
    ageMs >= 0 &&
    ageMs <= PREVIEW_SNAPSHOT_MAX_AGE_MS &&
    sections &&
    typeof sections === 'object' &&
    !Array.isArray(sections);
}

function withRuntimeSource(snapshot, requested, effective, fallbackReason = null) {
  const runtimeDataSource = {
    requested,
    effective,
    fallback: requested !== effective,
    fallbackReason,
  };
  publishSectionsDataSourceStatus(runtimeDataSource);
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

async function fetchWithBudget(url, remainingMs, { bypassCache = true } = {}) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), remainingMs) : null;
  try {
    return await fetch(url, {
      cache: bypassCache ? 'no-store' : 'default',
      signal: controller?.signal,
      headers: bypassCache ? {
        'cache-control': 'no-cache',
        pragma: 'no-cache',
      } : undefined,
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function requestSnapshotUrl(url, budgetMs, options = {}) {
  const startedAt = Date.now();
  let response;
  let lastError;
  for (let attempt = 0; attempt <= SECTION_SNAPSHOT_RETRY_BACKOFF_MS.length; attempt += 1) {
    const remainingMs = getRemainingBudgetMs(startedAt, budgetMs);
    if (remainingMs <= 0) throw makeBudgetError(startedAt, budgetMs);
    try {
      response = await fetchWithBudget(url, remainingMs, options);
      if (!response.ok) throw new Error(`sections snapshot fetch failed: HTTP ${response.status}`);
      break;
    } catch (error) {
      lastError = error?.name === 'AbortError'
        ? makeBudgetError(startedAt, budgetMs)
        : error;
      const retryMs = SECTION_SNAPSHOT_RETRY_BACKOFF_MS[attempt] || 0;
      const waitMs = Math.min(retryMs, getRemainingBudgetMs(startedAt, budgetMs));
      if (attempt < SECTION_SNAPSHOT_RETRY_BACKOFF_MS.length && waitMs > 0) {
        await sleep(waitMs);
      }
    }
  }
  if (!response?.ok) {
    throw lastError || new Error('sections snapshot fetch failed');
  }
  const snapshot = await response.json();
  if (!isSupportedSectionsSnapshot(snapshot)) {
    throw new Error(`unsupported sections snapshot schema: ${snapshot?.schemaVersion}`);
  }
  return snapshot;
}

async function requestSectionsSnapshot(budgetMs, requestedSource = getSectionsDataSource()) {
  if (requestedSource === SECTIONS_DATA_SOURCES.CLOUDFLARE_PREVIEW) {
    const previewUrl = getCloudflareSectionsPreviewUrl();
    if (previewUrl) {
      try {
        const previewSnapshot = await requestSnapshotUrl(previewUrl, budgetMs, { bypassCache: true });
        if (!isUsablePreviewSnapshot(previewSnapshot)) {
          const error = new Error('Cloudflare Preview snapshot is stale or incomplete');
          error.code = 'preview_snapshot_unusable';
          throw error;
        }
        return withRuntimeSource(
          previewSnapshot,
          requestedSource,
          SECTIONS_DATA_SOURCES.CLOUDFLARE_PREVIEW,
        );
      } catch (error) {
        const githubSnapshot = await requestSnapshotUrl(getGithubSnapshotUrl(), budgetMs);
        return withRuntimeSource(
          githubSnapshot,
          requestedSource,
          SECTIONS_DATA_SOURCES.GITHUB,
          error?.code || error?.message || 'preview_snapshot_unavailable',
        );
      }
    }
    const githubSnapshot = await requestSnapshotUrl(getGithubSnapshotUrl(), budgetMs);
    return withRuntimeSource(
      githubSnapshot,
      requestedSource,
      SECTIONS_DATA_SOURCES.GITHUB,
      'preview_not_configured',
    );
  }

  const githubSnapshot = await requestSnapshotUrl(getGithubSnapshotUrl(), budgetMs);
  return withRuntimeSource(
    githubSnapshot,
    requestedSource,
    SECTIONS_DATA_SOURCES.GITHUB,
  );
}

function completeSnapshotLoad(shared, snapshot, generation, requestedSource) {
  if (generation === cacheGeneration) {
    memorySnapshot = { loadedAt: Date.now(), requestedSource, snapshot };
  }
  if (activeSnapshotLoad === shared) {
    activeSnapshotLoad = null;
    activeSnapshotSource = null;
  }
  return snapshot;
}

function failSnapshotLoad(shared, error) {
  if (activeSnapshotLoad === shared) {
    activeSnapshotLoad = null;
    activeSnapshotSource = null;
  }
  throw error;
}

function startSnapshotLoad(budgetMs, requestedSource) {
  const generation = cacheGeneration;
  let shared;
  shared = requestSectionsSnapshot(budgetMs, requestedSource).then(
    snapshot => completeSnapshotLoad(shared, snapshot, generation, requestedSource),
    error => failSnapshotLoad(shared, error),
  );
  activeSnapshotLoad = shared;
  activeSnapshotSource = requestedSource;
  return shared;
}

function getFreshMemorySnapshot(force, requestedSource = getSectionsDataSource()) {
  if (force || !memorySnapshot) return null;
  if (memorySnapshot.requestedSource !== requestedSource) return null;
  const ageMs = Date.now() - memorySnapshot.loadedAt;
  return ageMs < SECTION_SNAPSHOT_TTL_MS ? memorySnapshot.snapshot : null;
}

export function loadSectionsSnapshot({
  force = false,
  budgetMs = SECTION_SNAPSHOT_FOREGROUND_BUDGET_MS,
} = {}) {
  const requestedSource = getSectionsDataSource();
  if (activeSnapshotLoad && activeSnapshotSource === requestedSource) return activeSnapshotLoad;
  const cached = getFreshMemorySnapshot(force, requestedSource);
  if (cached) return Promise.resolve(cached);
  return startSnapshotLoad(budgetMs, requestedSource);
}

export function clearSectionsSnapshotLoadCache() {
  cacheGeneration += 1;
  memorySnapshot = null;
  activeSnapshotLoad = null;
  activeSnapshotSource = null;
}

export const __sectionsSnapshotLoaderInternalsForTest = {
  getFreshMemorySnapshot,
  isUsablePreviewSnapshot,
  requestSnapshotUrl,
  requestSectionsSnapshot,
};
