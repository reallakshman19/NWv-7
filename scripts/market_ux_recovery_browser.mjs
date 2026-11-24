/**
 * Market UX recovery browser acceptance, run against a locally built Vite page.
 *
 * Fixtures replace only TradingView's EMBED SCRIPT and never supply fabricated
 * financial prices. Therefore screenshots qualify layout/interaction, NOT live
 * price-source correctness. A separate real-origin independent review is needed.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const BASE = 'http://127.0.0.1:4173/';
const OUT = 'reports/market-ux-r4';
const WIDTHS = [320, 360, 390, 430, 768, 1280];
const REPORT = { type: 'UX_FIXTURE_ONLY', sourceRights: 'NO_QUOTE_CAPTURE',
  generatedAt: new Date().toISOString(), viewports: [], status: 'HOLD' };

async function previewReady() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE, { signal: AbortSignal.timeout(1200) });
      if (r.ok) return;
    } catch { /* preview warming */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw Error('PREVIEW_UNAVAILABLE');
}
function assert(ok, message) {
  if (!ok) throw Error(message);
}

let server, browser;
try {
  await fs.mkdir(OUT, { recursive: true });
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host',
    '127.0.0.1', '--port', '4173', '--strictPort'], { stdio: 'ignore' });
  await previewReady();
  browser = await chromium.launch({ headless: true });
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 850 },
      colorScheme: 'dark', serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const errors = [];
    const widgets = [];
    page.on('pageerror', e => errors.push(e.message));
    // No actual external pricing feed is invoked in fixture UI validation.
    await page.route(/https:\/\/s3\.tradingview\.com\/external-embedding\/embed-widget-market-overview\.js/, async route => {
      widgets.push(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: 'document.currentScript?.parentElement?.querySelector(".tradingview-widget-container__widget")?.setAttribute("data-ux-fixture-only", "true");',
      });
    });
    await page.goto(BASE + '#/markets', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.locator('[data-market-index-board="provider"]').first().waitFor({ timeout: 12000 });
    assert(await page.locator('#md3-pulse .md3-pulse-row').count() === 0,
      'FOUR_EMPTY_NATIVE_CARDS_' + width);
    assert(await page.locator('#md3-pulse .md3-index-hosted__sources a').count() === 4,
      'NO_ORIGINAL_INDEX_SOURCE_LINKS_' + width);
    const initialWidgetCount = widgets.length;
    assert(initialWidgetCount >= 1, 'PROVIDER_EMBED_NOT_REQUESTED_' + width);
    await page.getByRole('button', { name: 'Reload index provider board' }).first().click();
    await page.waitForFunction(() => document.querySelector('#md3-pulse .md3-index-hosted__status')?.textContent?.includes('Widget loaded'));
    assert(widgets.length === initialWidgetCount + 1, 'PROVIDER_RELOAD_MISSING_' + width);
    const layout = await page.evaluate(() => {
      const root = document.querySelector('#market-workspace');
      const view = document.documentElement;
      const board = document.querySelector('#md3-pulse .md3-index-hosted');
      const jump = document.querySelector('.md3-jump-links');
      const boardBox = board.getBoundingClientRect();
      const w = window.innerWidth;
      return {
        overflowPx: Math.max(0, view.scrollWidth - w),
        boardRightPx: Math.round(boardBox.right),
        boardLeftPx: Math.round(boardBox.left),
        jumpHidden: window.getComputedStyle(jump).display === 'none',
        canReachSourceLinks: [...board.querySelectorAll('.md3-index-hosted__sources a')].every(a => a.href.startsWith('https:')),
        controls: [...root.querySelectorAll('button')].filter(b => b.getBoundingClientRect().width > 0).length,
      };
    });
    assert(layout.overflowPx <= 1, 'HORIZONTAL_OVERFLOW_' + width + '_' + layout.overflowPx);
    assert(layout.boardLeftPx >= -1 && layout.boardRightPx <= width + 1, 'BOARD_OUTSIDE_VIEWPORT_' + width);
    assert(layout.canReachSourceLinks, 'BAD_SOURCE_LINKS_' + width);
    if (width <= 430) assert(layout.jumpHidden, 'THIRD_NAV_ROW_ON_MOBILE_' + width);
    const path = OUT + '/mobile-' + width + '.png';
    await page.screenshot({ path, fullPage: true, animations: 'disabled' });
    const sha256 = createHash('sha256').update(await fs.readFile(path)).digest('hex');
    REPORT.viewports.push({ width, status: 'PASS', ...layout, embedRequests: widgets.length,
      screenshot: path, sha256, pageErrors: errors });
    assert(errors.length === 0, 'PAGE_ERRORS_' + width + '_' + errors.join('; '));
    await ctx.close();
  }
  REPORT.status = 'PASS_FIXTURE_ONLY';
} catch (error) {
  REPORT.status = 'FAIL';
  REPORT.error = String(error?.message || error);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  server?.kill('SIGTERM');
  await fs.mkdir(OUT, { recursive: true });
  await fs.writeFile(OUT + '/report.json', JSON.stringify(REPORT, null, 2) + '\n');
  console.log(JSON.stringify(REPORT, null, 2));
}
