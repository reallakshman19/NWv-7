import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { sha256Text, stableJson } from '../../../scripts/top-stories-shadow/canonicalJson.mjs';
import {
  canonicalizeTopStoriesPilotArtifacts,
  readTopStoriesPilotArtifact,
} from '../../../scripts/top-stories-shadow/pilotArtifactReader.mjs';
import { buildPilotArtifacts } from './fixtures/topStoriesPilotDecisionFixture.js';

function descriptor(name, text) {
  return { name, byteSize: Buffer.byteLength(text, 'utf8'), sha256: sha256Text(text) };
}

async function writeDaily(directory, report) {
  const reportText = `${stableJson(report)}\n`;
  const markdownText = '# report\n';
  const manifest = {
    schemaVersion: 'nw-top-stories-shadow-aggregation-manifest/v1',
    studyId: report.studyId,
    date: report.date,
    files: [
      descriptor('daily_report.json', reportText),
      descriptor('daily_report.md', markdownText),
    ],
  };
  await Promise.all([
    writeFile(path.join(directory, 'daily_report.json'), reportText, 'utf8'),
    writeFile(path.join(directory, 'daily_report.md'), markdownText, 'utf8'),
    writeFile(path.join(directory, 'aggregation_manifest.json'), `${stableJson(manifest)}\n`, 'utf8'),
  ]);
}

function validReport() {
  return structuredClone(buildPilotArtifacts().find(row => row.type === 'daily').dailyReport);
}

describe('Top Stories pilot artifact reader', () => {
  it('validates v1 comparison evidence and rejects corrupted payloads', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'nw-pilot-artifact-'));
    await writeDaily(directory, validReport());
    const valid = await readTopStoriesPilotArtifact(directory, {
      type: 'daily', artifactId: 1, runAttempt: 1,
    });
    expect(valid.schemaValid).toBe(true);
    expect(valid.comparisonEvidenceStatus).toBe('VALID');
    await writeFile(path.join(directory, 'daily_report.md'), '# changed\n', 'utf8');
    const invalid = await readTopStoriesPilotArtifact(directory, {
      type: 'daily', artifactId: 2, runAttempt: 2,
    });
    expect(invalid.schemaValid).toBe(false);
    expect(invalid.integrityErrors).toContain('byte_size_mismatch:daily_report.md');
  });

  it('retains historical missing evidence as MISSING_LEGACY inventory', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'nw-pilot-legacy-'));
    const report = { schemaVersion: 'nw-top-stories-daily-stability-report/v1',
      studyId: 'study', date: '2026-07-17', status: 'OBSERVED' };
    await writeDaily(directory, report);
    const legacy = await readTopStoriesPilotArtifact(directory, {
      type: 'daily', artifactId: 3, runAttempt: 1,
    });
    expect(legacy.schemaValid).toBe(true);
    expect(legacy.comparisonEvidenceStatus).toBe('MISSING_LEGACY');
    expect(legacy.comparisonEvidenceReasonCodes).toEqual(['comparison_evidence_missing']);
  });

  it('fails closed for present corrupt comparison evidence', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'nw-pilot-invalid-'));
    const report = validReport();
    report.comparisonEvidence.canonicalComparisonIds[0] = '0'.repeat(64);
    await writeDaily(directory, report);
    const invalid = await readTopStoriesPilotArtifact(directory, {
      type: 'daily', artifactId: 4, runAttempt: 1,
    });
    expect(invalid.schemaValid).toBe(false);
    expect(invalid.comparisonEvidenceStatus).toBe('INVALID');
    expect(invalid.comparisonEvidenceReasonCodes)
      .toContain('canonical_comparison_reference_unknown');
  });

  it('prefers schema-valid evidence before attempt and artifact ID', () => {
    const valid = { type: 'daily', studyId: 'study', date: '2026-07-17',
      artifactId: 10, runAttempt: 1, schemaValid: true, comparisonEvidenceStatus: 'VALID' };
    const invalid = { type: 'daily', studyId: 'study', date: '2026-07-17',
      artifactId: 20, runAttempt: 2, schemaValid: false, comparisonEvidenceStatus: 'INVALID' };
    const result = canonicalizeTopStoriesPilotArtifacts([valid, invalid]);
    expect(result.canonical).toEqual([valid]);
    expect(result.superseded[0].supersededArtifactId).toBe(20);
  });
});
