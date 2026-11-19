import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const HOST = '127.0.0.1';
const PORT = 4186;
const BASE = `http://${HOST}:${PORT}`;
const EDGE = 'https://a06-edge.example.test/api/datasets/upAhead';

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function waitForPreview() {
  for (let n = 0; n < 100; n += 1) {
    try { if ((await fetch(BASE)).ok) return; } catch {}
    await sleep(250);
  }
  throw new Error('A06 Vite preview did not start');
}

function fixture() {
  const now = Date.now();
  return {
    schemaVersion: 1,
    fetchedAt: now,
    contentHash: 'a06-controlled-browser-e2e',
    items: [{
      id: 'a06-provenance-sentinel',
      title: 'A06 Verified Worker Provider Event',
      summary: 'Controlled browser evidence for the provider chain',
      category: 'events',
      url: 'https://publisher.example.test/a06-evidence',
      source: 'A06 Provider Test',
      sourceGroup: 'a06-test',
      publishedAt: now - 60_000,
      eventStartAt: now + 3_600_000,
      eventEndAt: now + 7_200_000,
      expiryAt: now + 7_200_000,
      city: 'Chennai',
      acquisitionLocation: 'Chennai',
      displayEligible: true,
      plannerEligible: true,
      dateConfidence: 'exact',
      lifecycle: {
        displayUntil: now + 7_200_000, archiveUntil: now + 20_000_000,
        isVisible: true, isActionValid: true, withinSevenDayHorizon: true,
        plannerEligibleByLifecycle: true,
      },
    }],
  };
}

async function configure(page, mode) {
  await page.route('**/*', async route => {
    const url = route.request().url();
    if (url.startsWith(EDGE)) {
      if (mode === 'fallback') {
        return route.fulfill({
          status: 200, contentType: 'application/json',
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Expose-Headers': 'X-NW-UpAhead-Source, X-NW-UpAhead-Reason, X-NW-UpAhead-Freshness, X-NW-UpAhead-Age-Seconds',
            'X-NW-UpAhead-Source': 'fallback',
            'X-NW-UpAhead-Reason': 'upstream-timeout',
            'X-NW-UpAhead-Freshness': 'unknown',
            'X-NW-UpAhead-Age-Seconds': 'unknown',
          },
          body: JSON.stringify({ timeline: [], sections: {}, weekly_plan: [], auditSummary: { fallback: 'missing_or_invalid_up_ahead_dataset' }, dropReport: [] }),
        });
      }
      return route.fulfill({
        status: 200, contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Expose-Headers': 'X-NW-UpAhead-Source, X-NW-UpAhead-Reason, X-NW-UpAhead-Freshness, X-NW-UpAhead-Age-Seconds',
          'X-NW-UpAhead-Source': 'upstream',
          'X-NW-UpAhead-Reason': 'ok',
          'X-NW-UpAhead-Freshness': 'fresh',
          'X-NW-UpAhead-Age-Seconds': '5',
        },
        body: JSON.stringify(fixture()),
      });
    }
    if (url.includes('/data/up_ahead.json')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture()) });
    }
    if (url.startsWith(BASE)) return route.continue();
    return route.abort();
  });
}

async function assertText(page, value) {
  await page.getByText(value, { exact: false }).first().waitFor({ state: 'visible', timeout: 25_000 });
}

async function check(browser, width, height, mode) {
  const context = await browser.newContext({
    viewport: { width, height },
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await configure(page, mode);

  await page.goto(`${BASE}/#/up-ahead`, { waitUntil: 'domcontentloaded' });
  await assertText(page, mode === 'fallback' ? 'Snapshot' : 'Worker API');
  await mkdir('artifacts/a06', { recursive: true });
  await page.screenshot({ path: `artifacts/a06/up-ahead-${mode}-${width}.png`, fullPage: true });

  // Hash routing must preserve the diagnostics store. Do not reload the document.
  await page.goto(`${BASE}/#/data-health`, { waitUntil: 'domcontentloaded' });
  await assertText(page, 'upAhead (page)');
  await assertText(page, mode === 'fallback' ? 'upstream-timeout' : 'upstream');
  await assertText(page, mode === 'fallback' ? 'fallback' : 'fresh');
  await page.screenshot({ path: `artifacts/a06/data-health-${mode}-${width}.png`, fullPage: true });
  if (errors.length) throw new Error(`Browser errors (${mode}/${width}): ${errors.join('; ')}`);
  await context.close();
  return { mode, viewport: `${width}x${height}`, status: 'PASS' };
}

const server = spawn(process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--host', HOST, '--port', String(PORT), '--strictPort'],
  { stdio: 'ignore' });
const hardDeadline = setTimeout(() => {
  console.error('A06 Chromium verification exceeded 180 seconds');
  process.exit(124);
}, 180_000);
hardDeadline.unref();
let browser;
try {
  await waitForPreview();
  browser = await chromium.launch({ headless: true });
  const results = [];
  results.push(await check(browser, 1366, 900, 'success'));
  results.push(await check(browser, 820, 1180, 'success'));
  results.push(await check(browser, 1366, 900, 'fallback'));
  console.log(JSON.stringify({ suite: 'A06 Worker -> Up Ahead -> Data Health Chromium', results }, null, 2));
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill('SIGTERM');
  await sleep(300);
  if (server.exitCode === null && server.signalCode === null) server.kill('SIGKILL');
  clearTimeout(hardDeadline);
}
