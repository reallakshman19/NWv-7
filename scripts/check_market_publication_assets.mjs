import fs from 'node:fs';
import path from 'node:path';

/**
 * Fail closed on quote-bearing public Market asset reintroduction.
 * These checks apply to both source publication roots and the actual Vite
 * output. Historical Git history remains accessible and is out of scope.
 */
export const QUOTE_FREE_ASSETS = Object.freeze([
  'market_snapshot.json', 'mutual_fund_snapshot.json',
  'market_metrics.json', 'market_source_health.json'
]);

const EMPTY_PATHS = Object.freeze({
  'market_snapshot.json': [
    'indices', 'globalIndices', 'sectorals', 'commodities', 'currencies',
    'equities', 'mutualFunds', 'nfo', 'ipo.live', 'ipo.upcoming', 'ipo.recent',
    'movers.gainers', 'movers.losers'
  ],
  'mutual_fund_snapshot.json': ['mutualFunds'],
  'market_metrics.json': [
    'equities.indices', 'equities.globalIndices',
    'equities.movers.gainers', 'equities.movers.losers',
    'mutualFunds', 'fx', 'commodities'
  ],
  'market_source_health.json': []
});

function getPath(target, dotPath) {
  return dotPath.split('.').reduce((o, key) => o?.[key], target);
}

export function validateQuoteFreeFinancialAsset(name, payload, raw = '') {
  const errors = [];
  if (!QUOTE_FREE_ASSETS.includes(name)) return ['NOT_A_QUOTE_FREE_ASSET'];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return ['ASSET_NOT_OBJECT'];
  }
  if (payload.schemaVersion !== 'market-free-open-v1') {
    errors.push('MISSING_FREE_OPEN_POLICY_SCHEMA');
  }
  if (name === 'market_snapshot.json' && payload.sourceMode !== 'free-open-only') {
    errors.push('SOURCE_MODE_NOT_FREE_OPEN_ONLY');
  }
  for (const clock of ['fetchedAt', 'generatedAt', 'generated_at']) {
    if (payload[clock] != null) errors.push('UNAUTHORIZED_PUBLICATION_CLOCK:' + clock);
  }
  for (const field of EMPTY_PATHS[name]) {
    const rows = getPath(payload, field);
    if (!Array.isArray(rows) || rows.length) errors.push('NONEMPTY_FINANCIAL_DATA:' + field);
  }
  // A policy asset must not carry quote, NAV, exchange-source, or injected
  // endpoint values even in renamed/dormant nested records.
  const forbidden = [
    /yahoo[-_]yfinance/i,
    /query1\.finance\.yahoo\.com/i,
    /NAVAll\.txt/i,
    /"rate"\s*:/i,
    /"(?:price|nav|lastPrice|value|changePercent)"\s*:/i
  ];
  for (const match of forbidden) {
    if (match.test(raw || JSON.stringify(payload))) errors.push('FORBIDDEN_MARKET_PAYLOAD:' + match.source);
  }
  return errors;
}

function listJson(root) {
  const dir = path.join(root, 'data');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(name => name.endsWith('.json'));
}

export function auditMarketPublicationRoot(root, { required = true } = {}) {
  const files = listJson(root);
  const errors = [];
  if (!fs.existsSync(path.join(root, 'data'))) {
    return { root, errors: required ? ['MISSING_DATA_ROOT'] : [], filesChecked: [] };
  }
  const forbiddenAssetNames = files.filter(name =>
    /^(?:fx_snapshot|forex_snapshot|market_legacy_quotes)\b/i.test(name)
  );
  for (const name of forbiddenAssetNames) errors.push('FORBIDDEN_PUBLIC_FX_ASSET:' + name);
  const checked = [];
  for (const name of QUOTE_FREE_ASSETS) {
    if (!files.includes(name)) {
      if (root !== 'docs' || name !== 'market_source_health.json') {
        errors.push('MISSING_QUOTE_FREE_ASSET:' + name);
      }
      continue;
    }
    try {
      const raw = fs.readFileSync(path.join(root, 'data', name), 'utf8');
      const payload = JSON.parse(raw);
      errors.push(...validateQuoteFreeFinancialAsset(name, payload, raw).map(e => name + ':' + e));
      checked.push(name);
    } catch (e) {
      errors.push('INVALID_JSON:' + name + ':' + e.message);
    }
  }
  return { root, errors, filesChecked: checked };
}

export function auditAllMarketPublicationRoots(roots = ['public', 'docs', 'dist']) {
  return roots.map(root => auditMarketPublicationRoot(root));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const roots = process.argv.slice(2);
  const results = auditAllMarketPublicationRoots(roots.length ? roots : undefined);
  const issues = results.flatMap(x => x.errors.map(error => x.root + ': ' + error));
  console.log(JSON.stringify({ status: issues.length ? 'FAIL' : 'PASS', roots: results }, null, 2));
  if (issues.length) process.exitCode = 1;
}
