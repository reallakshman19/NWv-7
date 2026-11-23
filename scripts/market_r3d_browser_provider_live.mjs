/**
 * Read-only proof of the built Market page against real browser providers.
 * The report contains only source IDs, status and dates.
 */
import { chromium } from 'playwright';
import { evaluateFxObservation } from '../src/market/features/macro/fxFreshness.js';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';

const BASE = 'http://127.0.0.1:4173/';
const REPORT = 'reports/market-r3d-browser-provider-live.json';
const started = new Date().toISOString();
const results = [];
const sourceRequests = [];

async function captureRate(page, label, sourceId) {
  const row = page.getByRole('list', { name: 'Dated currency references' })
    .getByRole('listitem').filter({ has: page.getByText(label, { exact: true }) });
  await row.locator('time').waitFor({ timeout: 15000 });
  const providerAsOf = await row.locator('time').getAttribute('datetime');
  const classification = evaluateFxObservation(providerAsOf);
  if (!classification) throw new Error('INVALID_FX_PROVIDER_DATE');
  results.push({
    sourceId, ok: true, providerAsOf, freshness: classification.freshness,
    conversionEligible: classification.freshness !== 'EXPIRED'
  });
}

async function captureNav(page) {
  const code = '125497';
  await page.getByRole('textbox', { name: 'Scheme name or code' }).fill(code);
  await page.getByRole('button', { name: 'Search funds', exact: true }).click();
  const latestReport = page.getByText(/Latest reported NAV/);
  await latestReport.waitFor({ timeout: 15000 });
  const providerAsOf = await latestReport.locator('time').getAttribute('datetime');
  const matchingRequests = sourceRequests.filter(url =>
    url.pathname === '/mf/' + code || url.pathname === '/mf/' + code + '/latest');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(providerAsOf) || !matchingRequests.length || matchingRequests.length > 2) {
    throw new Error('INVALID_MFAPI_BROWSER_RESULT');
  }
  results.push({
    sourceId: 'mfapi-scheme-' + code, ok: true, providerAsOf,
    transport: matchingRequests.at(-1).pathname.endsWith('/latest') ? 'LATEST' : 'BOUNDED_HISTORY'
  });
}

async function awaitPreview() {
  for (let retry = 0; retry < 65; retry += 1) {
    try {
      const response = await fetch(BASE, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch { /* Wait for local preview server only. */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('LOCAL_VITE_PREVIEW_NOT_READY');
}

let preview = null;
let browser = null;
try {
  preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview',
    '--host', '127.0.0.1', '--port', '4173', '--strictPort'], { stdio: 'ignore' });
  await awaitPreview();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  page.on('request', request => {
    const url = new URL(request.url());
    if (['api.frankfurter.dev', 'api.mfapi.in'].includes(url.hostname)) sourceRequests.push(url);
  });
  await page.goto(BASE + '#/markets', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await captureRate(page, 'USD / INR', 'frankfurter-usd-inr');
  const automaticallyRequested = sourceRequests.map(url => url.pathname + url.search);
  if (automaticallyRequested.length !== 1 || automaticallyRequested[0] !== '/v2/rate/usd/inr?providers=ecb') {
    throw new Error('UNEXPECTED_AUTOMATIC_PROVIDER_REQUESTS');
  }
  await page.getByRole('button', { name: 'Check OMR / INR', exact: true }).click();
  await captureRate(page, 'OMR / INR', 'frankfurter-omr-inr');
  await captureNav(page);
  await context.close();
} catch (error) {
  results.push({ sourceId: 'harness', ok: false, error: String(error?.message || error) });
} finally {
  await browser?.close().catch(() => {});
  preview?.kill('SIGTERM');
  await fs.mkdir('reports', { recursive: true });
  const success = results.length === 3 && results.every(item => item.ok);
  const report = {
    verificationType: 'real-browser-cross-origin-acquisition',
    source: 'Playwright Chromium on built Market page',
    startedAt: started, finishedAt: new Date().toISOString(),
    sourceRequests: sourceRequests.length,
    status: success ? 'PASS' : 'HOLD',
    noRateOrNavValuesPublished: true,
    results
  };
  await fs.writeFile(REPORT, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (!success) process.exitCode = 1;
}
