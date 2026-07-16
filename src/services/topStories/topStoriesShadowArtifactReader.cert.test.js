import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  discoverTopStoriesArtifactDirectories,
  readTopStoriesArtifactDirectory,
} from '../../../scripts/top-stories-shadow/artifactReader.mjs';
import { sha256Text, stableJson } from '../../../scripts/top-stories-shadow/canonicalJson.mjs';

const STUDY = 'nw-rank-011-shadow-pilot-2026-07';
const SCHEDULED = '2026-07-16T10:07:00.000Z';
const RUN_AT = '2026-07-16T10:08:00.000Z';

function jsonText(value) {
  return `${stableJson(value)}\n`;
}

function descriptor(name, text, schemaVersion = null) {
  return {
    name,
    ...(schemaVersion ? { schemaVersion } : {}),
    byteSize: Buffer.byteLength(text, 'utf8'),
    sha256: sha256Text(text),
  };
}

async function writeArtifact(directory, { failure = false } = {}) {
  await mkdir(directory, { recursive: true });
  const payloadName = failure ? 'failure.json' : 'snapshot.json';
  const payload = failure
    ? {
      schemaVersion: 'nw-top-stories-run-failure/v1',
      studyId: STUDY,
      scheduledAt: SCHEDULED,
      runAt: RUN_AT,
      workflowRunId: '100',
      workflowRunAttempt: 1,
      errorCode: 'fixture_failure',
    }
    : {
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
    writeFile(
      path.join(directory, 'publication_manifest.json'),
      jsonText(publication),
      'utf8',
    ),
  ]);
}

describe('Top Stories shadow artifact reader', () => {
  it('validates success and failure artifact directories', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'nw-shadow-reader-'));
    await writeArtifact(path.join(root, 'success'));
    await writeArtifact(path.join(root, 'failure'), { failure: true });

    const directories = await discoverTopStoriesArtifactDirectories(root);
    expect(directories).toHaveLength(2);
    const records = await Promise.all(directories.map(readTopStoriesArtifactDirectory));
    expect(records.map(record => record.status).sort()).toEqual([
      'VALID_FAILURE',
      'VALID_SNAPSHOT',
    ]);
    expect(records.every(record => record.schemaValid)).toBe(true);
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
    expect(record.status).toBe('INVALID_ARTIFACT');
    expect(record.exclusionReason).toBe('artifact_byte_size_mismatch');
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
