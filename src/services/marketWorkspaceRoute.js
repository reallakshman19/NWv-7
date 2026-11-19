export const MARKET_WORKSPACE_IDS = Object.freeze(['indices', 'equity', 'funds', 'currency']);

export function getMarketWorkspaceFromHash(hash = '') {
  const query = String(hash).split('?')[1]?.split('#')[0] || '';
  const candidate = new URLSearchParams(query).get('view');
  return MARKET_WORKSPACE_IDS.includes(candidate) ? candidate : 'indices';
}

export function withMarketWorkspaceHash(hash = '#/markets', view = 'indices') {
  if (!MARKET_WORKSPACE_IDS.includes(view)) return hash;
  const [route, rawQuery = ''] = String(hash).split('?');
  const params = new URLSearchParams(rawQuery);
  params.set('view', view);
  return `${route || '#/markets'}?${params.toString()}`;
}
