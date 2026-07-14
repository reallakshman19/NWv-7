import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const baseUrl = String(process.env.DEPLOYED_BASE_URL || '').trim();
const artifactDir = path.resolve(process.env.SMOKE_ARTIFACT_DIR || 'artifacts/world-health-deployment');
const reportPath = path.join(artifactDir, 'report.json');
const screenshotPath = path.join(artifactDir, 'world-health.png');

if (!baseUrl) {
  throw new Error('DEPLOYED_BASE_URL is required');
}

await fs.mkdir(artifactDir, { recursive: true });

const report = {
  checkedAt: new Date().toISOString(),
  baseUrl,
  finalUrl: null,
  ok: false,
  hydrationMs: null,
  worldCountText: null,
  badgeStatus: null,
  badgeLabel: null,
  sectionId: null,
  storyCount: null,
  sourceGroupCount: null,
  topSourcesText: null,
  consoleErrors: [],
  pageErrors: [],
  error: null,
};

let browser;

function cacheBustedUrl(url) {
  const target = new URL(url);
  target.searchParams.set('world-health-smoke', String(Date.now()));
  return target.toString();
}

function parseField(dialogText, label) {
  const normalized = String(dialogText || '').replace(/\r/g, '');
  const pattern = new RegExp(`${label}\\s*\\n+([^\\n]+)`, 'i');
  return normalized.match(pattern)?.[1]?.trim() || null;
}

try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 900 },
    serviceWorkers: 'block',
  });
  const page = await context.newPage();

  page.on('console', message => {
    if (message.type() === 'error') {
      report.consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', error => {
    report.pageErrors.push(error?.message || String(error));
  });

  let lastNavigationError = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      await page.goto(cacheBustedUrl(baseUrl), {
        waitUntil: 'domcontentloaded',
        timeout: 45_000,
      });
      await page.locator('#world-news').waitFor({ state: 'visible', timeout: 45_000 });
      lastNavigationError = null;
      break;
    } catch (error) {
      lastNavigationError = error;
      if (attempt < 5) await page.waitForTimeout(attempt * 4_000);
    }
  }

  if (lastNavigationError) throw lastNavigationError;

  report.finalUrl = page.url();
  const worldSection = page.locator('#world-news');
  const hydrationStartedAt = Date.now();

  await page.waitForFunction(() => {
    const count = document.querySelector('#world-news .news-count');
    if (!count) return false;
    const value = Number(String(count.textContent || '').replace(/[^0-9]/g, ''));
    return Number.isFinite(value) && value > 0;
  }, null, { timeout: 90_000 });

  report.hydrationMs = Date.now() - hydrationStartedAt;
  report.worldCountText = (await worldSection.locator('.news-count').textContent())?.trim() || null;

  // Allow the health resolver and popover props to settle after the story array arrives.
  await page.waitForTimeout(750);

  const badge = worldSection.locator('.section-health-badge');
  await badge.waitFor({ state: 'visible', timeout: 20_000 });

  report.badgeStatus = await badge.getAttribute('data-status');
  report.badgeLabel = (await badge.textContent())?.trim() || null;

  if (!['ok', 'warning', 'critical'].includes(report.badgeStatus)) {
    throw new Error(`World section health badge is not concrete after hydration: ${report.badgeStatus || 'missing'}`);
  }

  await badge.click();

  const dialog = worldSection.locator('[role="dialog"][aria-label="Section health diagnostics"]');
  await dialog.waitFor({ state: 'visible', timeout: 10_000 });
  const dialogText = await dialog.innerText();

  if (/unknown\s*[—-]\s*diagnostics unavailable/i.test(dialogText)) {
    throw new Error('World section health popover reports diagnostics unavailable');
  }

  report.sectionId = parseField(dialogText, 'sectionId');
  report.storyCount = Number(parseField(dialogText, 'storyCount'));
  report.sourceGroupCount = Number(parseField(dialogText, 'sourceGroupCount'));
  report.topSourcesText = parseField(dialogText, 'topSources');

  if (report.sectionId !== 'world') {
    throw new Error(`Unexpected World diagnostics sectionId: ${report.sectionId || 'missing'}`);
  }
  if (!Number.isFinite(report.storyCount) || report.storyCount <= 0) {
    throw new Error(`World diagnostics storyCount is not positive: ${report.storyCount}`);
  }
  if (!Number.isFinite(report.sourceGroupCount) || report.sourceGroupCount <= 0) {
    throw new Error(`World diagnostics sourceGroupCount is not positive: ${report.sourceGroupCount}`);
  }
  if (!report.topSourcesText || /none recorded/i.test(report.topSourcesText)) {
    throw new Error('World diagnostics do not contain top-source evidence');
  }

  report.ok = true;
  await page.screenshot({ path: screenshotPath, fullPage: true });
} catch (error) {
  report.error = error?.stack || error?.message || String(error);
  try {
    if (browser) {
      const pages = browser.contexts().flatMap(context => context.pages());
      const page = pages.at(-1);
      if (page) {
        report.finalUrl = report.finalUrl || page.url();
        await page.screenshot({ path: screenshotPath, fullPage: true });
      }
    }
  } catch {
    // Preserve the original verification error.
  }
} finally {
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  if (browser) await browser.close();
}

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
