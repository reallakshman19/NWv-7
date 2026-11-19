import { env } from 'cloudflare:workers';
import { applyD1Migrations, type D1Migration } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import {
  stageDecisionEvidence, stageDecisionEvidenceBatch, startEpoch, type CustodyEnv,
} from '../src/custody';
import { putImmutableD1EvidenceObject, readD1EvidenceUsage } from '../src/evidenceStore';
import { stageLiveLaneResult } from '../src/liveStore';
import { buildShadowLaneDefinitions, sectionsRegistryAuthority } from '../src/registry';
import { pruneShadowHistory } from '../src/retention';
import { CONSERVATIVE_EPOCH_RESERVATION, quotaLimits } from '../src/quota';

const db = env.SHADOW_DB;
const target: CustodyEnv = { SHADOW_DB: db };
const DIGEST = 'a'.repeat(64);
const now = Date.now();

async function seed() {
  const slot = now - 8 * 24 * 60 * 60 * 1_000;
  const epoch = await startEpoch(target, {
    epochId: 'ledger-old', logicalSlot: slot, scheduledAtMs: slot, evaluationNowMs: slot,
    attempt: 1, acquisitionMode: 'INDEPENDENT_LIVE', expectedLaneCount: 41,
    sourceRegistryVersion: sectionsRegistryAuthority.sourceRegistryVersion,
    sourceRegistryDigest: sectionsRegistryAuthority.sourceRegistryDigest, nowMs: slot,
  });
  const [lane] = await buildShadowLaneDefinitions();
  await stageLiveLaneResult(target, epoch, {
    lane, disposition: 'EMPTY', items: [], httpStatus: 200, durationMs: 1,
    errorCode: null, diagnostics: {}, observedAtMs: slot, attemptCount: 1,
  });
  const decision = {
    epochId: epoch.epoch_id, candidateIdentity: 'unicode-test', authoritativeRank: 1,
    evidenceDigest: DIGEST, evidenceJson: '{"summary":"சென்னை · مسقط"}',
  };
  await stageDecisionEvidence(target, decision);
  await putImmutableD1EvidenceObject(target, {
    epochId: epoch.epoch_id, objectKey: 'ledger/old', body: '{"snapshot":true}',
    schemaVersion: 'test', decisionOutputDigest: DIGEST, createdAtMs: slot,
    expiresAtMs: slot + 7 * 24 * 60 * 60 * 1_000,
  });
  return decision;
}

async function actualUsage() {
  return db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM sections_shadow_lane_payloads) +
        (SELECT COUNT(*) FROM sections_shadow_evidence_objects) AS objectCount,
      (SELECT COALESCE(SUM(length(CAST(payload_json AS BLOB))), 0) FROM sections_shadow_lane_payloads) +
      (SELECT COALESCE(SUM(length(CAST(content_json AS BLOB))), 0) FROM sections_shadow_evidence_objects) +
      (SELECT COALESCE(SUM(length(CAST(evidence_json AS BLOB))), 0) FROM sections_shadow_decisions) AS retainedBytes
  `).first<{ objectCount: number; retainedBytes: number }>();
}

describe('All-body D1 storage accounting', () => {
  it('counts ranking JSON and UTF-8 bytes, keeps retries idempotent and credits retention deletes', async () => {
    const decision = await seed();
    const before = await actualUsage();
    expect(before!.retainedBytes).toBeGreaterThan(decision.evidenceJson.length);
    expect(await readD1EvidenceUsage(db)).toMatchObject(before!);
    await stageDecisionEvidence(target, decision);
    await stageDecisionEvidenceBatch(target, [decision]);
    expect(await readD1EvidenceUsage(db)).toMatchObject(before!);

    await pruneShadowHistory(target, now);
    expect(await readD1EvidenceUsage(db)).toMatchObject({ objectCount: 0, retainedBytes: 0 });
    expect(await actualUsage()).toEqual({ objectCount: 0, retainedBytes: 0 });
  });

  it('backfills existing history when upgrading to migration 0006', async () => {
    await seed();
    const expected = await actualUsage();
    const drops = [];
    for (const tag of ['payload', 'object', 'decision']) {
      for (const suffix of ['storage_cap', 'storage_update_cap', 'usage_insert', 'usage_delete', 'usage_update']) {
        drops.push(db.prepare(`DROP TRIGGER trg_sections_shadow_${tag}_${suffix}`));
      }
    }
    await db.batch([
      ...drops, db.prepare('DROP TABLE sections_shadow_storage_usage'),
      db.prepare('DROP INDEX idx_sections_shadow_parity_created'),
      db.prepare('DROP INDEX idx_sections_shadow_parity_epoch'),
      db.prepare("DELETE FROM d1_migrations WHERE name = '0006_storage_usage.sql'"),
    ]);
    const migrations = (env as typeof env & { TEST_MIGRATIONS: D1Migration[] }).TEST_MIGRATIONS;
    await applyD1Migrations(db, migrations);
    expect(await readD1EvidenceUsage(db)).toMatchObject(expected!);
    await pruneShadowHistory(target, now);
    expect(await readD1EvidenceUsage(db)).toMatchObject({ objectCount: 0, retainedBytes: 0 });
  });

  it('refuses an over-budget ranking batch without committing partial decisions', async () => {
    const decision = await seed();
    const before = await actualUsage();
    const constrained = { ...target, SHADOW_MAX_D1_EVIDENCE_BYTES: String(before!.retainedBytes + 1) };
    await expect(stageDecisionEvidenceBatch(constrained, [
      { ...decision, candidateIdentity: 'another-decision', authoritativeRank: 2 },
    ])).rejects.toMatchObject({ code: 'FREE_TIER_STORAGE_CAPACITY_EXHAUSTED' });
    expect(await actualUsage()).toEqual(before);
    expect(await db.prepare('SELECT COUNT(*) AS n FROM sections_shadow_decisions').first('n')).toBe(1);
  });

  it('keeps the storage guard atomic for competing writers near the hard ceiling', async () => {
    const decision = await seed();
    await db.prepare('UPDATE sections_shadow_storage_usage SET retained_bytes = 349999997').run();
    const results = await Promise.allSettled(['racer-one', 'racer-two'].map(id => db.prepare(`
      INSERT INTO sections_shadow_decisions
      (epoch_id, candidate_identity, authoritative_rank, evidence_digest, evidence_json)
      VALUES (?, ?, 2, ?, '{}')
    `).bind(decision.epochId, id, DIGEST).run()));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect(await db.prepare('SELECT retained_bytes FROM sections_shadow_storage_usage').first('retained_bytes')).toBe(349999999);
    expect(await db.prepare('SELECT COUNT(*) AS n FROM sections_shadow_decisions').first('n')).toBe(2);
  });

  it('stores a multi-megabyte Unicode decision batch within D1 per-value limits and keeps retries stable', async () => {
    const decision = await seed();
    const rows = Array.from({ length: 40 }, (_, i) => ({
      ...decision, candidateIdentity: `large-${i}`, authoritativeRank: i + 2,
      evidenceJson: JSON.stringify({ text: 'க'.repeat(20000) }),
    }));
    await stageDecisionEvidenceBatch(target, rows);
    const usage = await readD1EvidenceUsage(db);
    expect(usage.retainedBytes).toBeGreaterThan(2400000);
    expect(usage).toMatchObject((await actualUsage())!);
    await stageDecisionEvidenceBatch(target, rows);
    expect(await readD1EvidenceUsage(db)).toMatchObject({ retainedBytes: usage.retainedBytes });
    expect(await db.prepare('SELECT COUNT(*) AS n FROM sections_shadow_decisions').first('n')).toBe(41);
  });

  it('fits eight maximum epochs and eight cleanup runs under the internal daily write ceiling', () => {
    const limits = quotaLimits({ SHADOW_DB: db, SHADOW_MAX_EPOCHS_PER_DAY: '10000', SHADOW_MAX_D1_WRITES_PER_DAY: '1000000' });
    expect(limits.epochs).toBe(8);
    expect(limits.d1Writes).toBe(80000);
    expect(limits.epochs * (CONSERVATIVE_EPOCH_RESERVATION.d1Writes + 6000)).toBe(76000);
    expect(76000).toBeLessThan(limits.d1Writes);
  });
});
