import { describe, expect, it } from 'vitest';
import {
  evaluateCandidateGates,
  qualifiesCloudflareReceipt,
} from '../../audit/evidence/a10_cloudflare_live_candidate_replay.mjs';

const NOW = Date.UTC(2026, 10, 17, 9);
const hour = 3_600_000;

function snapshot(ageHours) {
  return {
    schemaVersion: 2,
    fetchedAt: NOW - ageHours * hour,
    sections: {
      world: [{ title: 'An actual headline', url: 'https://example.org/story', publishedAt: NOW - 2 * hour }],
    },
  };
}

function browserRows() {
  return ['hybrid', 'live'].flatMap(mode =>
    ['main', 'insight', 'up-ahead', 'newspaper', 'data-health'].map(name => ({
      mode,
      name,
      routeMatched: true,
      sentinelText: 'Route-specific content or an explicit fallback',
      screenshotCaptured: true,
      snapshotRendered: name === 'insight',
      falseLiveSnapshotClaim: false,
      pageErrors: [],
    })));
}

describe('A10 browser and Cloudflare evidence gates', () => {
  it('does not certify a live receipt from HTTP availability alone', () => {
    expect(qualifiesCloudflareReceipt(true, snapshot(1), NOW)).toBe(true);
    expect(qualifiesCloudflareReceipt(false, snapshot(1), NOW)).toBe(false);
    expect(qualifiesCloudflareReceipt(true, snapshot(25), NOW)).toBe(false);
    expect(qualifiesCloudflareReceipt(true, snapshot(-1), NOW)).toBe(false);
    expect(qualifiesCloudflareReceipt(true, { ...snapshot(1), sections: {} }, NOW)).toBe(false);
  });

  it('distinguishes controlled route evidence from qualifying live evidence', () => {
    const browser = browserRows();
    expect(evaluateCandidateGates({ browser })).toMatchObject({ passed: true, cloudflare12h: 'NOT_RUN' });
    const stale = { browser, cloudflare: { qualified: false }, requireCloudflare: true };
    expect(evaluateCandidateGates(stale)).toMatchObject({
      passed: false,
      candidateChromium: 'PASS',
      cloudflare12h: 'HOLD_STALE_OR_UNQUALIFIED',
    });
    expect(evaluateCandidateGates({ ...stale, cloudflare: { error: 'timeout' } })).toMatchObject({
      passed: false, cloudflare12h: 'HOLD_NO_RECEIPT',
    });
    expect(evaluateCandidateGates({ ...stale, cloudflare: { qualified: true } }).passed).toBe(true);
  });

  it.each([
    { sentinelText: '  ' },
    { pageErrors: ['ReferenceError: app is not defined'] },
    { screenshotCaptured: false },
    { error: 'Screenshot timed out' },
    { routeMatched: false },
  ])('rejects a complete-looking matrix with a broken visit (%j)', broken => {
    const browser = browserRows();
    browser[1] = { ...browser[1], ...broken };
    expect(evaluateCandidateGates({ browser }).passed).toBe(false);
  });

  it('rejects missing or duplicated routes and requires truthful Insight snapshot provenance', () => {
    const browser = browserRows();
    expect(evaluateCandidateGates({ browser: browser.slice(0, -1) }).passed).toBe(false);
    expect(evaluateCandidateGates({ browser: [...browser.slice(0, -1), browser[0]] }).passed).toBe(false);
    browser[1].falseLiveSnapshotClaim = true;
    expect(evaluateCandidateGates({ browser }).insightSnapshotTruth).toBe('FAIL');
    browser[1].falseLiveSnapshotClaim = false;
    browser[1].snapshotRendered = false;
    expect(evaluateCandidateGates({ browser }).insightSnapshotTruth).toBe('FAIL');
  });
});
