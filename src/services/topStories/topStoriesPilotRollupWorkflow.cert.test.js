import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { stableJson } from '../../../scripts/top-stories-shadow/canonicalJson.mjs';

const ROOT = process.cwd();
const CLI = path.join(ROOT, 'scripts/build_top_stories_pilot_rollup.mjs');
const WORKFLOW = path.join(ROOT, '.github/workflows/top_stories_shadow_pilot_rollup.yml');
const AUTHORITY_WORKFLOW = path.join(
  ROOT,
  '.github/workflows/top_stories_shadow_pilot_decision.yml',
);
const CONFIG = path.join(ROOT, 'config/top_stories_shadow_study.json');
const STUDY = 'nw-rank-011-shadow-pilot-2026-07';
const SEGMENT = [
  STUDY,
  'nw-top-stories-ranker-observed-v1',
  'nw-top-stories-identity-v1',
  'nw-top-stories-period-classifier-v1',
].join('|');

function report(date) {
  return {
    schemaVersion: 'nw-top-stories-daily-stability-report/v1',
    studyId: STUDY,
    date,
    versionSegments: [SEGMENT],
    coverage: { scheduleSlotCoverage: 0.95 },
    stability: {
      fifteenMinute: {
        canonicalNonOverlapping: {
          calm: { incumbentRetention: { count: 6, median: 0.94 } },
          active: { incumbentRetention: { count: 1, median: 0.6 } },
        },
        overlapping: { active: { incumbentRetention: { count: 1, median: 0.6 } } },
      },
      sixtyMinute: {
        canonicalNonOverlapping: {
          calm: { incumbentRetention: { count: 3, median: 0.86 } },
          active: { incumbentRetention: { count: 0, median: null } },
        },
        overlapping: { active: { incumbentRetention: { count: 0, median: null } } },
      },
    },
    railAndFunnel: {
      observationCount: 90,
      displayedCount: { median: 9 },
      belowSoftReviewDepth: { count: 9, fraction: 0.1 },
      railBuckets: { '0': 0, '1-3': 2, '4-7': 7, '8-9': 36, '10': 45, other: 0 },
      finalReasonCounts: { max_per_source: 5 },
      candidateBuildReasonCounts: { candidate_created: 90 },
    },
  };
}

function validation(date) {
  return {
    schemaVersion: 'nw-top-stories-24h-operational-validation/v1',
    studyId: STUDY,
    date,
    decision: 'PASS',
    failureReasonCodes: [],
    insufficiencyReasonCodes: [],
  };
}

async function writeDay(root, date) {
  const daily = path.join(root, 'daily', date);
  const validationDir = path.join(root, 'validation', date);
  await mkdir(daily, { recursive: true });
  await mkdir(validationDir, { recursive: true });
  await writeFile(path.join(daily, 'daily_report.json'), `${stableJson(report(date))}\n`, 'utf8');
  await writeFile(
    path.join(validationDir, 'operational_validation.json'),
    `${stableJson(validation(date))}\n`,
    'utf8',
  );
}

function runCli(input, output, startDate, endDate) {
  return spawnSync(process.execPath, [
    CLI,
    '--input', input,
    '--output', output,
    '--config', CONFIG,
    '--start-date', startDate,
    '--end-date', endDate,
  ], { cwd: ROOT, encoding: 'utf8' });
}

async function text(filePath) {
  return readFile(filePath, 'utf8');
}

describe('Top Stories pilot diagnostic rollup CLI and workflow', () => {
  it('applies exact date bounds and writes byte-stable diagnostic outputs', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'nw-pilot-rollup-'));
    const input = path.join(root, 'input');
    for (const date of ['2026-07-16', '2026-07-17', '2026-07-18']) {
      await writeDay(input, date);
    }
    const outputA = path.join(root, 'a');
    const outputB = path.join(root, 'b');
    expect(runCli(input, outputA, '2026-07-17', '2026-07-18').status).toBe(0);
    expect(runCli(input, outputB, '2026-07-17', '2026-07-18').status).toBe(0);
    for (const name of ['pilot_rollup.json', 'pilot_rollup.md', 'pilot_manifest.json']) {
      expect(await text(path.join(outputA, name))).toBe(await text(path.join(outputB, name)));
    }
    const rollup = JSON.parse(await text(path.join(outputA, 'pilot_rollup.json')));
    const manifest = JSON.parse(await text(path.join(outputA, 'pilot_manifest.json')));
    expect(rollup.decision).toBe('INSUFFICIENT');
    expect(rollup.includedDates).toEqual(['2026-07-17', '2026-07-18']);
    expect(rollup).toMatchObject({
      diagnosticOnly: true,
      decisionAuthority: false,
      governingWorkflow: 'top_stories_shadow_pilot_decision.yml',
    });
    expect(manifest).toMatchObject({
      diagnosticResult: 'INSUFFICIENT',
      diagnosticOnly: true,
      decisionAuthority: false,
      governingWorkflow: 'top_stories_shadow_pilot_decision.yml',
      requestedRange: {
        startDate: '2026-07-17',
        endDate: '2026-07-18',
      },
    });
  });

  it('rejects inverted date ranges', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'nw-pilot-range-'));
    await mkdir(path.join(root, 'input'));
    const result = runCli(
      path.join(root, 'input'),
      path.join(root, 'output'),
      '2026-07-18',
      '2026-07-17',
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('--start-date cannot be after --end-date');
  });

  it('keeps the rollup manual-only and the fixed-window decision as sole schedule authority', async () => {
    const workflow = await text(WORKFLOW);
    const authority = await text(AUTHORITY_WORKFLOW);
    expect(workflow).toContain('Top Stories Shadow Pilot Rollup Diagnostic');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toContain('schedule:');
    expect(workflow).not.toContain('cron:');
    expect(workflow).toContain('start_date:');
    expect(workflow).toContain('end_date:');
    expect(workflow).toContain('contents: read');
    expect(workflow).toContain('actions: read');
    expect(workflow).not.toContain('contents: write');
    expect(workflow).not.toContain('git push');
    expect(workflow).toContain('top_stories_shadow_aggregate.yml');
    expect(workflow).toContain('top_stories_shadow_validate_24h.yml');
    expect(workflow).toContain('gh run download');
    expect(workflow).toContain('non-authoritative diagnostic rollup');
    expect(workflow).toContain('actions/upload-artifact@v4');
    expect(workflow).not.toMatch(/rss|feedUrl|public\/newsdata/i);

    expect(authority).toContain("cron: '47 3 * * *'");
    expect(authority).toContain('pilotStartDate');
    expect(authority).toContain('pilotWindowDays');
    expect(authority).toContain('build_top_stories_pilot_decision.mjs');
  });
});
