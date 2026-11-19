const UP_AHEAD_DATASET_API_PATH = '/api/datasets/upAhead';
const DEFAULT_DATASET_API_TIMEOUT_MS = 4500;
const EDGE_DIAGNOSTIC_HEADERS = {
  source: 'X-NW-UpAhead-Source',
  reason: 'X-NW-UpAhead-Reason',
  freshness: 'X-NW-UpAhead-Freshness',
  ageSeconds: 'X-NW-UpAhead-Age-Seconds',
};

export function buildUpAheadDatasetApiUrl(baseUrl) {
  const base = String(baseUrl || '').trim();
  if (!base) return null;
  return `${base.replace(/\/+$/, '')}${UP_AHEAD_DATASET_API_PATH}`;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function resolveFetchImpl(fetchImpl) {
  return fetchImpl === undefined ? globalThis.fetch : fetchImpl;
}

function readHeader(response, headerName) {
  const value = response?.headers?.get?.(headerName);
  return value ? String(value) : 'unknown';
}

export function normalizeUpAheadEdgeDiagnostics(response) {
  return {
    source: readHeader(response, EDGE_DIAGNOSTIC_HEADERS.source),
    reason: readHeader(response, EDGE_DIAGNOSTIC_HEADERS.reason),
    freshness: readHeader(response, EDGE_DIAGNOSTIC_HEADERS.freshness),
    ageSeconds: readHeader(response, EDGE_DIAGNOSTIC_HEADERS.ageSeconds),
  };
}

export async function fetchUpAheadDatasetApiResponse({ baseUrl, fetchImpl, signal, timeoutMs = DEFAULT_DATASET_API_TIMEOUT_MS } = {}) {
  const url = buildUpAheadDatasetApiUrl(baseUrl);
  const runner = resolveFetchImpl(fetchImpl);
  if (!url || typeof runner !== 'function') {
    return { data: null, diagnostics: normalizeUpAheadEdgeDiagnostics(null) };
  }

  const budgetMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_DATASET_API_TIMEOUT_MS;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener?.('abort', onAbort, { once: true });
  let timeoutId;
  let deadlineExpired = false;
  const deadline = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      deadlineExpired = true;
      controller.abort();
      const error = new Error('Up Ahead Worker API deadline exceeded');
      error.code = 'dataset-api-timeout';
      reject(error);
    }, budgetMs);
  });

  try {
    const response = await Promise.race([
      (async () => {
        const result = await runner(url, { cache: 'no-cache', signal: controller.signal });
        const diagnostics = normalizeUpAheadEdgeDiagnostics(result);
        return { data: result?.ok ? await readJson(result) : null, diagnostics };
      })(),
      deadline,
    ]);
    return response;
  } catch (error) {
    return {
      data: null,
      diagnostics: {
        ...normalizeUpAheadEdgeDiagnostics(null),
        reason: deadlineExpired || error?.code === 'dataset-api-timeout' ? 'dataset-api-timeout'
          : signal?.aborted ? 'request-aborted' : 'fetch-error',
      },
    };
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener?.('abort', onAbort);
  }
}

export async function fetchUpAheadDatasetApiData(options = {}) {
  const result = await fetchUpAheadDatasetApiResponse(options);
  return result?.data || null;
}
