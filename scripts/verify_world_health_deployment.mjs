import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { evaluateS1PrepublicationWorldHealth } from './evaluate_s1_prepublication.mjs';

const DEFAULT_ARTIFACT_DIR = 'artifacts/world-health-deployment';
const VERIFICATION_TIMEZONE = 'UTC';
const VERIFICATION_SEGMENT = 'non-urgent';
const CLOCK_MODE = 'playwright-set-fixed-time';
const HYDRATION_TIMEOUT_MS = 90_000;
const BADGE_READY_TIMEOUT_MS = 30_000;
const CONCRETE_STATUSES = ['ok', 'warning', 'critical'];

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

/**
 * Replay built assets under the real static-host browser origin without
 * publishing them. Only same-origin Pages assets under the app base path are
 * mapped to the local preview server; remote authority calls are untouched.
 */
export function mapPreflightAssetUrl(requestUrl, baseUrl, previewOrigin) {
  if (!previewOrigin) return null;
  const base = new URL(baseUrl);
  const request = new URL(requestUrl);
  const preview = new URL(previewOrigin);
  if (
    preview.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(preview.hostname)
  ) {
    throw new Error('Preflight asset proxy must be a localhost HTTP origin');
  }
  const basePath = base.pathname.endsWith('/') ? base.pathname : base.pathname + '/';
  if (request.origin !== base.origin || !request.pathname.startsWith(basePath)) {
    return null;
  }
  const relativePath = request.pathname.slice(basePath.length);
  // Reject ambiguous encoded path separators/traversal and URL control chars.
  if (/%(?:2f|5c|2e|00|0a|0d)/i.test(relativePath) ||
      /[\\]/.test(relativePath) || relativePath.startsWith('/')) return null;
  const mapped = new URL(relativePath + request.search, preview);
  if (mapped.origin !== preview.origin) return null;
  return mapped.toString();
}


const MAX_WORLD_EPOCH_AGE_MS = 2 * 60 * 60 * 1000;
const MAX_WORLD_EPOCH_FUTURE_MS = 5 * 60 * 1000;
const CLOUDFLARE_WORLD_PREVIEW_PATH = '/preview/sections/latest';

/**
 * Prepublication qualification; deliberately stricter than the post-deploy
 * diagnostic verifier. A local/static fixture is not live qualification.
 */
function normalizeWorldHeadline(value) {
  return String(value || '').replace(/<[^>]*>/g, '').replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ').trim().toLocaleLowerCase('en-US');
}

export function evaluatePrepublicationWorldHealth(report, observed, checkedAt = Date.now()) {
  const errors = [];
  if (report?.badgeStatus !== 'ok') errors.push('world_badge_not_ok');
  if (report?.sectionId !== 'world' || !Number.isFinite(report?.storyCount) || report.storyCount <= 0) {
    errors.push('world_story_count_invalid');
  }
  if (!Number.isFinite(report?.sourceGroupCount) || report.sourceGroupCount <= 0 ||
      !report?.topSourcesText || /none recorded/i.test(report.topSourcesText)) {
    errors.push('world_source_evidence_missing');
  }
  const seen = Array.isArray(observed) ? observed.filter(x => {
    try {
      const url = new URL(x?.url);
      return url.origin === 'https://nw-sections-shadow.reallaksh19.workers.dev' &&
        url.pathname === CLOUDFLARE_WORLD_PREVIEW_PATH;
    } catch { return false; }
  }) : [];
  const latest = seen.at(-1);
  const match = String(latest?.epochId || '').match(/^live-(\d{13})$/);
  const ageMs = match ? Number(new Date(checkedAt)) - Number(match[1]) : NaN;
  if (!latest || latest.responseStatus !== 200 || !match) {
    errors.push('world_committed_live_epoch_missing');
  } else if (!Number.isFinite(ageMs) || ageMs > MAX_WORLD_EPOCH_AGE_MS ||
             ageMs < -MAX_WORLD_EPOCH_FUTURE_MS) {
    errors.push('world_committed_epoch_stale_or_future');
  }

  // The *same* response that emitted the epoch header must contain eligible
  // committed World data, not just a 200 header unrelated to the rendered UI.
  const body = latest?.body;
  const preview = body?.preview;
  const workerWorld = body?.sections?.world;
  const workerQuality = body?.sectionQuality?.world;
  const validBody = body?.schemaVersion === 2 &&
    preview?.dataSource === 'cloudflare_d1' &&
    preview?.mode === 'cloudflare_preview' &&
    preview?.evidenceVerified === true &&
    Boolean(preview?.decisionOutputDigest) &&
    preview?.epochId === latest?.epochId;
  if (!validBody) errors.push('world_committed_preview_body_unverified_or_epoch_mismatch');
  const sourceGroups = new Set(
    Array.isArray(workerWorld) ? workerWorld.map(item => item?.sourceGroup).filter(Boolean) : [],
  );
  if (!Array.isArray(workerWorld) || workerWorld.length === 0 ||
      sourceGroups.size < 2 || workerQuality?.storyCount !== workerWorld.length ||
      workerQuality?.sourceGroupCount !== sourceGroups.size) {
    errors.push('world_committed_preview_content_unusable');
  }

  // Capture the loader's *actual* runtime selection event in Chromium before
  // navigation. The app may display GitHub fallback; this release gate may not.
  // Also require every rendered card headline to be present in the same Worker
  // payload to guard against an unrelated source event or detached fetch.
  if (Array.isArray(workerWorld) && Number(report?.storyCount) > workerWorld.length) {
    errors.push('world_rendered_count_exceeds_committed_preview');
  }
  const events = Array.isArray(report?.selectedSourceEvents) ? report.selectedSourceEvents : [];
  const lastSelection = events.at(-1);
  if (!lastSelection || lastSelection.requested !== 'cloudflare_preview' ||
      lastSelection.effective !== 'cloudflare_preview' || lastSelection.fallback ||
      events.some(event => event?.effective === 'github_static' || event?.fallback)) {
    errors.push('world_rendered_source_not_cloudflare');
  }
  const visible = report?.visibleWorldHeadlines;
  const workerHeadlines = new Set(
    Array.isArray(workerWorld)
      ? workerWorld.map(item => normalizeWorldHeadline(item?.title || item?.headline)).filter(Boolean)
      : [],
  );
  if (!Array.isArray(visible) || visible.length === 0 ||
      visible.some(title => !workerHeadlines.has(normalizeWorldHeadline(title)))) {
    errors.push('world_rendered_headlines_not_in_committed_preview');
  }
  return {
    ok: errors.length === 0, errors, epochId: latest?.epochId || null,
    authorityUrl: latest?.url || null, responseStatus: latest?.responseStatus ?? null,
    epochAgeMs: Number.isFinite(ageMs) ? ageMs : null,
    bodyEpochId: preview?.epochId || null,
    committedEvidenceVerified: preview?.evidenceVerified === true,
    workerWorldStoryCount: Array.isArray(workerWorld) ? workerWorld.length : null,
    workerWorldSourceGroups: sourceGroups.size,
    selectedSource: lastSelection?.effective || null,
    selectedFallback: lastSelection?.fallback ?? null,
    visibleWorldCardCount: Array.isArray(visible) ? visible.length : 0,
  };
}

function recordBrowserDiagnostic(list, value) {
  if (list.length >= 50) return;
  list.push(String(value || '').trim());
}

async function waitForWorldHydration(page) {
  await page.waitForFunction(() => {
    const count = document.querySelector('#world-news .news-count');
    const match = String(count?.textContent || '').match(/\d+/);
    return Boolean(match && Number(match[0]) > 0);
  }, null, { timeout: HYDRATION_TIMEOUT_MS });
}

async function waitForConcreteBadge(page) {
  await page.waitForFunction(statuses => {
    const badge = document.querySelector('#world-news .section-health-badge');
    return statuses.includes(badge?.getAttribute('data-status'));
  }, CONCRETE_STATUSES, { timeout: BADGE_READY_TIMEOUT_MS });
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
    worldAuthority: null,
    worldProvenance: null,
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
    const previewOrigin = String(process.env.PREFLIGHT_ASSET_ORIGIN || '').trim();
    if (previewOrigin) {
      // Preflight preserves github.io as window.location.hostname so static-host
      // source authority and browser CORS paths are the actual Pages paths.
      await context.route('**/*', async route => {
        const mapped = mapPreflightAssetUrl(
          route.request().url(), baseUrl, previewOrigin,
        );
        if (!mapped) return route.continue();
        const response = await route.fetch({ url: mapped, timeout: 20_000 });
        return route.fulfill({ response });
      });
      report.assetPreflightOrigin = previewOrigin;
    }
    // A source event is emitted by the actual snapshot loader, not inferred
    // from an unrelated Worker response. Capture before any page scripts run.
    await context.addInitScript(() => {
      window.__nwPreflightSourceEvents = [];
      window.addEventListener('nw:sections-data-source-status', event => {
        const detail = event.detail || {};
        window.__nwPreflightSourceEvents.push({
          requested: detail.requested || null,
          effective: detail.effective || null,
          fallback: Boolean(detail.fallback),
        });
      });
    });
    const page = await context.newPage();
    const observedWorldResponses = [];
    const observedS1Responses = [];
    page.on('response', response => {
      if (process.env.PREFLIGHT_REQUIRE_S1_STATIC === 'true') {
        try {
          const requestUrl = new URL(response.url());
          if (requestUrl.origin === 'https://reallakshman19.github.io' &&
              requestUrl.pathname === '/NWv-7/newsdata/sections_latest.json') {
            observedS1Responses.push(response);
          }
        } catch {
          // Invalid responses cannot satisfy the S1 gate.
        }
      }
      if (process.env.PREFLIGHT_REQUIRE_FRESH_WORLD !== 'true') return;
      const url = response.url();
      try {
        const source = new URL(url);
        if (source.origin !== 'https://nw-sections-shadow.reallaksh19.workers.dev' ||
            source.pathname !== CLOUDFLARE_WORLD_PREVIEW_PATH) return;
      } catch { return; }
      observedWorldResponses.push(response);
    });
    page.on('console', message => {
      if (message.type() === 'error') {
        recordBrowserDiagnostic(report.consoleErrors, message.text());
      }
    });
    page.on('pageerror', error => {
      recordBrowserDiagnostic(report.pageErrors, error?.message || error);
    });
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

    report.finalUrl = page.url();
    const worldSection = page.locator('#world-news');
    const hydrationStartedAt = Date.now();
    await waitForWorldHydration(page);
    report.hydrationMs = Date.now() - hydrationStartedAt;
    report.worldCountText = (
      await worldSection.locator('.news-count').textContent()
    )?.trim() || null;

    const badge = worldSection.locator('.section-health-badge');
    await badge.waitFor({ state: 'visible', timeout: 20_000 });
    let badgeReadinessError = null;
    try {
      await waitForConcreteBadge(page);
    } catch (error) {
      badgeReadinessError = error;
    }

    report.badgeStatus = await badge.getAttribute('data-status');
    report.badgeLabel = (await badge.textContent())?.trim() || null;
    if (
      badgeReadinessError ||
      !['ok', 'warning', 'critical'].includes(report.badgeStatus)
    ) {
      throw new Error(
        `World section health badge is not concrete after hydration: ${report.badgeStatus || 'missing'}`,
        { cause: badgeReadinessError || undefined },
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

    if (process.env.PREFLIGHT_REQUIRE_S1_STATIC === 'true') {
      // Nonpublishing S1 candidate evidence; Cloudflare success is not proof.
      if (process.env.PREFLIGHT_REQUIRE_FRESH_WORLD === 'true') {
        throw new Error('Prepublication cannot qualify two serving authorities');
      }
      const witness = await page.evaluate(() => ({
        selectedSourceEvents: window.__nwPreflightSourceEvents || [],
        visibleWorldCards: [...document.querySelectorAll(
          '#world-news article.modern-news-card',
        )].map(card => ({
          id: card.getAttribute('data-story-id') || '',
          url: card.getAttribute('data-story-url') || '',
        })),
      }));
      const expectedBytes = await fs.readFile(
        path.resolve('dist/newsdata/sections_latest.json'),
      );
      const expectedSha256 = createHash('sha256')
        .update(expectedBytes).digest('hex');
      const observed = await Promise.all(observedS1Responses.map(async response => ({
        url: response.url(),
        responseStatus: response.status(),
        bytesSha256: createHash('sha256')
          .update(await response.body()).digest('hex'),
        body: await response.json().catch(() => null),
      })));
      const s1 = evaluateS1PrepublicationWorldHealth({
        report: { ...report, ...witness },
        observed,
        checkedAt: actualCheckedAt,
        expectedByteSha256: expectedSha256,
      });
      report.worldAuthority = s1;
      report.worldProvenance = {
        selectedSourceEvents: witness.selectedSourceEvents,
        visibleWorldCardCount: witness.visibleWorldCards.length,
        observedNamedStaticResponses: observed.length,
        expectedCandidateByteSha256: expectedSha256,
      };
      if (!s1.ok) {
        throw new Error('S1 static prepublication refused: ' + s1.errors.join(', '));
      }
    }

    if (process.env.PREFLIGHT_REQUIRE_FRESH_WORLD === 'true') {
      const sourceWitness = await page.evaluate(() => ({
        selectedSourceEvents: window.__nwPreflightSourceEvents || [],
        visibleWorldHeadlines: [...document.querySelectorAll(
          '#world-news article.modern-news-card .mnc-headline',
        )].map(node => node.textContent?.trim()).filter(Boolean),
      }));
      report.worldProvenance = {
        selectedSourceEvents: sourceWitness.selectedSourceEvents,
        visibleWorldCardCount: sourceWitness.visibleWorldHeadlines.length,
      };
      const observed = await Promise.all(observedWorldResponses.map(async response => ({
        url: response.url(),
        responseStatus: response.status(),
        epochId: await response.headerValue('x-nw-epoch-id'),
        body: await response.json().catch(() => null),
      })));
      const prepublication = evaluatePrepublicationWorldHealth({ ...report, ...sourceWitness }, observed, actualCheckedAt);
      report.worldAuthority = prepublication;
      if (!prepublication.ok) {
        throw new Error('Prepublication World health refused: ' + prepublication.errors.join(', '));
      }
    }

    report.ok = true;
    await page.screenshot({ path: screenshotPath, fullPage: true });
  } catch (error) {
    report.error = error?.stack || error?.message || String(error);
    try {
      const page = browser?.contexts().flatMap(context => context.pages()).at(-1);
      if (page) {
        report.finalUrl = report.finalUrl || page.url();
        await page.screenshot({ path: screenshotPath, fullPage: true });
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
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
