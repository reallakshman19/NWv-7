import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { stableJson } from '../../../scripts/top-stories-shadow/canonicalJson.mjs';
import {
  PILOT_CONFIG,
  PILOT_READY_NOW,
} from './fixtures/topStoriesPilotDecisionFixture.js';

const ROOT = process.cwd();
const CLI = path.join(ROOT, 'scripts/build_top_stories_pilot_decision.mjs');

async function writeJson(filePath, value) {
  await writeFile(filePath, `${stableJson(value)}\n`, 'utf8');
}

function runCli(paths, output) {
  return spawnSync(process.execPath, [
    CLI,
    '--input', paths.input,
    '--download-manifest', paths.manifest,
    '--config', paths.config,
    '--output', output,
    '--now', new Date(PILOT_READY_NOW).toISOString(),
  ], { cwd: ROOT, encoding: 'utf8' });
}

async function setup(schemaVersion) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nw-pilot-cli-'));
  const input = path.join(root, 'input');
  const config = path.join(root, 'study.json');
  const manifest = path.join(root, 'pilot_download_manifest.json');
  await mkdir(input);
  await writeJson(config, PILOT_CONFIG);
  await writeJson(manifest, {
    schemaVersion,
    studyId: PILOT_CONFIG.studyId,
    pilotStartDate: PILOT_CONFIG.pilotStartDate,
    pilotWindowDays: PILOT_CONFIG.pilotWindowDays,
    downloaded: [],
    excludedRuns: [],
  });
  return { root, input, config, manifest };
}

async function text(filePath) {
  return readFile(filePath, 'utf8');
}

describe('Top Stories pilot decision CLI', () => {
  it('writes deterministic INSUFFICIENT evidence for an empty valid acquisition', async () => {
    const paths = await setup('nw-top-stories-pilot-download-manifest/v1');
    const outputA = path.join(paths.root, 'a');
    const outputB = path.join(paths.root, 'b');
    expect(runCli(paths, outputA).status).toBe(0);
    expect(runCli(paths, outputB).status).toBe(0);
    for (const name of [
      'pilot_decision.json',
      'pilot_decision.md',
      'pilot_input_manifest.json',
      'pilot_manifest.json',
    ]) {
      expect(await text(path.join(outputB, name))).toBe(await text(path.join(outputA, name)));
    }
    const decision = JSON.parse(await text(path.join(outputA, 'pilot_decision.json')));
    expect(decision.decision).toBe('INSUFFICIENT');
    expect(decision.recommendation).toBe('CONTINUE_OBSERVATION');
    expect(decision.productionChangeAuthorized).toBe(false);
    expect(decision.decisionEvidence).toMatchObject({
      schemaVersion: 'nw-top-stories-comparison-evidence/v1',
      fifteenMinute: { comparisonCount: 0, usableDayCount: 0 },
      sixtyMinute: { comparisonCount: 0, usableDayCount: 0 },
      crossHorizonPooled: false,
      accountingConserved: true,
    });
  });

  it('writes structured FAIL evidence before returning nonzero on schema mismatch', async () => {
    const paths = await setup('unsupported-pilot-schema/v9');
    const output = path.join(paths.root, 'failed');
    expect(runCli(paths, output).status).toBe(1);
    const decision = JSON.parse(await text(path.join(output, 'pilot_decision.json')));
    expect(decision.decision).toBe('FAIL');
    expect(decision.recommendation).toBe('OPERATIONAL_REPAIR_REQUIRED');
    expect(decision.failureReasonCodes).toContain('pilot_download_schema_mismatch');
  });
});
