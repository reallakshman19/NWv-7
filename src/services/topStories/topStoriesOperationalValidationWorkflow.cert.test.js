import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { sha256Text, stableJson } from '../../../scripts/top-stories-shadow/canonicalJson.mjs';
import {
  buildPilotArtifacts,
  PILOT_STUDY_ID,
} from './fixtures/topStoriesPilotDecisionFixture.js';

const ROOT = process.cwd();
const CLI = path.join(ROOT, 'scripts/validate_top_stories_shadow_24h.mjs');
const WORKFLOW = path.join(ROOT, '.github/workflows/top_stories_shadow_validate_24h.yml');
const CONFIG = path.join(ROOT, 'config/top_stories_shadow_study.json');
const DATE = '2026-07-17';
const jsonText = value => `${stableJson(value)}\n`;
const text = filePath => readFile(filePath, 'utf8');

function descriptor(name, value) {
  return { name, byteSize: Buffer.byteLength(value, 'utf8'), sha256: sha256Text(value) };
}

function downloadRows(count) {
  const start = Date.parse(`${DATE}T00:07:00.000Z`);
  return Array.from({ length: count }, (_, index) => {
    const time = new Date(start + (index * 15 * 60 * 1000));
    const runId = String(5000 + index);
    const slot = `${time.toISOString().slice(0, 16).replace(/[-:]/g, '')}Z`;
    return { runId, runAttempt: 1, runCreatedAt: time.toISOString(),
      artifactName: `top-stories-shadow-${PILOT_STUDY_ID}-${slot}-${runId}-attempt-1` };
  });
}

async function writeInputs(root) {
  const report = structuredClone(
    buildPilotArtifacts().find(row => row.type === 'daily').dailyReport,
  );
  report.coverage = {
    ...report.coverage,
    scheduledRuns: 96,
    scheduledSlots: 96,
    observedSlotCount: 92,
    scheduleSlotCoverage: 0.95,
    startedRuns: 92,
    successfulRuns: 92,
    completeRuns: 91,
    analyticallyEligibleRuns: 90,
    failureRuns: 0,
    failedInputRuns: 0,
    invalidArtifacts: 0,
    unassignedInvalidArtifacts: 0,
    scheduleDelaySeconds: { p90: 240 },
  };
  const reportText = jsonText(report);
  const markdownText = '# Daily report fixture\n';
  const aggregation = {
    schemaVersion: 'nw-top-stories-shadow-aggregation-manifest/v1',
    studyId: PILOT_STUDY_ID,
    date: DATE,
    files: [descriptor('daily_report.json', reportText),
      descriptor('daily_report.md', markdownText)],
  };
  const download = {
    schemaVersion: 'nw-top-stories-shadow-download-manifest/v1',
    studyId: PILOT_STUDY_ID,
    date: DATE,
    downloaded: downloadRows(92),
    excludedRuns: [],
  };
  const paths = {
    report: path.join(root, 'daily_report.json'),
    markdown: path.join(root, 'daily_report.md'),
    aggregation: path.join(root, 'aggregation_manifest.json'),
    download: path.join(root, 'download_manifest.json'),
    config: CONFIG,
  };
  await Promise.all([
    writeFile(paths.report, reportText, 'utf8'),
    writeFile(paths.markdown, markdownText, 'utf8'),
    writeFile(paths.aggregation, jsonText(aggregation), 'utf8'),
    writeFile(paths.download, jsonText(download), 'utf8'),
  ]);
  return paths;
}

function runCli(paths, output) {
  return spawnSync(process.execPath, [CLI, '--daily-report', paths.report,
    '--daily-markdown', paths.markdown, '--aggregation-manifest', paths.aggregation,
    '--download-manifest', paths.download, '--config', paths.config,
    '--output', output], { cwd: ROOT, encoding: 'utf8' });
}

describe('Top Stories 24-hour validation CLI and workflow', () => {
  it('writes byte-stable PASS evidence for identical valid comparison evidence', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'nw-shadow-24h-'));
    const paths = await writeInputs(root);
    const outputA = path.join(root, 'a');
    const outputB = path.join(root, 'b');
    await mkdir(outputA);
    await mkdir(outputB);
    expect(runCli(paths, outputA).status).toBe(0);
    expect(runCli(paths, outputB).status).toBe(0);
    for (const name of ['operational_validation.json', 'operational_validation.md',
      'validation_manifest.json']) {
      expect(await text(path.join(outputB, name))).toBe(await text(path.join(outputA, name)));
    }
    const validation = JSON.parse(await text(path.join(outputA, 'operational_validation.json')));
    expect(validation.decision).toBe('PASS');
    expect(validation.failureReasonCodes).toEqual([]);
  });

  it('writes a structured FAIL artifact before returning nonzero on corruption', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'nw-shadow-24h-fail-'));
    const paths = await writeInputs(root);
    await writeFile(paths.markdown, '# Corrupted markdown\n', 'utf8');
    const output = path.join(root, 'output');
    expect(runCli(paths, output).status).toBe(1);
    const validation = JSON.parse(await text(path.join(output, 'operational_validation.json')));
    expect(validation.decision).toBe('FAIL');
    expect(validation.failureReasonCodes).toContain('input_integrity_failure');
  });

  it('is a read-only post-aggregation artifact workflow', async () => {
    const workflow = await text(WORKFLOW);
    expect(workflow).toContain('workflow_run:');
    expect(workflow).toContain('Top Stories Shadow Aggregate');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('contents: read');
    expect(workflow).toContain('actions: read');
    expect(workflow).not.toContain('contents: write');
    expect(workflow).not.toContain('git push');
    expect(workflow).toContain('actions/download-artifact@v4');
    expect(workflow).toContain('top-stories-shadow-daily-*');
    expect(workflow).toContain('continue-on-error: true');
    expect(workflow).toContain('actions/upload-artifact@v4');
    expect(workflow).toContain('Enforce technical failure');
  });
});
