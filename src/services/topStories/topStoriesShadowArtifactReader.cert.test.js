import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  discoverTopStoriesArtifactDirectories,
  readTopStoriesArtifactDirectory,
} from '../../../scripts/top-stories-shadow/artifactReader.mjs';
import { sha256Text, stableJson }
  from '../../../scripts/top-stories-shadow/canonicalJson.mjs';
import { buildTopStoriesRunSnapshot }
  from '../../../scripts/top-stories-shadow/snapshotBuilder.mjs';

const STUDY = 'nw-rank-011-shadow-pilot-2026-07';
const SCHEDULED = '2026-07-16T10:07:00.000Z';
const RUN_AT = '2026-07-16T10:08:00.000Z';
const CONFIG = JSON.parse(readFileSync(
  new URL('../../../config/top_stories_shadow_study.json', import.meta.url),
  'utf8',
));
function jsonText(value) { return `${stableJson(value)}\n`; }
function descriptor(name, text, schemaVersion = null) {
  return {
    name,
    ...(schemaVersion ? { schemaVersion } : {}),
    byteSize: Buffer.byteLength(text, 'utf8'),
    sha256: sha256Text(text),
  };
}
function metadata() {
  return {
    repositorySha: 'abc123def456',
    workflowRunId: '100',
    workflowRunAttempt: 1,
    scheduledAt: SCHEDULED,
    runAt: RUN_AT,
  };
}
function story(id, extra = {}) {
  return {
    id: `story-${id}`,
    canonicalId: `canonical-${id}`,
    title: `Flood evacuation alert ${id}`,
    source: 'Trusted Source',
    sourceGroup: 'trusted-source',
    publishedAt: Date.parse(RUN_AT) - (60 * 60 * 1000),
    timestampConfidence: 'high',
    sourceCount: 2,
    ...extra,
  };
}
function inputBundle() {
  return {
    sectionItems: { world: [
      story('1'),
      story('2'),
      story('rejected', { title: 'Community update', sourceCount: 1 }),
    ] },
    topFeedItems: [],
    settings: {},
    sourceHealth: { ok: true, complete: true, failedSourceCount: 0 },
    inputSource: 'repository-public-newsdata-sections',
    inputSnapshotGeneratedAt: '2026-07-16T10:00:00.000Z',
  };
}
function legacySnapshot() {
  return {
    schemaVersion: 'nw-top-stories-run-snapshot/v1',
    studyId: STUDY,
    scheduledAt: SCHEDULED,
    runAt: RUN_AT,
    workflowRunId: '100',
    workflowRunAttempt: 1,
    completenessState: 'COMPLETE',
    analyticalEligibility: 'ELIGIBLE',
    displayed: [],
    candidateEvidence: [],
  };
}
function failurePayload() {
  return {
    schemaVersion: 'nw-top-stories-run-failure/v1',
    studyId: STUDY,
    scheduledAt: SCHEDULED,
    runAt: RUN_AT,
    workflowRunId: '100',
    workflowRunAttempt: 1,
    errorCode: 'fixture_failure',
  };
}
async function writeArtifact(directory, { kind = 'legacy', mutate } = {}) {
  await mkdir(directory, { recursive: true });
  let payload = kind === 'failure'
    ? failurePayload()
    : kind === 'v3'
      ? buildTopStoriesRunSnapshot({
        studyConfig: CONFIG,
        inputBundle: inputBundle(),
        metadata: metadata(),
      })
      : legacySnapshot();
  payload = structuredClone(payload);
  if (mutate) mutate(payload);
  const payloadName = kind === 'failure' ? 'failure.json' : 'snapshot.json';
  const payloadText = jsonText(payload);
  const coreManifest = {
    schemaVersion: 'nw-top-stories-artifact-manifest/v1',
    studyId: STUDY,
    runAt: RUN_AT,
    files: [descriptor(payloadName, payloadText, payload.schemaVersion)],
  };
  const operational = {
    schemaVersion: 'nw-top-stories-shadow-operational/v1',
    studyId: STUDY,
    scheduledAt: SCHEDULED,
    runAt: RUN_AT,
    workflowRunId: '100',
    workflowRunAttempt: 1,
    nominalSlotKey: '20260716T1007Z',
    scheduleDelaySeconds: 60,
  };
  const files = {
    [payloadName]: payloadText,
    'manifest.json': jsonText(coreManifest),
    'operational.json': jsonText(operational),
  };
  const publication = {
    schemaVersion: 'nw-top-stories-shadow-publication-manifest/v1',
    studyId: STUDY,
    scheduledAt: SCHEDULED,
    runAt: RUN_AT,
    files: Object.entries(files).map(([name, text]) => descriptor(name, text)),
  };
  await Promise.all([
    ...Object.entries(files).map(([name, text]) =>
      writeFile(path.join(directory, name), text, 'utf8')),
    writeFile(path.join(directory, 'publication_manifest.json'),
      jsonText(publication), 'utf8'),
  ]);
}

describe('Top Stories shadow artifact reader', () => {
  it('distinguishes valid v3, legacy snapshot, and failure evidence', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'nw-shadow-reader-'));
    await writeArtifact(path.join(root, 'v3'), { kind: 'v3' });
    await writeArtifact(path.join(root, 'legacy'));
    await writeArtifact(path.join(root, 'failure'), { kind: 'failure' });
    const directories = await discoverTopStoriesArtifactDirectories(root);
    const records = await Promise.all(directories.map(readTopStoriesArtifactDirectory));
    expect(records).toHaveLength(3);
    expect(records.find(row => row.directory.endsWith('/v3')).traceRelationStatus).toBe('VALID');
    expect(records.find(row => row.directory.endsWith('/legacy')).traceRelationStatus)
      .toBe('MISSING_LEGACY');
    expect(records.find(row => row.directory.endsWith('/failure')).traceRelationStatus)
      .toBe('NOT_APPLICABLE');
    expect(records.every(record => record.schemaValid)).toBe(true);
  });

  it('fails closed for incomplete, unsupported, or semantically corrupt v3 evidence', async () => {
    const cases = [
      {
        reason: 'trace_relation_fields_incomplete',
        mutate: payload => { delete payload.traceRelations; },
      },
      {
        reason: 'trace_relation_schema_unsupported',
        mutate: payload => { payload.traceRelationSchemaVersion = 'unsupported/v9'; },
      },
      {
        reason: 'trace_relation_validation_failed',
        mutate: payload => {
          payload.traceRelations.sourceCandidateEdges[0].candidateId = 'missing';
        },
      },
      {
        reason: 'trace_relation_validation_failed',
        mutate: payload => {
          const record = payload.traceRelations.candidateDispositionRecords[0];
          record.finalDisposition = 'ELIGIBLE_NOT_SELECTED';
        },
      },
    ];
    for (const [index, testCase] of cases.entries()) {
      const root = await mkdtemp(path.join(os.tmpdir(), `nw-shadow-v3-${index}-`));
      await writeArtifact(root, { kind: 'v3', mutate: testCase.mutate });
      const record = await readTopStoriesArtifactDirectory(root);
      expect(record.schemaValid).toBe(false);
      expect(record.traceRelationStatus).toBe('INVALID');
      expect(record.exclusionReason).toBe(testCase.reason);
    }
  });

  it('fails closed when a described file is corrupted', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'nw-shadow-corrupt-'));
    await writeArtifact(root);
    const snapshotPath = path.join(root, 'snapshot.json');
    const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
    snapshot.workflowRunAttempt = 2;
    await writeFile(snapshotPath, jsonText(snapshot), 'utf8');
    const record = await readTopStoriesArtifactDirectory(root);
    expect(record.schemaValid).toBe(false);
    expect(record.exclusionReason).toBe('artifact_hash_mismatch');
  });

  it('rejects unknown publication schemas', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'nw-shadow-schema-'));
    await writeArtifact(root);
    const manifestPath = path.join(root, 'publication_manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.schemaVersion = 'unknown/v9';
    await writeFile(manifestPath, jsonText(manifest), 'utf8');
    const record = await readTopStoriesArtifactDirectory(root);
    expect(record.schemaValid).toBe(false);
    expect(record.exclusionReason).toBe('unsupported_schema');
  });
});
