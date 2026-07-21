import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const DEFAULT_ARTIFACT_DIR = 'artifacts/world-health-deployment';
const VERIFICATION_TIMEZONE = 'UTC';
const VERIFICATION_SEGMENT = 'non-urgent';
const CLOCK_MODE = 'playwright-set-fixed-time';

export function resolveWorldHealthVerificationClock(input) {
  const clock = input instanceof Date ? new Date(input.getTime()) : new Date(input);
  if (!Number.isFinite(clock.getTime())) {
    throw new Error('World-health verification clock requires a valid time');
  }

  const hour = clock.getUTCHours();
  if (hour < 6) clock.setUTCHours(6, 30, 0, 0);
  if (hour >= 20) clock.setUTCHours(19, 30, 0, 0);
  return clock;
}

export function cacheBustedUrl(url, token = Date.now()) {
  const target = new URL(url);
  target.searchParams.set('world-health-smoke', String(token));
  return target.toString();
}

export function parseField(dialogText, label) {
  const normalized = String(dialogText || '').replace(/\r/g, '');
  const pattern = new RegExp(`${label}\\s*\\n+([^\\n]+)`, 'i');
  return normalized.match(pattern)?.[1]?.trim() || null;
}

async function main() {
  const actualCheckedAt = new Date().toISOString();
  const verificationClock = resolveWorldHealthVerificationClock(actualCheckedAt);
  const baseUrl = String(process.env.DEPLOYED_BASE_URL || '').trim();
  const artifactDir = path.resolve(
    process.env.SMOKE_ARTIFACT_DIR || DEFAULT_ARTIFACT_DIR,
  );
  const reportPath = path.join(artifactDir, 'report.json');
  const screenshotPath = path.join(artifactDir, 'world-health.png');
  const report = {
    checkedAt: actualCheckedAt,
    actualCheckedAt,
    verificationClock: verificationClock.toISOString(),
    verificationTimezone: VERIFICATION_TIMEZONE,
    verificationSegmentExpectation: VERIFICATION_SEGMENT,
    clockMode: CLOCK_MODE,
    baseUrl,
    ok: false,
    badgeStatus: null,
    badgeLabel: null,
    sectionId: null,
    storyCount: null,
    sourceGroupCount: null,
    topSourcesText: null,
    error: null,
  };

  await fs.mkdir(artifactDir, { recursive: true });
  let browser;

  try {
    if (!baseUrl) throw new Error('DEPLOYED_BASE_URL is required');

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 390, height: 900 },
      timezoneId: 'UTC',
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    await page.clock.setFixedTime(verificationClock);

    let lastNavigationError = null;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      try {
        await page.goto(cacheBustedUrl(baseUrl), {
          waitUntil: 'domcontentloaded',
          timeout: 45_000,
        });
        await page.locator('#world-news').waitFor({
          state: 'visible',
          timeout: 45_000,
        });
        lastNavigationError = null;
        break;
      } catch (error) {
        lastNavigationError = error;
        if (attempt < 5) await page.waitForTimeout(attempt * 4_000);
      }
    }

    if (lastNavigationError) throw lastNavigationError;

    const worldSection = page.locator('#world-news');
    const badge = worldSection.locator('.section-health-badge');
    await badge.waitFor({ state: 'visible', timeout: 20_000 });

    report.badgeStatus = await badge.getAttribute('data-status');
    report.badgeLabel = (await badge.textContent())?.trim() || null;

    if (!['ok', 'warning', 'critical'].includes(report.badgeStatus)) {
      throw new Error(
        `World section health badge is not concrete: ${report.badgeStatus || 'missing'}`,
      );
    }

    await badge.click();
    const dialog = worldSection.locator(
      '[role="dialog"][aria-label="Section health diagnostics"]',
    );
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
      throw new Error(
        `Unexpected World diagnostics sectionId: ${report.sectionId || 'missing'}`,
      );
    }
    if (!Number.isFinite(report.storyCount) || report.storyCount <= 0) {
      throw new Error(`World diagnostics storyCount is not positive: ${report.storyCount}`);
    }
    if (!Number.isFinite(report.sourceGroupCount) || report.sourceGroupCount <= 0) {
      throw new Error(
        `World diagnostics sourceGroupCount is not positive: ${report.sourceGroupCount}`,
      );
    }
    if (!report.topSourcesText || /none recorded/i.test(report.topSourcesText)) {
      throw new Error('World diagnostics do not contain top-source evidence');
    }

    report.ok = true;
    await page.screenshot({ path: screenshotPath, fullPage: true });
  } catch (error) {
    report.error = error?.stack || error?.message || String(error);
    try {
      const page = browser?.contexts().flatMap(context => context.pages()).at(-1);
      if (page) await page.screenshot({ path: screenshotPath, fullPage: true });
    } catch {
      // Preserve the original verification error.
    }
  } finally {
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    if (browser) await browser.close();
  }

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
