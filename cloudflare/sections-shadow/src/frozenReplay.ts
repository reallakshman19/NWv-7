import benchmark from '../../../scripts/top-stories-shadow/fixtures/nw-cf-hybrid-001a-benchmark.json';
import auditedExpectations from '../../../scripts/top-stories-shadow/fixtures/nw-cf-hybrid-001a-audited-v2.json';
import frozenSourceRegistry from '../../../scripts/top-stories-shadow/fixtures/nw-cf-hybrid-001a-source-registry-v1.json';
import { buildSectionsSourceRegistryAuthority } from '../../../scripts/top-stories-shadow/sectionsShadowSourceRegistry.mjs';
import { buildLiveLaneDefinitions } from '../../../scripts/sections-live/sectionsLiveAuthority.mjs';
import { evaluateFrozenSectionsEpoch } from '../../../scripts/top-stories-shadow/sectionsShadowEvaluator.mjs';
import { createSectionsShadowInputEpoch } from '../../../scripts/top-stories-shadow/sectionsShadowInputEpoch.mjs';
import {
  EXPECTED_SECTIONS_LANE_COUNT,
  type DecisionEvidenceRow,
  type FrozenDecisionEvidence,
  type LaneEvidence,
} from './contracts';
import {
  attachDecisionObject,
  commitEpoch,
  readCurrentShadow,
  readEpoch,
  sealEpoch,
  stageDecisionEvidenceBatch,
  stageLaneEvidenceBatch,
  startEpoch,
  type CustodyEnv,
} from './custody';
import { digestValue, sha256Text } from './crypto';
import { putImmutableD1EvidenceObject } from './evidenceStore';
import type { ShadowLaneDefinition } from './registry';

interface BenchmarkFixture {
  capturedAt: string;
  nowMs: number;
  inputSource: string;
  frozenBeforeShadowObservation: boolean;
  shadowOutputUsedToChooseExpected: boolean;
  epochTemplate: {
    sectionItems: Record<string, unknown[]>;
    topFeedItems: unknown[];
    settings: Record<string, unknown>;
    sourceHealth: Record<string, unknown>;
  };
  expected?: {
    decisionOutputDigest?: string;
    selectedIds?: string[];
  };
  [key: string]: unknown;
}

const fixture = benchmark as unknown as BenchmarkFixture;
// Historical certification must keep its own original feed URLs and digest.
// Live endpoint maintenance must never rewrite the frozen benchmark contract.
const frozenRegistryAuthority = buildSectionsSourceRegistryAuthority(frozenSourceRegistry);

function buildFrozenEpoch(): Record<string, unknown> {
  return createSectionsShadowInputEpoch({
    capturedAt: fixture.capturedAt,
    nowMs: fixture.nowMs,
    sourceRegistryVersion: frozenRegistryAuthority.sourceRegistryVersion,
    sourceRegistryDigest: frozenRegistryAuthority.sourceRegistryDigest,
    inputSource: fixture.inputSource,
    sectionItems: fixture.epochTemplate.sectionItems,
    topFeedItems: fixture.epochTemplate.topFeedItems,
    settings: fixture.epochTemplate.settings,
    sourceHealth: fixture.epochTemplate.sourceHealth,
    frozenBeforeShadowObservation: fixture.frozenBeforeShadowObservation,
    shadowOutputUsedToChooseExpected: fixture.shadowOutputUsedToChooseExpected,
  }, { expectedRegistryAuthority: frozenRegistryAuthority }) as Record<string, unknown>;
}

function assertBenchmarkExpectation(evidence: FrozenDecisionEvidence): void {
  if (JSON.stringify(evidence.executableVersions) !== JSON.stringify(auditedExpectations.executableVersions) ||
      JSON.stringify(evidence.selectedIds) !== JSON.stringify(auditedExpectations.selectedIds)) {
    throw new Error('Frozen benchmark executable versions or selected story order changed');
  }
  for (const [identity, expected] of Object.entries(auditedExpectations.candidateExpectations)) {
    const row = evidence.candidateEvidence.find(candidate => candidate.identity === identity);
    if (!row || Object.entries(expected).some(([field, value]) => JSON.stringify(row[field]) !== JSON.stringify(value))) {
      throw new Error(`Frozen benchmark semantic expectation changed: ${identity}`);
    }
  }
  const expectedDigest = auditedExpectations.decisionOutputDigest;
  if (expectedDigest && evidence.decisionOutputDigest !== expectedDigest) {
    throw new Error(
      `Frozen benchmark decision digest changed: ${evidence.decisionOutputDigest} != ${expectedDigest}`,
    );
  }
}

export async function evaluateBundledFrozenReplay(): Promise<FrozenDecisionEvidence> {
  const evidence = evaluateFrozenSectionsEpoch(buildFrozenEpoch(), {
    expectedRegistryAuthority: frozenRegistryAuthority,
  }) as FrozenDecisionEvidence;
  assertBenchmarkExpectation(evidence);
  return evidence;
}

export async function runBundledFrozenReplay(
  env: CustodyEnv,
  input: { epochId: string; logicalSlot: number; attempt?: number },
): Promise<Awaited<ReturnType<typeof commitEpoch>>> {
  const nowMs = Date.now();
  const evidence = await evaluateBundledFrozenReplay();
  const existing = await readEpoch(env.SHADOW_DB, input.epochId);
  if (existing?.state === 'SHADOW_COMMITTED') {
    const current = await readCurrentShadow(env.SHADOW_DB);
    if (!current) throw new Error('Committed shadow epoch has no current pointer');
    return { epoch: existing, pointer: current.pointer };
  }
  if (existing?.state === 'SEALED') return commitEpoch(env, input.epochId, nowMs);
  if (existing?.state === 'ABORTED' || existing?.state === 'REJECTED') {
    throw new Error(`Frozen replay epoch ${input.epochId} is terminal: ${existing.state}`);
  }

  await startEpoch(env, {
    epochId: input.epochId,
    logicalSlot: input.logicalSlot,
    scheduledAtMs: input.logicalSlot,
    evaluationNowMs: evidence.nowMs,
    attempt: input.attempt ?? 1,
    acquisitionMode: 'FROZEN_REPLAY',
    expectedLaneCount: EXPECTED_SECTIONS_LANE_COUNT,
    sourceRegistryVersion: frozenRegistryAuthority.sourceRegistryVersion,
    sourceRegistryDigest: frozenRegistryAuthority.sourceRegistryDigest,
    inputEvidenceDigest: evidence.inputEvidenceDigest,
    nowMs,
  });

  const lanes = buildLiveLaneDefinitions(frozenRegistryAuthority) as ShadowLaneDefinition[];
  const firstLaneBySection = new Set<string>();
  const laneEvidence: LaneEvidence[] = [];
  for (const lane of lanes) {
    const isFirst = !firstLaneBySection.has(lane.sectionKey);
    if (isFirst) firstLaneBySection.add(lane.sectionKey);
    const sectionItemCount = Array.isArray(fixture.epochTemplate.sectionItems[lane.sectionKey])
      ? fixture.epochTemplate.sectionItems[lane.sectionKey].length
      : 0;
    const itemCount = isFirst ? sectionItemCount : 0;
    const disposition = itemCount > 0 ? 'OK' : 'EMPTY';
    const laneDigest = await digestValue({
      acquisitionMode: 'FROZEN_REPLAY',
      inputEvidenceDigest: evidence.inputEvidenceDigest,
      laneId: lane.laneId,
      sectionKey: lane.sectionKey,
      disposition,
      itemCount,
    });
    laneEvidence.push({
      epochId: input.epochId,
      laneId: lane.laneId,
      sectionKey: lane.sectionKey,
      sourceGroup: lane.sourceGroup,
      sourceName: lane.sourceName,
      feedUrlDigest: lane.feedUrlDigest,
      disposition,
      itemCount,
      evidenceDigest: laneDigest,
      attemptCount: input.attempt ?? 1,
      observedAtMs: evidence.nowMs,
    });
  }
  await stageLaneEvidenceBatch(env, laneEvidence);

  const decisionRows: DecisionEvidenceRow[] = [];
  for (const candidate of evidence.candidateEvidence) {
    const evidenceJson = JSON.stringify(candidate);
    decisionRows.push({
      epochId: input.epochId,
      candidateIdentity: candidate.identity,
      authoritativeRank: candidate.authoritativeRank,
      selectedPosition: candidate.selectedPosition ?? undefined,
      displayedPosition: candidate.displayedPosition ?? undefined,
      evidenceDigest: await sha256Text(evidenceJson),
      evidenceJson,
    });
  }
  await stageDecisionEvidenceBatch(env, decisionRows);

  const objectText = JSON.stringify(evidence);
  const objectDigest = await sha256Text(objectText);
  const objectKey = `normalized/frozen-replay/${input.epochId}/${objectDigest}.json`;
  const storedDigest = await putImmutableD1EvidenceObject(env, {
    objectKey,
    epochId: input.epochId,
    body: objectText,
    schemaVersion: evidence.schemaVersion,
    decisionOutputDigest: evidence.decisionOutputDigest,
    createdAtMs: nowMs,
    expiresAtMs: nowMs + 7 * 24 * 60 * 60 * 1_000,
  });
  if (storedDigest !== objectDigest) {
    throw new Error('D1 evidence digest changed while storing the frozen replay');
  }
  await attachDecisionObject(env, {
    epochId: input.epochId,
    objectKey,
    objectDigest,
    decisionOutputDigest: evidence.decisionOutputDigest,
    expectedDecisionCount: evidence.candidateCount,
  });
  await sealEpoch(env, input.epochId, nowMs);
  return commitEpoch(env, input.epochId, nowMs);
}
