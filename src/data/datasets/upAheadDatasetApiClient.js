const UP_AHEAD_DATASET_API_PATH = '/api/datasets/upAhead';
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

export async function fetchUpAheadDatasetApiResponse({ baseUrl, fetchImpl, signal } = {}) {
  const url = buildUpAheadDatasetApiUrl(baseUrl);
  const runner = resolveFetchImpl(fetchImpl);
  if (!url || typeof runner !== 'function') {
    return { data: null, diagnostics: normalizeUpAheadEdgeDiagnostics(null) };
  }

  try {
    const response = await runner(url, { cache: 'no-cache', signal });
    const diagnostics = normalizeUpAheadEdgeDiagnostics(response);
    if (!response?.ok) return { data: null, diagnostics };
    return { data: await readJson(response), diagnostics };
  } catch {
    return { data: null, diagnostics: normalizeUpAheadEdgeDiagnostics(null) };
  }
}

export async function fetchUpAheadDatasetApiData(options = {}) {
  const result = await fetchUpAheadDatasetApiResponse(options);
  return result?.data || null;
}
