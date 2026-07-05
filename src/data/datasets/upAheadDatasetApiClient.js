const UP_AHEAD_DATASET_API_PATH = '/api/datasets/upAhead';

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

export async function fetchUpAheadDatasetApiData({ baseUrl, fetchImpl, signal } = {}) {
  const url = buildUpAheadDatasetApiUrl(baseUrl);
  const runner = fetchImpl || globalThis.fetch;
  if (!url || typeof runner !== 'function') return null;

  try {
    const response = await runner(url, { cache: 'no-cache', signal });
    if (!response?.ok) return null;
    return await readJson(response);
  } catch {
    return null;
  }
}
