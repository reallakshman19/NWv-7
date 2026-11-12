import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { EXPECTED_SECTIONS_LANE_COUNT, type EpochStart, type ShadowEpochRow } from '../src/contracts';
import {
  attachDecisionObject,
  commitEpoch,
  readCurrentShadow,
  readEpoch,
  sealEpoch,
  stageDecisionEvidence,
  stageLaneEvidenceBatch,
  startEpoch,
  type CustodyEnv,
} from '../src/custody';
import { sha256Text } from '../src/crypto';
import { putImmutableD1EvidenceObject, readD1EvidenceObject } from '../src/evidenceStore';
import { stageLiveLaneResult, type StoredLiveLaneResult } from '../src/liveStore';
import { buildShadowLaneDefinitions, sectionsRegistryAuthority } from '../src/registry';
import { pruneShadowHistory } from '../src/retention';

const HOUR_MS = 60 * 60 * 1_000;
const WEEK_MS = 7 * 24 * HOUR_MS;
const MINUTE_MS = 60 * 1_000;
const DIGEST = 'a'.repeat(64);
const db = env.SHADOW_DB;
const target: CustodyEnv = { SHADOW_DB: db };

function stageEpoch(epochId: string, slot: number, acquisitionMode: EpochStart['acquisitionMode']) {
  return startEpoch(target, {
    epochId,
    logicalSlot: slot,
    scheduledAtMs: slot,
    evaluationNowMs: slot,
    attempt: 1,
    acquisitionMode,
    expectedLaneCount: EXPECTED_SECTIONS_LANE_COUNT,
    sourceRegistryVersion: sectionsRegistryAuthority.sourceRegistryVersion,
    sourceRegistryDigest: sectionsRegistryAuthority.sourceRegistryDigest,
    nowMs: slot,
  });
}

function stageEmptyLiveLane(epoch: ShadowEpochRow, lane: StoredLiveLaneResult['lane']) {
  return stageLiveLaneResult(target, epoch, {
    lane,
    disposition: 'EMPTY',
    items: [],
    httpStatus: 200,
    durationMs: 1,
    errorCode: null,
    diagnostics: {},
    observedAtMs: epoch.logical_slot,
    attemptCount: 1,
  });
}

async function seedSealedEpoch(
  epochId: string,
  slot: number,
  mode: EpochStart['acquisitionMode'] = 'FROZEN_REPLAY',
) {
  const epoch = await stageEpoch(epochId, slot, mode);
  const lanes = await buildShadowLaneDefinitions();
  if (mode === 'INDEPENDENT_LIVE') {
    for (const lane of lanes) await stageEmptyLiveLane(epoch, lane);
  } else {
    await stageLaneEvidenceBatch(target, lanes.map(lane => ({
      ...lane,
      epochId,
      disposition: 'EMPTY',
      itemCount: 0,
      evidenceDigest: DIGEST,
      attemptCount: 1,
      observedAtMs: slot,
    })));
  }
  const evidenceJson = JSON.stringify({ identity: `${epochId}:candidate` });
  await stageDecisionEvidence(target, {
    epochId,
    candidateIdentity: `${epochId}:candidate`,
    authoritativeRank: 1,
    evidenceDigest: await sha256Text(evidenceJson),
    evidenceJson,
  });
  const objectKey = `retention-test/${epochId}`;
  const objectDigest = await putImmutableD1EvidenceObject(target, {
    objectKey,
    epochId,
    body: JSON.stringify({ decisionOutputDigest: DIGEST, candidateCount: 1 }),
    schemaVersion: 'test-v1',
    decisionOutputDigest: DIGEST,
    createdAtMs: slot,
    expiresAtMs: slot + WEEK_MS,
  });
  await attachDecisionObject(target, {
    epochId,
    objectKey,
    objectDigest,
    decisionOutputDigest: DIGEST,
    expectedDecisionCount: 1,
  });
  await sealEpoch(target, epochId, slot);
  return objectKey;
}

describe('Shadow history retention', () => {
  it('removes expired noncurrent history and preserves the current snapshot and recent sealed epoch', async () => {
    const now = Date.now();
    const cutoff = now - WEEK_MS;
    const expiredSlot = cutoff - 2 * MINUTE_MS;
    const currentSlot = cutoff - MINUTE_MS;
    const expiredObject = await seedSealedEpoch('expired', expiredSlot);
    await commitEpoch(target, 'expired', expiredSlot);
    const currentObject = await seedSealedEpoch('current', currentSlot, 'INDEPENDENT_LIVE');
    const current = await commitEpoch(target, 'current', currentSlot);
    const recentObject = await seedSealedEpoch('recent', cutoff + MINUTE_MS);
    await db.prepare(`
      INSERT INTO sections_shadow_parity_results (
        comparison_id, shadow_epoch_id, reference_epoch_id, mode, classification, created_at_ms
      ) VALUES ('expired-comparison', 'expired', 'reference', 'DETERMINISTIC_REPLAY', 'MATCH', ?)
    `).bind(expiredSlot).run();

    await expect(db.prepare("DELETE FROM sections_shadow_decisions WHERE epoch_id = 'current'").run())
      .rejects.toThrow('sections_shadow_decision_delete_requires_staged_or_expired_epoch');
    await expect(db.prepare("DELETE FROM sections_shadow_lane_evidence WHERE epoch_id = 'recent'").run())
      .rejects.toThrow('sections_shadow_lane_delete_requires_staged_or_expired_epoch');
    await expect(db.prepare("DELETE FROM sections_shadow_epochs WHERE epoch_id = 'recent'").run())
      .rejects.toThrow('sealed_sections_shadow_epoch_cannot_be_deleted');

    await pruneShadowHistory(target, now);

    expect(await readEpoch(db, 'expired')).toBeNull();
    expect(await readD1EvidenceObject(db, expiredObject)).toBeNull();
    expect(await db.prepare('SELECT comparison_id FROM sections_shadow_parity_results').raw()).toEqual([]);
    expect(await readCurrentShadow(db)).toEqual(current);
    expect(await readD1EvidenceObject(db, currentObject)).toMatchObject({ epoch_id: 'current' });
    expect(await readEpoch(db, 'recent')).toMatchObject({ state: 'SEALED' });
    expect(await readD1EvidenceObject(db, recentObject)).toMatchObject({ epoch_id: 'recent' });
    expect(await db.prepare('SELECT epoch_id FROM sections_shadow_decisions ORDER BY epoch_id').raw())
      .toEqual([['current'], ['recent']]);
    expect(await db.prepare(`
      SELECT epoch_id, COUNT(*) FROM sections_shadow_lane_evidence GROUP BY epoch_id ORDER BY epoch_id
    `).raw()).toEqual([['current', EXPECTED_SECTIONS_LANE_COUNT], ['recent', EXPECTED_SECTIONS_LANE_COUNT]]);
    expect(await db.prepare(`
      SELECT epoch_id, COUNT(*) FROM sections_shadow_lane_payloads GROUP BY epoch_id
    `).raw()).toEqual([['current', EXPECTED_SECTIONS_LANE_COUNT]]);
  });

  it('aborts an incomplete acquisition before deleting its expired raw payload', async () => {
    const now = Date.now();
    const abandonedSlot = now - 36 * HOUR_MS - MINUTE_MS;
    const freshSlot = now - 36 * HOUR_MS + MINUTE_MS;
    const [lane] = await buildShadowLaneDefinitions();
    for (const [epochId, slot] of [['abandoned', abandonedSlot], ['fresh', freshSlot]] as const) {
      const epoch = await stageEpoch(epochId, slot, 'INDEPENDENT_LIVE');
      await stageEmptyLiveLane(epoch, lane);
    }

    await pruneShadowHistory(target, now);

    expect(await readEpoch(db, 'abandoned')).toMatchObject({
      state: 'ABORTED', failure_code: 'EPOCH_EXPIRED', terminal_at_ms: now,
    });
    expect(await readEpoch(db, 'fresh')).toMatchObject({ state: 'STAGED' });
    expect(await db.prepare('SELECT epoch_id FROM sections_shadow_lane_payloads').raw()).toEqual([['fresh']]);
    expect(await db.prepare('SELECT epoch_id FROM sections_shadow_lane_evidence ORDER BY epoch_id').raw())
      .toEqual([['abandoned'], ['fresh']]);
  });

  it('keeps expired history intact when cleanup cannot reserve D1 writes', async () => {
    const now = Date.now();
    const objectKey = await seedSealedEpoch('expired', now - WEEK_MS - MINUTE_MS);

    await expect(pruneShadowHistory({ ...target, SHADOW_MAX_D1_WRITES_PER_DAY: '1' }, now))
      .rejects.toMatchObject({ code: 'FREE_TIER_CAPACITY_EXHAUSTED' });

    expect(await readEpoch(db, 'expired')).toMatchObject({ state: 'SEALED' });
    expect(await readD1EvidenceObject(db, objectKey)).toMatchObject({ epoch_id: 'expired' });
  });
});
