// Nonpublishing/publication pre-upload guard: reject any mutation of the
// browser-qualified static snapshot after Chromium and before artifact upload.
// This DOES NOT authenticate the GitHub Actions administrator or protect an
// uploaded zip against substitution after this verification step.
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const SHA256 = /^[0-9a-f]{64}$/i;
const DEFAULT_MAX_REHEARSAL_AGE_MS = 5 * 60_000;
const MAX_SNAPSHOT_AGE_MS = 12 * 60 * 60_000;

export function evaluateS1PreuploadSeal({
  report,
  snapshotBytes,
  now = Date.now(),
  maxRehearsalAgeMs = DEFAULT_MAX_REHEARSAL_AGE_MS,
} = {}) {
  const errors = [];
  const authority = report?.worldAuthority;
  const checkedAt = Date.parse(report?.actualCheckedAt || report?.checkedAt || '');
  if (report?.ok !== true || authority?.ok !== true ||
      authority?.selectedAuthority !== 'github_static' ||
      (Array.isArray(authority?.errors) && authority.errors.length > 0)) {
    errors.push('browser_prepublication_acceptance_missing');
  }
  if (!Number.isFinite(now) || !Number.isFinite(checkedAt) ||
      checkedAt > now || now - checkedAt > maxRehearsalAgeMs) {
    errors.push('browser_acceptance_expired_or_clock_invalid');
  }

  const expected = String(authority?.candidateByteSha256 || '').toLowerCase();
  const consumed = String(authority?.selectedByteSha256 || '').toLowerCase();
  const bytes = Buffer.isBuffer(snapshotBytes) ? snapshotBytes : null;
  const observed = bytes ? createHash('sha256').update(bytes).digest('hex') : '';
  if (!SHA256.test(expected) || !SHA256.test(consumed) ||
      observed !== expected || consumed !== expected) {
    errors.push('dist_snapshot_mutated_after_browser_acceptance');
  }

  let snapshot = null;
  try { snapshot = JSON.parse(bytes.toString('utf8')); } catch {
    errors.push('dist_snapshot_unparseable');
  }
  const fetchedAt = Number(snapshot?.fetchedAt || 0);
  if (snapshot?.schemaVersion !== 2 || !Number.isFinite(fetchedAt) ||
      fetchedAt <= 0 || fetchedAt > now || now - fetchedAt > MAX_SNAPSHOT_AGE_MS ||
      fetchedAt !== authority?.fetchedAt) {
    errors.push('dist_snapshot_age_or_provenance_invalid');
  }
  return { ok: errors.length === 0, errors, bytesSha256: observed || null,
    fetchedAt: Number.isFinite(fetchedAt) ? fetchedAt : null };
}

async function main() {
  const root = process.cwd();
  const reportPath = path.join(root, 'artifacts/world-health-prepublish/report.json');
  const snapshotPath = path.join(root, 'dist/newsdata/sections_latest.json');
  const [reportText, snapshotBytes] = await Promise.all([
    fs.readFile(reportPath, 'utf8'), fs.readFile(snapshotPath),
  ]);
  const verdict = evaluateS1PreuploadSeal({
    report: JSON.parse(reportText), snapshotBytes, now: Date.now(),
  });
  console.log(JSON.stringify({ step: 's1-preupload-seal', ...verdict }));
  if (!verdict.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  main().catch(error => {
    console.error('S1 preupload seal failed closed:', error.message);
    process.exitCode = 1;
  });
}
