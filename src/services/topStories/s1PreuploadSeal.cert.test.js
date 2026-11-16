import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { evaluateS1PreuploadSeal } from '../../../scripts/verify_s1_preupload_seal.mjs';

const NOW = Date.parse('2026-10-28T09:00:00.000Z');
const FETCHED = NOW - 60_000;
const snapshot = Buffer.from(JSON.stringify({
  schemaVersion: 2, fetchedAt: FETCHED,
  sections: { world: [{ id: 'valid', title: 'Valid World' }] },
}));
const digest = createHash('sha256').update(snapshot).digest('hex');
const report = {
  ok: true, actualCheckedAt: new Date(NOW - 30_000).toISOString(),
  worldAuthority: {
    ok: true, errors: [], selectedAuthority: 'github_static',
    selectedByteSha256: digest, candidateByteSha256: digest,
    fetchedAt: FETCHED,
  },
};
const seal = (overrides = {}) =>
  evaluateS1PreuploadSeal({
    report, snapshotBytes: snapshot, now: NOW, ...overrides,
  });

describe('S1 preupload seal: source response and dist bytes cannot diverge', () => {
  it('accepts an unchanged browser-qualified snapshot and recent proof', () => {
    expect(seal()).toMatchObject({
      ok: true, errors: [], bytesSha256: digest, fetchedAt: FETCHED,
    });
  });

  it('refuses a source swap after browser qualification', () => {
    const modified = Buffer.from(JSON.stringify({
      schemaVersion: 2, fetchedAt: FETCHED,
      sections: { world: [{ id: 'surreptitious-new-card' }] },
    }));
    expect(seal({ snapshotBytes: modified }).errors)
      .toContain('dist_snapshot_mutated_after_browser_acceptance');
  });

  it('refuses a forged report or Cloudflare authority even with valid dist bytes', () => {
    for (const tampered of [
      { ...report, ok: false },
      { ...report, worldAuthority: { ...report.worldAuthority, ok: false } },
      { ...report, worldAuthority: {
        ...report.worldAuthority, selectedAuthority: 'cloudflare_preview',
      } },
      { ...report, worldAuthority: {
        ...report.worldAuthority, errors: ['untrusted_source'],
      } },
    ]) {
      expect(seal({ report: tampered }).errors)
        .toContain('browser_prepublication_acceptance_missing');
    }
  });

  it('does not allow an expired, future or missing browser proof to be reused', () => {
    for (const when of [NOW - 360_000, NOW + 60_000, Number.NaN]) {
      const tampered = {
        ...report,
        actualCheckedAt: Number.isFinite(when)
          ? new Date(when).toISOString() : 'unknown-time',
      };
      expect(seal({ report: tampered }).errors)
        .toContain('browser_acceptance_expired_or_clock_invalid');
    }
  });

  it('rejects a simulated host-clock rollback at seal time', () => {
    expect(seal({ now: NOW - 50_000 }).errors)
      .toContain('browser_acceptance_expired_or_clock_invalid');
  });

  it('rejects a missing, invalid or swapped claimed response hash', () => {
    for (const claimedHash of [null, 'bad', 'f'.repeat(64)]) {
      const tampered = {
        ...report, worldAuthority: {
          ...report.worldAuthority, selectedByteSha256: claimedHash,
        },
      };
      expect(seal({ report: tampered }).errors)
        .toContain('dist_snapshot_mutated_after_browser_acceptance');
    }
  });

  it('rejects a stale source acquisition even when the browser report is positive', () => {
    const old = Buffer.from(JSON.stringify({
      schemaVersion: 2, fetchedAt: NOW - 13 * 60 * 60_000,
      sections: { world: [] },
    }));
    const oldHash = createHash('sha256').update(old).digest('hex');
    const oldReport = {
      ...report, worldAuthority: {
        ...report.worldAuthority, candidateByteSha256: oldHash,
        selectedByteSha256: oldHash,
        fetchedAt: NOW - 13 * 60 * 60_000,
      },
    };
    expect(seal({ report: oldReport, snapshotBytes: old }).errors)
      .toContain('dist_snapshot_age_or_provenance_invalid');
  });

  it('refuses malformed or absent snapshot bytes and fails closed', () => {
    for (const data of [Buffer.from('{'), undefined]) {
      const result = seal({ snapshotBytes: data });
      expect(result.ok).toBe(false);
      expect(result.errors).toContain('dist_snapshot_unparseable');
    }
  });
});
