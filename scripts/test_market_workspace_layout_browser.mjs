/**
 * Browser layout regression for the nine existing Market workspaces.
 * Run against a local Vite preview via MARKET_PREVIEW_URL.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { R21_MARKET_WORKSPACES } from '../src/market/registry/workspaceRegistry.js';

const base = new URL(process.env.MARKET_PREVIEW_URL || 'http://127.0.0.1:4173/');
base.hash = '/markets';
const directMobileLabels = { overview: 'Overview', equity: 'Stocks', funds: 'Funds' };
const layoutFailures = [];
const browsers = [
  { width: 320, height: 760 },
  { width: 390, height: 844 },
  { width: 768, height: 900 },
  { width: 1366, height: 900 },
  { width: 390, height: 844, fontSize: 32 },
];

async function assertFits(panel, name) {
  const geometry = await panel.evaluate(node => ({
    overflow: node.scrollWidth - node.clientWidth,
    viewport: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  if (geometry.overflow > 2 || geometry.viewport > 2) {
    layoutFailures.push(name + ': ' + JSON.stringify(geometry));
  }
}

async function chooseWorkspace(nav, workspace, mobile) {
  const { id, label } = workspace;
  if (!mobile) {
    await nav.getByRole('tab', { name: label, exact: true }).click();
  } else if (directMobileLabels[id]) {
    await nav.getByRole('tab', { name: directMobileLabels[id], exact: true }).click();
  } else {
    await nav.getByRole('button', { name: 'More workspaces', exact: true }).click();
    await nav.getByRole('menuitem', { name: label, exact: false }).click();
  }
}

async function checkSubtabs(viewport, workspaceId, panel) {
  if (viewport.width !== 320 || !['lab', 'health', 'funds', 'ipo-events'].includes(workspaceId)) return;
  const selectors = {
    lab: '.lab-nav-tabs',
    health: '.health-tabs-nav',
    funds: '.portfolio-tabs-bar',
    'ipo-events': '.events-tabs-nav',
  };
  const tabs = panel.locator(selectors[workspaceId] + ' button');
  const tabCount = await tabs.count();
  assert.ok(tabCount > 1, 'Missing sub-workspaces for ' + workspaceId);
  for (const tab of await tabs.all()) {
    const label = (await tab.innerText()).trim();
    if (await tab.isEnabled()) await tab.click();
    await assertFits(panel, viewport.width + 'px ' + workspaceId + ' / ' + label);
  }
}

async function checkEquityDetail(page, panel) {
  const inspect = panel.getByRole('button', { name: 'Inspect', exact: true }).nth(1);
  await inspect.click();
  await page.waitForFunction(() => {
    const heading = document.activeElement;
    const bounds = heading?.getBoundingClientRect();
    return heading?.classList.contains('market-equity-detail__title')
      && heading.textContent === 'TCS' && bounds.top >= 0 && bounds.bottom <= innerHeight;
  });
}

const browser = await chromium.launch({ headless: true });
try {
  for (const { fontSize, ...viewport } of browsers) {
    const page = await browser.newPage({ viewport, serviceWorkers: 'block' });
    page.setDefaultTimeout(12000);
    try {
      await page.goto(base.href, { waitUntil: 'domcontentloaded' });
      const nav = page.getByRole('navigation', { name: 'Market workspaces' });
      await nav.waitFor();
      if (fontSize) await page.evaluate(size => { document.documentElement.style.fontSize = size + 'px'; }, fontSize);
      for (const workspace of R21_MARKET_WORKSPACES) {
        await chooseWorkspace(nav, workspace, viewport.width < 768);
        const panel = page.locator('#market-' + workspace.id + '-content');
        await panel.waitFor();
        await assertFits(panel, viewport.width + 'px ' + workspace.id);
        await checkSubtabs(viewport, workspace.id, panel);
        if (workspace.id === 'equity' && viewport.width === 320) await checkEquityDetail(page, panel);
        if (workspace.id === 'indices' && viewport.width === 1366) {
          const grid = panel.locator('.market-workspace__indices-grid');
          const [references, provider] = await grid.locator(':scope > *').all();
          const first = await references.boundingBox();
          const second = await provider.boundingBox();
          assert.ok(first && second && second.x > first.x + first.width && Math.abs(first.y - second.y) <= 2,
            'Desktop exchange references and provider board should sit side by side');
        }
      }
      console.log('Checked ' + viewport.width + 'px' + (fontSize ? ' at ' + fontSize + 'px app text' : '') + ' across all nine workspaces');
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}
assert.equal(layoutFailures.length, 0, layoutFailures.join('\n'));
console.log('PASS: all nine workspaces fit in every tested configuration');
