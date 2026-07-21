import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  resolveWorldHealthVerificationClock,
} from '../../../scripts/verify_world_health_deployment.mjs';

const ROOT = process.cwd();
const VERIFIER_PATH = path.join(ROOT, 'scripts/verify_world_health_deployment.mjs');

function iso(value) {
  return resolveWorldHealthVerificationClock(value).toISOString();
}

function utcMinutes(value) {
  const clock = resolveWorldHealthVerificationClock(value);
  return (clock.getUTCHours() * 60) + clock.getUTCMinutes();
}

function readVerifier() {
  return fs.readFileSync(VERIFIER_PATH, 'utf8');
}

describe('World-health deployed verifier segment determinism', () => {
  it('moves the pre-06:00 urgent window to same-day 06:30 UTC', () => {
    expect(iso('2026-07-21T05:59:00.000Z'))
      .toBe('2026-07-21T06:30:00.000Z');
  });

  it('preserves already non-urgent UTC times', () => {
    for (const value of [
      '2026-07-21T06:00:00.000Z',
      '2026-07-21T12:15:30.000Z',
      '2026-07-21T19:59:00.000Z',
    ]) {
      expect(iso(value)).toBe(value);
    }
  });

  it('moves the post-20:00 urgent window to same-day 19:30 UTC', () => {
    expect(iso('2026-07-21T20:00:00.000Z'))
      .toBe('2026-07-21T19:30:00.000Z');
    expect(iso('2026-07-21T23:59:00.000Z'))
      .toBe('2026-07-21T19:30:00.000Z');
  });

  it('never resolves into the urgent-only UTC window', () => {
    for (let hour = 0; hour < 24; hour += 1) {
      const minutes = utcMinutes(
        `2026-07-21T${String(hour).padStart(2, '0')}:15:00.000Z`,
      );
      expect(minutes).toBeGreaterThanOrEqual(6 * 60);
      expect(minutes).toBeLessThan(20 * 60);
    }
  });

  it('fails closed for invalid input', () => {
    expect(() => resolveWorldHealthVerificationClock('not-a-date'))
      .toThrow(/valid time/);
    expect(() => resolveWorldHealthVerificationClock(new Date(Number.NaN)))
      .toThrow(/valid time/);
  });
});

describe('World-health hydration and evidence contract', () => {
  it('requires positive World hydration before badge readiness', () => {
    const source = readVerifier();
    const worldVisible = source.indexOf("page.locator('#world-news').waitFor");
    const hydration = source.indexOf('await waitForWorldHydration(page)');
    const concreteBadge = source.indexOf('await waitForConcreteBadge(page)');
    const badgeRead = source.indexOf("report.badgeStatus = await badge.getAttribute('data-status')");

    expect(worldVisible).toBeGreaterThanOrEqual(0);
    expect(hydration).toBeGreaterThan(worldVisible);
    expect(concreteBadge).toBeGreaterThan(hydration);
    expect(badgeRead).toBeGreaterThan(concreteBadge);
    expect(source).toContain("document.querySelector('#world-news .news-count')");
    expect(source).toContain('match && Number(match[0]) > 0');
    expect(source).toContain('timeout: HYDRATION_TIMEOUT_MS');
    expect(source).toContain('const HYDRATION_TIMEOUT_MS = 90_000');
    expect(source).not.toContain('waitForTimeout(750)');
  });

  it('uses condition-based concrete badge readiness without weakening checks', () => {
    const source = readVerifier();
    expect(source).toContain("const CONCRETE_STATUSES = ['ok', 'warning', 'critical']");
    expect(source).toContain('statuses.includes(badge?.getAttribute');
    expect(source).toContain('timeout: BADGE_READY_TIMEOUT_MS');
    expect(source).toContain("['ok', 'warning', 'critical'].includes(report.badgeStatus)");
    expect(source).toContain('World section health badge is not concrete after hydration');
    expect(source).toContain('Section health diagnostics');
    expect(source).toContain("report.sectionId !== 'world'");
    expect(source).toContain('report.storyCount <= 0');
    expect(source).toContain('report.sourceGroupCount <= 0');
    expect(source).toContain('World diagnostics do not contain top-source evidence');
  });

  it('records hydration, navigation, and browser diagnostics', () => {
    const source = readVerifier();
    for (const field of [
      'finalUrl',
      'hydrationMs',
      'worldCountText',
      'consoleErrors',
      'pageErrors',
    ]) {
      expect(source).toContain(field);
    }
    expect(source).toContain("page.on('console'");
    expect(source).toContain("page.on('pageerror'");
    expect(source).toContain('report.hydrationMs = Date.now() - hydrationStartedAt');
    expect(source).toContain("worldSection.locator('.news-count').textContent()");
    expect(source).toContain('report.finalUrl = report.finalUrl || page.url()');
  });

  it('pins clock and timezone before navigation and remains import-safe', () => {
    const source = readVerifier();
    const clock = source.indexOf('page.clock.setFixedTime(verificationClock)');
    const navigation = source.indexOf('page.goto(cacheBustedUrl(baseUrl)');
    expect(clock).toBeGreaterThanOrEqual(0);
    expect(navigation).toBeGreaterThan(clock);
    expect(source).toContain("timezoneId: 'UTC'");
    expect(source).toContain("serviceWorkers: 'block'");
    expect(source).toContain('actualCheckedAt');
    expect(source).toContain('verificationClock');
    expect(source).toContain('clockMode: CLOCK_MODE');
    expect(source).toContain('invokedPath === fileURLToPath(import.meta.url)');
  });

  it('does not import runtime, ranking, workflow, or generated-data authorities', () => {
    const source = readVerifier();
    for (const forbidden of [
      'SegmentContext',
      'segmentScheduler',
      'MainPage',
      'topStoriesRanker',
      'sectionHealthSummary',
      'runtimeSectionHealthFallback',
      'public/newsdata',
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
