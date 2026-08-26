import sectionSourcePolicy from '../../../config/section_sources.json' with { type: 'json' };
import { digestCanonicalJson } from '../../../scripts/top-stories-shadow/canonicalJson.mjs';
import { evaluateFrozenSectionsEpoch } from '../../../scripts/top-stories-shadow/sectionsShadowEvaluator.mjs';
import { validateSectionsShadowInputEpoch } from '../../../scripts/top-stories-shadow/sectionsShadowInputEpoch.mjs';
import { buildSectionsSourceRegistryAuthority } from '../../../scripts/top-stories-shadow/sectionsShadowSourceRegistry.mjs';
import { evaluateTopStories } from '../../../src/services/topStories/topStoriesRanker.js';
import { getStorySourceFamily } from '../../../src/services/topStories/topStoriesSourceIdentity.js';
import {
  createSourceRun,
  completeSourceRun,
  finalizeSnapshot,
  stageSnapshot,
  writeSnapshotItems,
} from './epochStore.js';
import { SECTIONS_SHADOW_SNAPSHOT_SCHEMA } from './contracts.js';

export const SECTIONS_SHADOW_REGISTRY_AUTHORITY =
  buildSectionsSourceRegistryAuthority(sectionSourcePolicy);

function storyIdentity(story = {}, fallback) {
  return String(
    story.id || story.canonicalId || story.url || story.link || story.title || fallback,
  ).trim();
}

function buildStoredSections(epoch, evaluation) {
  const sections = {};
  for (const [section, rows] of Object.entries(epoch.sectionItems || {})) {
    sections[section] = section === 'topStories'
      ? evaluation.selected
      : (Array.isArray(rows) ? rows : []);
  }
  return sections;
}

export function buildStoredSnapshotItems(epoch, evaluation) {
  const sections = buildStoredSections(epoch, evaluation);
  return Object.entries(sections).flatMap(([sectionKey, rows]) =>
    rows.map((story, position) => ({
      sectionKey,
      position,
      storyId: storyIdentity(story, `${sectionKey}:${position}`),
      sourceFamily: getStorySourceFamily(story),
      storyJson: JSON.stringify(story),
    })));
}

export function buildReplaySnapshotPlan(epoch, options = {}) {
  const frozen = validateSectionsShadowInputEpoch(epoch, {
    expectedRegistryAuthority: SECTIONS_SHADOW_REGISTRY_AUTHORITY,
  });
  const decisionEvidence = evaluateFrozenSectionsEpoch(frozen, {
    expectedRegistryAuthority: SECTIONS_SHADOW_REGISTRY_AUTHORITY,
    displayDepth: options.displayDepth ?? 10,
  });
  const evaluation = evaluateTopStories({
    sectionItems: frozen.sectionItems,
    topFeedItems: frozen.topFeedItems,
    settings: frozen.settings,
    nowMs: frozen.nowMs,
  }, {
    nowMs: frozen.nowMs,
    displayDepth: options.displayDepth ?? 10,
  });
  const items = buildStoredSnapshotItems(frozen, evaluation);
  const expectedSectionCount = new Set(items.map(item => item.sectionKey)).size;
  const expectedItemRowsDigest = digestCanonicalJson(items);
  const runId = options.runId || `replay:${frozen.inputEvidenceDigest}`;
  const snapshotId = options.snapshotId || `shadow:${decisionEvidence.decisionOutputDigest}`;
  const createdAt = options.createdAt || frozen.capturedAt;
  const codeCommitSha = options.codeCommitSha || 'UNSPECIFIED_REFERENCE_COMMIT';

  return Object.freeze({
    run: {
      runId,
      scheduledAt: frozen.capturedAt,
      acquisitionStartedAt: frozen.capturedAt,
      acquisitionCompletedAt: frozen.capturedAt,
      codeCommitSha,
      sourceRegistryVersion: frozen.sourceRegistryVersion,
      sourceRegistryDigest: frozen.sourceRegistryDigest,
      inputEvidenceDigest: frozen.inputEvidenceDigest,
      state: 'RUNNING',
    },
    snapshot: {
      snapshotId,
      runId,
      snapshotSchemaVersion: SECTIONS_SHADOW_SNAPSHOT_SCHEMA,
      createdAt,
      sourceRegistryVersion: frozen.sourceRegistryVersion,
      sourceRegistryDigest: frozen.sourceRegistryDigest,
      sourceIdentityVersion: decisionEvidence.executableVersions.sourceIdentityVersion,
      normalizationVersion: decisionEvidence.executableVersions.normalizationVersion,
      normalizationDigest: decisionEvidence.normalizationDigest,
      eventClassifierVersion: decisionEvidence.executableVersions.eventClassifierVersion,
      rankerVersion: decisionEvidence.executableVersions.rankerVersion,
      rankerPolicyDigest: decisionEvidence.rankerPolicyDigest,
      inputEvidenceDigest: decisionEvidence.inputEvidenceDigest,
      decisionOutputDigest: decisionEvidence.decisionOutputDigest,
      expectedSectionCount,
      expectedItemCount: items.length,
      expectedItemRowsDigest,
      state: 'STAGED',
    },
    items,
    decisionEvidence,
  });
}

export async function persistReplaySnapshot(db, epoch, options = {}) {
  const plan = buildReplaySnapshotPlan(epoch, options);
  await createSourceRun(db, plan.run);
  await completeSourceRun(db, plan.run.runId, {
    acquisitionCompletedAt: plan.run.acquisitionCompletedAt,
    inputEvidenceDigest: plan.run.inputEvidenceDigest,
  });
  await stageSnapshot(db, plan.snapshot);
  await writeSnapshotItems(db, plan.snapshot.snapshotId, plan.items, options);
  const finalized = await finalizeSnapshot(
    db,
    plan.snapshot.snapshotId,
    options.committedAt || plan.snapshot.createdAt,
  );
  return { ...plan, finalized };
}
