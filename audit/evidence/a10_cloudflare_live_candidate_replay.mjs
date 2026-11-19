/**
 * Controlled candidate-browser check. With --require-cloudflare, also require
 * one fresh, qualifying public Cloudflare receipt. Browser traffic stays local.
 */
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import {
  AUTHORITY_MAX_AGE_MS,
  classifySectionsSnapshotAuthority,
} from '../../src/adapters/sectionsSnapshotAuthority.js';

const root = 'artifacts/a10-fix';
const dist = resolve('dist');
const base = 'http://127.0.0.1:4192/?preferSnapshots=true';
const cloudflareUrl = 'https://nw-sections-shadow.reallaksh19.workers.dev/preview/sections/latest';
const modes = ['hybrid', 'live'];
const routes = [
  ['main', '/', 'main .modern-news-card, main .news-section .empty-state, main .data-retry-section h3'],
  ['insight', '/insight', '.modern-container .insight-sigs-row, .modern-container .data-retry-section h3, .insight-page .modern-container .empty-state'],
  ['up-ahead', '/up-ahead', '.up-ahead-page main .ua-tab-view .modern-card, .up-ahead-page main .data-retry-section h3'],
  ['newspaper', '/newspaper', '.mode-newspaper .newspaper-section h2, .mode-newspaper .empty-state p'],
  ['data-health', '/data-health', '[data-testid="data-health-panel"] [aria-label="Page coverage in this browser session"]'],
];

const sha256 = data => createHash('sha256').update(data).digest('hex');

export function qualifiesCloudflareReceipt(responseOk, snapshot, observedAt) {
  const ageMs = observedAt - Number(snapshot?.fetchedAt || 0);
  return responseOk && ageMs >= 0 && ageMs <= AUTHORITY_MAX_AGE_MS
    && classifySectionsSnapshotAuthority(snapshot, observedAt).valid;
}

export function evaluateCandidateGates({ browser, cloudflare, browserErrors = [], requireCloudflare = false }) {
  const expected = modes.flatMap(mode => routes.map(([name]) => mode + ':' + name));
  const seen = new Set(browser.map(row => row.mode + ':' + row.name));
  const complete = browser.length === expected.length && expected.every(key => seen.has(key));
  const rendered = complete && browserErrors.length === 0 && browser.every(row => (
    row.routeMatched === true && Boolean(row.sentinelText?.trim()) && row.screenshotCaptured === true
    && Array.isArray(row.pageErrors) && row.pageErrors.length === 0 && !row.error
  ));
  const insightTruth = rendered && browser
    .filter(row => row.name === 'insight')
    .every(row => row.snapshotRendered === true && row.falseLiveSnapshotClaim === false);
  const cloudflare12h = cloudflare?.qualified === true ? 'PASS'
    : cloudflare?.error ? 'HOLD_NO_RECEIPT'
    : cloudflare ? 'HOLD_STALE_OR_UNQUALIFIED' : 'NOT_RUN';
  return {
    candidateChromium: rendered ? 'PASS' : complete ? 'FAIL' : 'FAIL_INCOMPLETE',
    insightSnapshotTruth: insightTruth ? 'PASS' : 'FAIL',
    cloudflare12h,
    passed: rendered && insightTruth && (!requireCloudflare || cloudflare12h === 'PASS'),
  };
}

async function captureCloudflareReceipt() {
  const response = await fetch(cloudflareUrl, { signal: AbortSignal.timeout(25_000) });
  const bytes = Buffer.from(await response.arrayBuffer());
  // Preserve the exact receipt even when JSON decoding or qualification fails.
  fs.writeFileSync(root + '/a10_cloudflare_public_origin_raw.json', bytes);
  const payload = JSON.parse(bytes.toString('utf-8'));
  const observedAt = Date.now();
  const fetchedAt = Number(payload?.fetchedAt || 0);
  const rowCounts = Object.fromEntries(Object.entries(payload.sections || {})
    .map(([key, rows]) => [key, Array.isArray(rows) ? rows.length : 0]));
  return {
    url: cloudflareUrl,
    httpStatus: response.status,
    serverDate: response.headers.get('date'),
    sizeBytes: bytes.length,
    sha256: sha256(bytes),
    rowCounts,
    total: Object.values(rowCounts).reduce((sum, count) => sum + count, 0),
    epoch: payload?.preview?.epochId || null,
    authority: payload?.preview?.servingAuthority || 'unknown',
    fetchedAt,
    ageHours: Math.round((observedAt - fetchedAt) / 36000) / 100,
    qualified: qualifiesCloudflareReceipt(response.ok, payload, observedAt),
    nativeAuthorityVerdict: classifySectionsSnapshotAuthority(payload, observedAt),
  };
}

async function fulfillBundledFile(route, url) {
  const path = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const file = resolve(dist, '.' + path);
  if (!file.startsWith(dist + sep) || !fs.statSync(file, { throwIfNoEntry: false })?.isFile()) {
    return route.fulfill({ status: 404, body: 'File absent from the candidate build' });
  }
  return route.fulfill({ path: file });
}

async function captureRoutes(browser, output, save) {
  const insightSnapshot = JSON.parse(fs.readFileSync(resolve(dist, 'newsdata/insight_latest.json'), 'utf8'));
  const insightObservedAt = Number(insightSnapshot.fetchedAt) + 60 * 60_000;
  output.insightSnapshotObservedAt = new Date(insightObservedAt).toISOString();
  for (const mode of modes) {
    const context = await browser.newContext({
      viewport: { width: 1380, height: 900 }, serviceWorkers: 'block', offline: true,
    });
    const pageErrors = [];
    try {
      await context.addInitScript(value => localStorage.setItem('nw_fetch_mode', value), mode);
      const localOrigin = new URL(base).origin;
      let blocked = 0;
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === localOrigin) return fulfillBundledFile(route, url);
        blocked += 1;
        return route.abort('blockedbyclient');
      });
      const page = await context.newPage();
      page.on('pageerror', error => pageErrors.push(String(error)));
      for (const [name, hash, selector] of routes) {
        const row = { mode, name, routeMatched: false, screenshotCaptured: false, pageErrors: [] };
        const errorStart = pageErrors.length;
        const requestStart = blocked;
        try {
          // This fixture is archived. Reproduce its observation clock without rewriting its bytes.
          if (name === 'insight') await page.clock.setFixedTime(insightObservedAt);
          const response = await page.goto(base + '#' + hash, { waitUntil: 'domcontentloaded', timeout: 20_000 });
          if (response && !response.ok()) throw new Error('Route HTTP ' + response.status());
          row.url = page.url();
          row.routeMatched = new URL(row.url).hash === '#' + hash;
          const sentinel = page.locator(selector).filter({ visible: true }).first();
          await sentinel.waitFor({ state: 'visible', timeout: 25_000 });
          row.sentinelText = (await sentinel.innerText({ timeout: 5_000 })).slice(0, 500);
          const screenshot = await page.screenshot({
            path: root + '/candidate_' + mode + '_' + name + '.png',
            timeout: 8_000,
            animations: 'disabled',
          });
          row.screenshotCaptured = screenshot.length > 0;
          const text = await page.locator('body').innerText({ timeout: 5_000 });
          row.text = text.slice(0, 9_500);
          row.sha256 = sha256(text);
          if (name === 'insight') {
            row.insightHeaderStatus = await page.locator('header .data-pill').innerText({ timeout: 5_000 });
            const snapshotFeed = /SNAPSHOT FEED/i.test(text);
            row.snapshotRendered = snapshotFeed && /^Snapshot\b/i.test(row.insightHeaderStatus);
            row.falseLiveSnapshotClaim = snapshotFeed && /^Live\b/i.test(row.insightHeaderStatus);
          }
        } catch (error) {
          row.error = String(error);
          row.text = (await page.locator('body').innerText({ timeout: 1_500 }).catch(() => '')).slice(0, 2_000);
        } finally {
          if (name === 'insight') await page.clock.setFixedTime(Date.now());
        }
        row.pageErrors = pageErrors.slice(errorStart);
        row.blockedExternalRequests = blocked - requestStart;
        output.browser.push(row);
        save();
        console.log('A10_CANDIDATE_ROUTE', mode, name, {
          routeMatched: row.routeMatched,
          screenshotCaptured: row.screenshotCaptured,
          pageErrors: row.pageErrors.length,
          error: row.error,
        });
      }
    } finally {
      await context.close();
      output.browserErrors.push(...pageErrors);
    }
  }
}

async function main({ requireCloudflare }) {
  fs.mkdirSync(root, { recursive: true });
  const output = {
    classification: requireCloudflare ? 'LIVE_HTTP_RECEIPT_PLUS_CONTROLLED_CANDIDATE_BROWSER' : 'CONTROLLED_CANDIDATE_BROWSER',
    revision: process.env.GITHUB_SHA || 'local',
    at: new Date().toISOString(),
    requireCloudflare,
    cloudflare: null,
    browser: [],
    browserErrors: [],
    gates: {},
  };
  const save = () => fs.writeFileSync(root + '/a10_cloudflare_replay_and_candidate_browser.json', JSON.stringify(output, null, 2));

  if (requireCloudflare) {
    try {
      output.cloudflare = await captureCloudflareReceipt();
    } catch (error) {
      output.cloudflare = { error: String(error) };
    }
    save();
    console.log('A10_LIVE_CLOUDFLARE_RECEIPT', JSON.stringify(output.cloudflare));
  }

  let browser;
  try {
    if (!fs.existsSync(resolve(dist, 'index.html'))) throw new Error('Run npm run build before the A10 browser replay');
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.A10_CHROMIUM_EXECUTABLE,
    });
    await captureRoutes(browser, output, save);
  } catch (error) {
    output.browserErrors.push(String(error));
  } finally {
    if (browser) await browser.close().catch(error => output.browserErrors.push(String(error)));
    output.gates = evaluateCandidateGates(output);
    save();
  }
  console.log('A10_COMPLETE', JSON.stringify(output.gates), output.browserErrors);
  if (!output.gates.passed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main({ requireCloudflare: process.argv.includes('--require-cloudflare') });
}
