import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  R21_MARKET_WORKSPACE_IDS,
  R21_DEFAULT_WORKSPACE,
} from '../src/market/contracts/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

test('WP01-S01 index.js exists and exports canonical contract names via static audit', () => {
  const indexPath = path.join(root, 'src', 'market', 'features', 'overview', 'index.js');
  assert.ok(fs.existsSync(indexPath), 'index.js must exist');
  const content = fs.readFileSync(indexPath, 'utf8');

  const requiredExports = [
    'Overview',
    'MarketOverview',
    'MarketNav',
    'MOBILE_DIRECT_IDS',
    'MOBILE_MORE_IDS',
    'MOBILE_DISPLAY_LABELS',
    'MarketSessionHeader',
    'OverviewSlotErrorBoundary',
    'DEFAULT_OVERVIEW_SLOTS',
  ];

  for (const exp of requiredExports) {
    assert.ok(
      content.includes(exp),
      `index.js must export ${exp}`
    );
  }
});

test('WP01-S02 mobile navigation mapping aligns with frozen R21 9-workspace registry', () => {
  const navPath = path.join(root, 'src', 'market', 'features', 'overview', 'MarketNav.jsx');
  assert.ok(fs.existsSync(navPath), 'MarketNav.jsx must exist');
  const content = fs.readFileSync(navPath, 'utf8');

  // Verify direct and more definitions exist in the file
  assert.ok(content.includes("['overview', 'equity', 'funds']"), 'MOBILE_DIRECT_IDS must be overview, equity, funds');
  assert.ok(content.includes('MOBILE_MORE_IDS'), 'MOBILE_MORE_IDS must be defined');

  const directIds = ['overview', 'equity', 'funds'];
  const moreIds = R21_MARKET_WORKSPACE_IDS.filter(id => !directIds.includes(id));

  assert.equal(directIds.length, 3, 'Must have exactly 3 direct mobile tabs');
  assert.equal(moreIds.length, 6, 'Must have exactly 6 more destinations');
  assert.deepEqual(
    [...directIds, ...moreIds].sort(),
    [...R21_MARKET_WORKSPACE_IDS].sort(),
    'Direct + More must equal the frozen 9 workspaces'
  );
});

test('WP01-S03 authoritative tracked equity universe contains 16 symbols without duplication', () => {
  const universePath = path.join(root, 'src', 'config', 'marketEquityUniverse.json');
  assert.ok(fs.existsSync(universePath), 'marketEquityUniverse.json must exist');
  const universe = JSON.parse(fs.readFileSync(universePath, 'utf8'));

  assert.ok(Array.isArray(universe.symbols), 'symbols must be an array');
  assert.equal(universe.symbols.length, 16, 'Authoritative universe must have 16 symbols');
  assert.equal(new Set(universe.symbols).size, 16, 'Symbols must be unique');
  assert.ok(universe.symbols.includes('INFY'));
  assert.ok(universe.symbols.includes('RELIANCE'));
  assert.ok(universe.symbols.includes('TCS'));
});

test('WP01-S04 print stylesheet targets actual DOM selectors and suppresses .bottom-nav', () => {
  const printCssPath = path.join(root, 'src', 'market', 'features', 'overview', 'print.css');
  assert.ok(fs.existsSync(printCssPath), 'print.css must exist');
  const content = fs.readFileSync(printCssPath, 'utf8');

  assert.ok(content.includes('@media print'), 'Must contain @media print');
  assert.ok(content.includes('.bottom-nav'), 'Must target .bottom-nav from BottomNav.jsx');
  assert.ok(content.includes('nav.bottom-nav'), 'Must target nav.bottom-nav');
  assert.ok(content.includes('.market-nav'), 'Must suppress .market-nav in print');
  assert.ok(content.includes('display: none !important'), 'Must hide interactive navigation');
});

test('WP01-S05 overview stylesheet contains responsive intrinsic containment and focus states', () => {
  const cssPath = path.join(root, 'src', 'market', 'features', 'overview', 'overview.css');
  assert.ok(fs.existsSync(cssPath), 'overview.css must exist');
  const content = fs.readFileSync(cssPath, 'utf8');

  // Verify responsive breakpoints
  assert.ok(content.includes('@media (max-width: 767px)'), 'Must contain mobile breakpoint');
  assert.ok(content.includes(':focus-visible'), 'Must define high-contrast :focus-visible outlines');
  assert.ok(content.includes('minmax(0, 1fr)'), 'Must use intrinsic grid sizing to avoid clipping');
  // Verify we do NOT have blanket overflow-x: hidden on the main container
  assert.ok(!content.includes('.market-overview {\n  overflow-x: hidden;'), 'Should not use blanket overflow-x: hidden on container');
});

test('WP01-S06 shared files remain unmodified during WP-01', () => {
  // Read marketWorkspaceRoute.js to verify only 4 routes are active during WP-01
  const routePath = path.join(root, 'src', 'services', 'marketWorkspaceRoute.js');
  const routeContent = fs.readFileSync(routePath, 'utf8');
  assert.ok(
    routeContent.includes("['indices', 'equity', 'funds', 'currency']"),
    'marketWorkspaceRoute.js must remain untouched with 4 active routes'
  );
});

test('WP01-S07 WP-10 integration proposal is documented and bounded', () => {
  const patchPath = path.join(root, 'src', 'market', 'features', 'overview', 'INTEGRATION_PATCH_WP10.md');
  assert.ok(fs.existsSync(patchPath), 'INTEGRATION_PATCH_WP10.md must exist');
  const content = fs.readFileSync(patchPath, 'utf8');
  assert.ok(content.includes('WP-10 Integration Proposal'));
  assert.ok(content.includes('src/services/marketWorkspaceRoute.js'));
  assert.ok(content.includes('src/pages/MarketPage.jsx'));
});
