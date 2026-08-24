const DAILY_DIGEST_DATASET_API_PATH = '/api/datasets/dailyDigest';

function isDigestDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

export function buildDailyDigestDatasetApiUrl(baseUrl, digestDate) {
  const base = String(baseUrl || '').trim();
  if (!base || !isDigestDate(digestDate)) return null;
  const root = base.replace(/\/+$/, '');
  return `${root}${DAILY_DIGEST_DATASET_API_PATH}?date=${encodeURIComponent(digestDate)}`;
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

export async function fetchDailyDigestDatasetApi({ baseUrl, digestDate, fetchImpl, signal } = {}) {
  const url = buildDailyDigestDatasetApiUrl(baseUrl, digestDate);
  const runner = resolveFetchImpl(fetchImpl);
  if (!url) return { status: 'BACKEND_NOT_CONFIGURED', data: null, httpStatus: null };
  if (typeof runner !== 'function') return { status: 'FETCH_UNAVAILABLE', data: null, httpStatus: null };

  try {
    const response = await runner(url, { method: 'GET', cache: 'no-cache', signal });
    if (response?.status === 404) return { status: 'NOT_FROZEN', data: null, httpStatus: 404 };
    if (!response?.ok) return { status: 'HTTP_ERROR', data: null, httpStatus: response?.status || null };
    const data = await readJson(response);
    return data ? { status: 'READY', data, httpStatus: response.status } : { status: 'INVALID_JSON', data: null, httpStatus: response.status };
  } catch {
    return { status: 'FETCH_ERROR', data: null, httpStatus: null };
  }
}
