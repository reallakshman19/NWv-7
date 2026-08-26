import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createSectionsShadowInputEpoch } from '../../../scripts/top-stories-shadow/sectionsShadowInputEpoch.mjs';
import {
  buildReplaySnapshotPlan,
  SECTIONS_SHADOW_REGISTRY_AUTHORITY,
} from '../src/replayExecutor.js';

const BENCHMARK_URL = new URL(
  '../../../scripts/top-stories-shadow/fixtures/nw-cf-hybrid-001a-benchmark.json',
  import.meta.url,
);
const BENCHMARK = JSON.parse(readFileSync(BENCHMARK_URL, 'utf8'));
const REFERENCE_COMMIT = 'd6ffdf222c8301037a96ca1fabc3bf1b929c8530';

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildEpoch(overrides = {}) {
  return createSectionsShadowInputEpoch({
    capturedAt: BENCHMARK.capturedAt,
    nowMs: BENCHMARK.nowMs,
    sourceRegistryVersion: SECTIONS_SHADOW_REGISTRY_AUTHORITY.sourceRegistryVersion,
    sourceRegistryDigest: SECTIONS_SHADOW_REGISTRY_AUTHORITY.sourceRegistryDigest,
    inputSource: BENCHMARK.inputSource,
    sectionItems: deepClone(BENCHMARK.epochTemplate.sectionItems),
    topFeedItems: deepClone(BENCHMARK.epochTemplate.topFeedItems),
    settings: deepClone(BENCHMARK.epochTemplate.settings),
    sourceHealth: deepClone(BENCHMARK.epochTemplate.sourceHealth),
    frozenBeforeShadowObservation: BENCHMARK.frozenBeforeShadowObservation,
    shadowOutputUsedToChooseExpected: BENCHMARK.shadowOutputUsedToChooseExpected,
    ...overrides,
  }, { expectedRegistryAuthority: SECTIONS_SHADOW_REGISTRY_AUTHORITY });
}

export function runReplayPlanCertification() {
  const epoch = buildEpoch();
  const plan = buildReplaySnapshotPlan(epoch, {
    codeCommitSha: REFERENCE_COMMIT,
  });
  const expectedSectionKeys = Object.keys(
    SECTIONS_SHADOW_REGISTRY_AUTHORITY.canonicalRegistry.sections,
  );

  assert.equal(plan.partitions.length, 10);
  assert.deepEqual(
    plan.partitions.map(partition => partition.sectionKey),
    expectedSectionKeys,
  );
  assert.equal(plan.items.length, 18);
  assert.equal(plan.snapshot.expectedSectionCount, 10);
  assert.equal(plan.snapshot.expectedItemCount, 18);
  assert.match(plan.snapshot.expectedPartitionDigest, /^[0-9a-f]{64}$/);
  assert.match(plan.snapshot.expectedItemRowsDigest, /^[0-9a-f]{64}$/);
  assert.equal(
    plan.decisionEvidence.decisionOutputDigest,
    BENCHMARK.expected.decisionOutputDigest,
  );
  assert.equal(plan.run.codeCommitSha, REFERENCE_COMMIT);

  assert.throws(
    () => buildReplaySnapshotPlan(epoch),
    error => error?.code === 'shadow_field_missing',
  );

  const withEmptyTechnology = deepClone(BENCHMARK.epochTemplate.sectionItems);
  withEmptyTechnology.technology = [];
  const emptyPlan = buildReplaySnapshotPlan(
    buildEpoch({ sectionItems: withEmptyTechnology }),
    { codeCommitSha: REFERENCE_COMMIT },
  );
  assert.equal(emptyPlan.partitions.length, 10);
  assert.equal(
    emptyPlan.partitions.find(partition => partition.sectionKey === 'technology')?.expectedItemCount,
    0,
  );

  const incompleteSections = deepClone(BENCHMARK.epochTemplate.sectionItems);
  delete incompleteSections.technology;
  const incompleteEpoch = buildEpoch({ sectionItems: incompleteSections });
  assert.throws(
    () => buildReplaySnapshotPlan(incompleteEpoch, { codeCommitSha: REFERENCE_COMMIT }),
    error => error?.code === 'replay_section_set_incomplete',
  );

  return Object.freeze({
    registrySections: SECTIONS_SHADOW_REGISTRY_AUTHORITY.sectionCount,
    registryLanes: SECTIONS_SHADOW_REGISTRY_AUTHORITY.laneCount,
    benchmarkItems: plan.items.length,
    decisionOutputDigest: plan.decisionEvidence.decisionOutputDigest,
    emptyPartitionPreserved: true,
    missingPartitionFailsClosed: true,
    explicitCommitProvenanceRequired: true,
  });
}

const isDirect = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirect) {
  console.log(JSON.stringify(runReplayPlanCertification(), null, 2));
}
