import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import {
  auditMarketPublicationRoot,
  validateQuoteFreeFinancialAsset,
  QUOTE_FREE_ASSETS
} from './check_market_publication_assets.mjs';

function policyPayload(name) {
  return JSON.parse(fs.readFileSync(path.join('public/data', name), 'utf8'));
}

test('R3D-S01 true free-only public and docs roots pass without pretending to have observations', () => {
  for (const root of ['public', 'docs']) {
    const result = auditMarketPublicationRoot(root);
    assert.deepEqual(result.errors, [], root + ': ' + result.errors.join(', '));
  }
  assert.equal(fs.existsSync('public/data/fx_snapshot.json'), false);
  assert.equal(fs.existsSync('docs/data/fx_snapshot.json'), false);
});

test('R3D-S02 a legacy Yahoo FX file is rejected at the publication boundary', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nw7-market-guard-'));
  try {
    fs.mkdirSync(path.join(root, 'data'));
    for (const file of QUOTE_FREE_ASSETS) {
      fs.copyFileSync(path.join('public/data', file), path.join(root, 'data', file));
    }
    fs.writeFileSync(path.join(root, 'data', 'fx_snapshot.json'),
      JSON.stringify({ currencies: [{ symbol: 'USDINR=X', source: 'yahoo-yfinance', rate: 88 }] }));
    const failed = auditMarketPublicationRoot(root);
    assert.ok(failed.errors.some(e => e.includes('FORBIDDEN_PUBLIC_FX_ASSET:fx_snapshot.json')));
    fs.rmSync(path.join(root, 'data', 'fx_snapshot.json'));
    fs.writeFileSync(path.join(root, 'data', 'nse_quotes.json'),
      JSON.stringify({ value: 999, source: 'unlicensed' }));
    assert.ok(auditMarketPublicationRoot(root).errors.some(e =>
      e.includes('UNREVIEWED_FINANCIAL_PUBLIC_ASSET:nse_quotes.json')));
    fs.rmSync(path.join(root, 'data', 'nse_quotes.json'));
    assert.deepEqual(auditMarketPublicationRoot(root).errors, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('R3D-S03 injected price, NAV, rate, quote row, timestamp and policy override all fail closed', () => {
  const market = policyPayload('market_snapshot.json');
  const nav = policyPayload('mutual_fund_snapshot.json');
  const probes = [
    ['market_snapshot.json', { ...market, sourceMode: 'live' }, 'SOURCE_MODE_NOT_FREE_OPEN_ONLY'],
    ['market_snapshot.json', { ...market, fetchedAt: new Date().toISOString() }, 'UNAUTHORIZED_PUBLICATION_CLOCK'],
    ['market_snapshot.json', { ...market, indices: [{ name: 'NIFTY', value: 1 }] }, 'NONEMPTY_FINANCIAL_DATA'],
    ['market_snapshot.json', { ...market, surprise: { price: 200 } }, 'FORBIDDEN_MARKET_PAYLOAD'],
    ['mutual_fund_snapshot.json', { ...nav, mutualFunds: [{ nav: 1.5 }] }, 'NONEMPTY_FINANCIAL_DATA']
  ];
  for (const [name, data, failure] of probes) {
    const errors = validateQuoteFreeFinancialAsset(name, data);
    assert.ok(errors.some(x => x.includes(failure)),
      'Validator failed to reject ' + failure + ': ' + JSON.stringify(errors));
  }
});

test('R3D-S04 inactive market manifests use policy-only validation, not fake timestamp freshness', () => {
  const output = execFileSync(process.execPath,
    ['scripts/test_public_snapshot_freshness_static.mjs'],
    { env: { ...process.env, SNAPSHOT_FRESHNESS_FILES: 'market_snapshot.json,mutual_fund_snapshot.json' },
      encoding: 'utf8' });
  assert.match(output, /QUOTE_FREE_POLICY_ONLY/);
  assert.match(output, /"freshnessVerified": false/);
  assert.match(output, /"status": "PASS"/);
  const integrity = execFileSync(process.execPath,
    ['scripts/test_market_snapshot_integrity.mjs'], { encoding: 'utf8' });
  assert.match(integrity, /PASS_POLICY_ONLY/);
  assert.match(integrity, /"nativeQuotesAvailable": false/);
});

test('R3D-S05 weather snapshot still requires its authentic freshness clock', () => {
  const code = fs.readFileSync('scripts/test_public_snapshot_freshness_static.mjs', 'utf8');
  assert.match(code, /fileName === 'weather_snapshot\.json'/);
  assert.match(code, /assertWeatherCitiesFresh\(/);
  assert.match(code, /assertFresh\(/);
});
