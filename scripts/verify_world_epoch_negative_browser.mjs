// Synthetic, nonpublishing browser falsifier. This never mutates Cloudflare.
// Run only against a locally built candidate, with browser URL under Pages origin.
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import {
  evaluatePrepublicationWorldHealth,
  mapPreflightAssetUrl,
  parseField,
} from './verify_world_health_deployment.mjs';

const PAGES = 'https://reallakshman19.github.io/NWv-7/';
const LOCAL = 'http://127.0.0.1:4173/';
const WORKER = 'https://nw-sections-shadow.reallaksh19.workers.dev/preview/sections/latest';
const now = Date.now();
const epoch = 'live-' + now;
const stories = Array.from({ length: 10 }, (_, i) => ({
  id: 'synthetic-' + i,
  title: 'Distinct synthetic World headline ' + (i + 1),
  headline: 'Distinct synthetic World headline ' + (i + 1),
  url: 'https://example.invalid/world/' + i,
  link: 'https://example.invalid/world/' + i,
  source: 'Synthetic publisher ' + (i % 4),
  sourceGroup: 'group-' + (i % 4),
  publishedAt: now - i * 60_000,
  fetchedAt: now,
  summary: 'Invented fixture only',
}));
const quality = { storyCount: 10, sourceGroupCount: 4 };
const committedBody = {
  schemaVersion: 2, fetchedAt: now, contentHash: 'synthetic-digest',
  sections: { world: stories },
  sectionQuality: { world: quality },
  preview: {
    dataSource: 'cloudflare_d1', mode: 'cloudflare_preview',
    epochId: epoch, evidenceVerified: true, decisionOutputDigest: 'synthetic-digest',
  },
};
const staticBody = { ...committedBody, preview: undefined };
const brokenWorkerBody = { ...committedBody, sections: null };
const outDir = path.resolve(process.env.SMOKE_ARTIFACT_DIR || 'artifacts/world-health-prepublish');
await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
async function run(caseName, workerBody, expectAccepted) {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 },
    timezoneId: 'UTC', serviceWorkers: 'block' });
  await context.addInitScript(() => {
    window.__nwPreflightSourceEvents = [];
    window.addEventListener('nw:sections-data-source-status', e => {
      const x = e.detail || {};
      window.__nwPreflightSourceEvents.push({
        requested: x.requested, effective: x.effective, fallback: Boolean(x.fallback),
      });
    });
  });
  await context.route('**/*', async route => {
    const url = route.request().url();
    if (url.split('?')[0] === WORKER) {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*',
          'access-control-expose-headers': 'X-NW-Epoch-Id', 'x-nw-epoch-id': epoch,
          'cache-control': 'no-store' },
        body: JSON.stringify(workerBody),
      });
    }
    if (url.startsWith(PAGES) && url.includes('/newsdata/sections_latest.json')) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(staticBody) });
    }
    const mapped = mapPreflightAssetUrl(url, PAGES, LOCAL);
    if (mapped) return route.fulfill({ response: await route.fetch({ url: mapped }) });
    return route.continue();
  });
  const page = await context.newPage();
  const responses = [];
  page.on('response', r => {
    if (r.url().split('?')[0] === WORKER) responses.push(r);
  });
  const report = {
    badgeStatus: null, sectionId: 'world', storyCount: null,
    sourceGroupCount: null, topSourcesText: null,
    visibleWorldHeadlines: [], selectedSourceEvents: [],
  };
  try {
    await page.goto(PAGES + '?synthetic-epoch-negative=' + caseName,
      { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.locator('#world-news .news-count').waitFor({ timeout: 60_000 });
    await page.waitForFunction(() => {
      const el = document.querySelector('#world-news .news-count');
      return Number(el?.textContent?.match(/\d+/)?.[0] || 0) > 0;
    }, null, { timeout: 60_000 });
    report.badgeStatus = await page.locator('#world-news .section-health-badge').getAttribute('data-status');
    await page.locator('#world-news .section-health-badge').click();
    const dialog = page.locator('#world-news [role="dialog"][aria-label="Section health diagnostics"]');
    await dialog.waitFor({ timeout: 15_000 });
    const txt = await dialog.innerText();
    report.storyCount = Number(parseField(txt, 'storyCount'));
    report.sourceGroupCount = Number(parseField(txt, 'sourceGroupCount'));
    report.topSourcesText = parseField(txt, 'topSources');
    report.visibleWorldHeadlines = await page.locator('#world-news article.modern-news-card .mnc-headline').allTextContents();
    report.selectedSourceEvents = await page.evaluate(() => window.__nwPreflightSourceEvents || []);
    const observed = await Promise.all(responses.map(async r => ({
      url: r.url(), responseStatus: r.status(),
      epochId: await r.headerValue('x-nw-epoch-id'),
      body: await r.json().catch(() => null),
    })));
    const outcome = evaluatePrepublicationWorldHealth(report, observed, new Date().toISOString());
    results.push({
      caseName, synthetic: true, fixtureStoryCount: stories.length,
      expectedAcceptance: expectAccepted,
      observedAcceptance: outcome.ok, errors: outcome.errors,
      badgeStatus: report.badgeStatus, storyCount: report.storyCount,
      sourceGroupCount: report.sourceGroupCount,
      selectedSources: report.selectedSourceEvents,
      epochId: outcome.epochId, workerStatus: outcome.responseStatus,
      visibleCardCount: report.visibleWorldHeadlines.length,
    });
    if (outcome.ok !== expectAccepted || report.badgeStatus !== 'ok' ||
        report.storyCount <= 0 || report.sourceGroupCount <= 0 ||
        report.visibleWorldHeadlines.length === 0) {
      throw new Error('Synthetic browser falsifier failed: ' + caseName);
    }
  } finally {
    await page.screenshot({ path: path.join(outDir, 'negative-' + caseName + '.png'),
      fullPage: true }).catch(() => {});
    await context.close();
  }
}
try {
  await run('static-fallback-empty-worker', brokenWorkerBody, false);
  await run('same-epoch-committed-worker', committedBody, true);
} catch (err) {
  results.push({ error: err.message });
  process.exitCode = 1;
} finally {
  await fs.writeFile(path.join(outDir, 'negative-browser.json'),
    JSON.stringify({ synthetic: true, candidateSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      observedAt: new Date().toISOString(), results }, null, 2) + '\n');
  await browser.close();
  console.log(JSON.stringify({ synthetic: true, results }, null, 2));
}
