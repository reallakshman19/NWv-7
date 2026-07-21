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

  it('pins clock and timezone before navigation without weakening assertions', () => {
    const source = fs.readFileSync(VERIFIER_PATH, 'utf8');
    const clock = source.indexOf('page.clock.setFixedTime(verificationClock)');
    const navigation = source.indexOf('page.goto(cacheBustedUrl(baseUrl)');
    expect(clock).toBeGreaterThanOrEqual(0);
    expect(navigation).toBeGreaterThan(clock);
    expect(source).toContain("timezoneId: 'UTC'");
    expect(source).toContain("serviceWorkers: 'block'");
    expect(source).toContain("page.locator('#world-news')");
    expect(source).toContain('.section-health-badge');
    expect(source).toContain('Section health diagnostics');
    expect(source).toContain("report.sectionId !== 'world'");
    expect(source).toContain('report.storyCount <= 0');
    expect(source).toContain('report.sourceGroupCount <= 0');
    expect(source).toContain('World diagnostics do not contain top-source evidence');
    expect(source).toContain('actualCheckedAt');
    expect(source).toContain('verificationClock');
    expect(source).toContain('clockMode: CLOCK_MODE');
    expect(source).toContain('invokedPath === fileURLToPath(import.meta.url)');
    for (const forbidden of [
      'SegmentContext',
      'segmentScheduler',
      'MainPage',
      'topStoriesRanker',
      'public/newsdata',
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
