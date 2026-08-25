const SECTION_SNAPSHOT_PATH = '/newsdata/sections_latest.json';
const SECTION_SNAPSHOT_TTL_MS = 10 * 60 * 1000;

export const SECTION_SNAPSHOT_FOREGROUND_BUDGET_MS = 1500;
export const SECTION_SNAPSHOT_RETRY_BACKOFF_MS = Object.freeze([250, 500]);

let memorySnapshot = null;
let activeSnapshotLoad = null;
let cacheGeneration = 0;

export function isSupportedSectionsSnapshot(snapshot) {
  const schema = Number(snapshot?.schemaVersion || 0);
  return schema === 1 || schema === 2;
}

function getSnapshotUrl() {
  const base = import.meta?.env?.BASE_URL || '/';
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${cleanBase}${SECTION_SNAPSHOT_PATH}?t=${Date.now()}`;
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

async function fetchWithBudget(url, remainingMs) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), remainingMs) : null;
  try {
    return await fetch(url, {
      cache: 'no-store',
      signal: controller?.signal,
      headers: {
        'cache-control': 'no-cache',
        pragma: 'no-cache',
      },
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function requestSectionsSnapshot(budgetMs) {
  const startedAt = Date.now();
  let response;
  let lastError;
  for (let attempt = 0; attempt <= SECTION_SNAPSHOT_RETRY_BACKOFF_MS.length; attempt += 1) {
    const remainingMs = getRemainingBudgetMs(startedAt, budgetMs);
    if (remainingMs <= 0) throw makeBudgetError(startedAt, budgetMs);
    try {
      response = await fetchWithBudget(getSnapshotUrl(), remainingMs);
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

function completeSnapshotLoad(shared, snapshot, generation) {
  if (generation === cacheGeneration) {
    memorySnapshot = { loadedAt: Date.now(), snapshot };
  }
  if (activeSnapshotLoad === shared) activeSnapshotLoad = null;
  return snapshot;
}

function failSnapshotLoad(shared, error) {
  if (activeSnapshotLoad === shared) activeSnapshotLoad = null;
  throw error;
}

function startSnapshotLoad(budgetMs) {
  const generation = cacheGeneration;
  let shared;
  shared = requestSectionsSnapshot(budgetMs).then(
    snapshot => completeSnapshotLoad(shared, snapshot, generation),
    error => failSnapshotLoad(shared, error),
  );
  activeSnapshotLoad = shared;
  return shared;
}

function getFreshMemorySnapshot(force) {
  if (force || !memorySnapshot) return null;
  const ageMs = Date.now() - memorySnapshot.loadedAt;
  return ageMs < SECTION_SNAPSHOT_TTL_MS ? memorySnapshot.snapshot : null;
}

export function loadSectionsSnapshot({
  force = false,
  budgetMs = SECTION_SNAPSHOT_FOREGROUND_BUDGET_MS,
} = {}) {
  if (activeSnapshotLoad) return activeSnapshotLoad;
  const cached = getFreshMemorySnapshot(force);
  if (cached) return Promise.resolve(cached);
  return startSnapshotLoad(budgetMs);
}

export function clearSectionsSnapshotLoadCache() {
  cacheGeneration += 1;
  memorySnapshot = null;
  activeSnapshotLoad = null;
}

export const __sectionsSnapshotLoaderInternalsForTest = {
  getFreshMemorySnapshot,
  requestSectionsSnapshot,
};

