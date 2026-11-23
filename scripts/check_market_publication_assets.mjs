import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
    'equities.eodBhavcopy.sampleNse', 'equities.eodBhavcopy.sampleBse',
    'mutualFunds', 'fx', 'commodities'
  ],
  'market_source_health.json': []
});

const note = value => typeof value === 'string';
const count = value => Number.isSafeInteger(value) && value >= 0;
const symbols = value => Array.isArray(value) && value.every(symbol =>
  typeof symbol === 'string' && /^[A-Z0-9][A-Z0-9&._-]*$/.test(symbol)
);
const commonMetadata = {
  schemaVersion: 'market-free-open-v1', generatedAt: null, generated_at: null, fetchedAt: null
};
const sourceStatus = { status: note, reason: note };
const POLICY_METADATA = {
  'market_snapshot.json': {
    ...commonMetadata, sourceMode: 'free-open-only', notice: note, ipoLastCheckedAt: null,
    equityCoverage: { universeSize: count, quotedCount: 0, unavailableSymbols: symbols },
    movers: { scope: note }, ipo: {}, fiidii: {}, errors: {},
    sourceHealth: { indices: sourceStatus, equities: sourceStatus, ipo: sourceStatus }
  },
  'mutual_fund_snapshot.json': {
    ...commonMetadata, sourceHealth: sourceStatus
  },
  'market_metrics.json': {
    ...commonMetadata, asOf: { equities: null, mutualFunds: null, fx: null },
    equities: { movers: {}, eodBhavcopy: { nseRows: 0, bseRows: 0 } },
    sourceHealth: { ...commonMetadata, sections: {}, reason: note }
  },
  'market_source_health.json': {
    ...commonMetadata,
    validation: { status: 'HOLD', indices: 0, equities: 0, reason: note },
    sources: { indices: sourceStatus, equities: sourceStatus, mutualFunds: sourceStatus, ipo: sourceStatus }
  }
};

function checkMetadata(value, rule, field, emptyPaths, errors) {
  if (rule === null || typeof rule !== 'object') {
    const valid = typeof rule === 'function' ? rule(value) : value === rule;
    if (!valid) errors.push('INVALID_POLICY_METADATA:' + field);
    return;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push('INVALID_POLICY_METADATA:' + field);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const childField = field ? field + '.' + key : key;
    if (emptyPaths.includes(childField)) continue;
    if (Object.hasOwn(rule, key)) {
      checkMetadata(child, rule[key], childField, emptyPaths, errors);
    } else {
      errors.push('UNEXPECTED_POLICY_FIELD:' + childField);
    }
  }
}

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
  const emptyPaths = EMPTY_PATHS[name];
  for (const field of emptyPaths) {
    const rows = getPath(payload, field);
    if (!Array.isArray(rows) || rows.length) errors.push('NONEMPTY_FINANCIAL_DATA:' + field);
  }
  checkMetadata(payload, POLICY_METADATA[name], '', emptyPaths, errors);
  // Reject known legacy sources and quote fields in the decoded policy data,
  // including keys or endpoints that were escaped in the input text.
  const forbidden = [
    /yahoo[-_]yfinance/i,
    /query1\.finance\.yahoo\.com/i,
    /NAVAll\.txt/i,
    /"rate"\s*:/i,
    /"(?:price|nav|lastPrice|value|changePercent)"\s*:/i
  ];
  const decoded = JSON.stringify(payload);
  for (const match of forbidden) {
    if (match.test(decoded) || match.test(raw)) errors.push('FORBIDDEN_MARKET_PAYLOAD:' + match.source);
  }
  return errors;
}

function listJson(directory) {
  return fs.readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter(entry => (entry.isFile() || entry.isSymbolicLink()) && /\.json$/i.test(entry.name))
    .map(entry => path.relative(directory, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'));
}

export function auditMarketPublicationRoot(root, { required = true } = {}) {
  const directory = path.join(root, 'data');
  const errors = [];
  if (!fs.existsSync(directory)) {
    return { root, errors: required ? ['MISSING_DATA_ROOT'] : [], filesChecked: [] };
  }
  const files = listJson(directory);
  const forbiddenAssetNames = files.filter(name =>
    /^(?:fx_snapshot|forex_snapshot|market_legacy_quotes)\b/i.test(path.basename(name))
  );
  for (const name of forbiddenAssetNames) errors.push('FORBIDDEN_PUBLIC_FX_ASSET:' + name);
  // A new financial JSON filename must undergo its own licensing and data
  // contract review; otherwise a renamed exporter bypasses fixed-file checks.
  const financialNames = /(?:market|fx|forex|nav|fund|equity|stocks?|indices|quotes?|bhavcopy|^nse|^bse|^yahoo)/i;
  for (const name of files) {
    if (name.split('/').some(part => financialNames.test(part)) && !QUOTE_FREE_ASSETS.includes(name) &&
        !forbiddenAssetNames.includes(name)) {
      errors.push('UNREVIEWED_FINANCIAL_PUBLIC_ASSET:' + name);
    }
  }
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const roots = process.argv.slice(2);
  const results = auditAllMarketPublicationRoots(roots.length ? roots : undefined);
  const issues = results.flatMap(x => x.errors.map(error => x.root + ': ' + error));
  console.log(JSON.stringify({ status: issues.length ? 'FAIL' : 'PASS', roots: results }, null, 2));
  if (issues.length) process.exitCode = 1;
}
