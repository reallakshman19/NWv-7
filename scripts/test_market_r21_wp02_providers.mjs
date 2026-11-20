import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

test('WP02-S01 index.js exists and exports canonical contract names', () => {
  const indexPath = path.join(root, 'src', 'market', 'features', 'providers', 'index.js');
  assert.ok(fs.existsSync(indexPath), 'index.js must exist');
  const content = fs.readFileSync(indexPath, 'utf8');

  const requiredExports = [
    'MarketProviderBoard',
    'IndexSectorPanel',
    'BSE_GROUPS',
    'BSE_CATALOG',
    'BSE_SUPPORTED_INDICES',
    'BSE_SUPPORTED_EQUITIES',
    'isSupportedBseSymbol',
    'getBseTradingViewUrl',
    'getWidgetSymbols',
  ];

  for (const exp of requiredExports) {
    assert.ok(content.includes(exp), `index.js must export ${exp}`);
  }
});

test('WP02-S02 BSE catalog enforces exchange qualification and widget verification', async () => {
  const {
    BSE_GROUPS,
    BSE_CATALOG,
    BSE_SUPPORTED_INDICES,
    BSE_SUPPORTED_EQUITIES,
    isSupportedBseSymbol,
  } = await import('../src/market/features/providers/bseCoverage.js');

  assert.deepEqual(BSE_GROUPS, ['indices', 'equities']);

  // Every catalog key must start with BSE:
  for (const [key, item] of Object.entries(BSE_CATALOG)) {
    assert.ok(key.startsWith('BSE:'), `Catalog key ${key} must start with BSE:`);
    assert.equal(item.key, key);
    assert.ok(typeof item.name === 'string');
    assert.ok(typeof item.providerUrl === 'string');
    assert.ok(item.providerUrl.startsWith('https://www.tradingview.com/symbols/BSE-'));
  }

  // Verified baseline symbols
  assert.ok(isSupportedBseSymbol('BSE:SENSEX'));
  assert.ok(isSupportedBseSymbol('BSE:BSE500'));
  assert.ok(isSupportedBseSymbol('BSE:RELIANCE'));
  assert.ok(isSupportedBseSymbol('BSE:TCS'));
  assert.ok(isSupportedBseSymbol('BSE:INFY'));

  // Unqualified candidates must NOT be widget-verified
  assert.equal(isSupportedBseSymbol('BSE:BSE100'), false);
  assert.equal(isSupportedBseSymbol('BSE:BSEMID'), false);
  assert.equal(isSupportedBseSymbol('BSE:HDFCBANK'), false);

  // Supported arrays must contain only widgetVerified: true items
  assert.equal(BSE_SUPPORTED_INDICES.length, 2);
  assert.equal(BSE_SUPPORTED_EQUITIES.length, 3);
});

test('WP02-S03 catalog lookup resolves to approved HTTPS URLs without arbitrary synthesis', async () => {
  const { getBseTradingViewUrl } = await import('../src/market/features/providers/bseCoverage.js');

  // Exact catalog lookups
  assert.equal(
    getBseTradingViewUrl('BSE:SENSEX'),
    'https://www.tradingview.com/symbols/BSE-SENSEX/'
  );
  assert.equal(
    getBseTradingViewUrl('BSE:INFY'),
    'https://www.tradingview.com/symbols/BSE-INFY/'
  );

  // Unqualified/unlisted symbols fallback to safe search URL, never synthesized chart URLs
  const searchFallback = getBseTradingViewUrl('UNKNOWN_SYM');
  assert.ok(searchFallback.startsWith('https://www.tradingview.com/search/?q='));
});

test('WP02-S04 providers stylesheet contains responsive containment and height constraints', () => {
  const cssPath = path.join(root, 'src', 'market', 'features', 'providers', 'providers.css');
  assert.ok(fs.existsSync(cssPath), 'providers.css must exist');
  const content = fs.readFileSync(cssPath, 'utf8');

  assert.ok(content.includes('380px'), 'Widget container must have defined height constraint');
  assert.ok(content.includes(':focus-visible'), 'Must define visible focus states');
  assert.ok(content.includes('@media'), 'Must include responsive rules');
});

test('WP02-S05 shared files remain 100% untouched against foundation commit (WP02-T14)', () => {
  const foundationSHA = '2510cac78e4ec177efaaedfb8de2ac3504415813';
  const protectedFiles = [
    'src/pages/MarketPage.jsx',
    'src/components/market/BseMarketWidget.jsx',
    'src/services/marketWorkspaceRoute.js',
    'src/context/MarketContext.jsx',
    'src/components/market/MarketWorkspaceTools.jsx',
    'src/market/contracts/index.js',
    'src/market/registry/sourceRegistry.js',
    'src/market/registry/workspaceRegistry.js',
  ];

  for (const file of protectedFiles) {
    const diff = execSync(`git diff ${foundationSHA} -- "${file}"`, { cwd: root, encoding: 'utf8' }).trim();
    assert.equal(diff, '', `Protected file ${file} has unauthorized diff against foundation commit`);
  }
});

test('WP02-S06 integration patch proposal is documented and bounded', () => {
  const patchPath = path.join(root, 'src', 'market', 'features', 'providers', 'INTEGRATION_PATCH_WP10.md');
  assert.ok(fs.existsSync(patchPath), 'INTEGRATION_PATCH_WP10.md must exist');
  const content = fs.readFileSync(patchPath, 'utf8');
  assert.ok(content.includes('WP-10 Integration Proposal'));
  assert.ok(content.includes('MarketProviderBoard'));
  assert.ok(content.includes('IndexSectorPanel'));
});
