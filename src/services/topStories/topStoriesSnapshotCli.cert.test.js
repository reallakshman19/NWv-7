import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SCRIPT = path.join(ROOT, 'scripts/run_top_stories_shadow_snapshot.mjs');
const CONFIG_PATH = path.join(ROOT, 'config/top_stories_shadow_study.json');
const RUN_AT = '2026-07-16T17:22:00.000Z';
const tempDirs = [];

function createTempDir() {
  const directory = mkdtempSync(path.join(tmpdir(), 'nw-rank-011c-'));
  tempDirs.push(directory);
  return directory;
}

function inputBundle() {
  return {
    sectionItems: {
      world: [{
        id: 'alert-1',
        canonicalId: 'alert-canonical-1',
        title: 'Explosion injures residents near railway station',
        source: 'Trusted Source',
        sourceGroup: 'trusted-source',
        section: 'world',
        publishedAt: Date.parse(RUN_AT) - (20 * 60 * 1000),
        timestampConfidence: 'high',
      }],
    },
    topFeedItems: [],
    settings: {},
    sourceHealth: { ok: true, complete: true },
    inputSource: 'repository-public-newsdata-sections',
    inputSnapshotGeneratedAt: '2026-07-16T17:15:00.000Z',
  };
}

function runCli(configPath, inputPath, outputPath) {
  return spawnSync(process.execPath, [
    SCRIPT,
    '--config', configPath,
    '--input', inputPath,
    '--output', outputPath,
    '--scheduled-at', '2026-07-16T17:07:00.000Z',
    '--run-at', RUN_AT,
    '--repository-sha', 'abc123',
    '--workflow-run-id', 'manual-cli-1',
    '--workflow-run-attempt', '1',
  ], {
    cwd: ROOT,
    encoding: 'utf8',
  });
}

afterEach(() => {
  tempDirs.splice(0).forEach(directory => rmSync(directory, {
    recursive: true,
    force: true,
  }));
});

describe('NW-RANK-011C manual CLI', () => {
  it('writes one successful observation directory', () => {
    const directory = createTempDir();
    const inputPath = path.join(directory, 'input.json');
    const outputPath = path.join(directory, 'observation');
    writeFileSync(inputPath, JSON.stringify(inputBundle()), 'utf8');

    const result = runCli(CONFIG_PATH, inputPath, outputPath);

    expect(result.status).toBe(0);
    expect(existsSync(path.join(outputPath, 'snapshot.json'))).toBe(true);
    expect(existsSync(path.join(outputPath, 'manifest.json'))).toBe(true);
    const snapshot = JSON.parse(readFileSync(
      path.join(outputPath, 'snapshot.json'),
      'utf8',
    ));
    expect(snapshot.observationMode).toBe('repository-snapshot-replay');
    expect(snapshot.workflowRunId).toBe('manual-cli-1');
  });

  it('writes failure.json and exits non-zero for invalid configuration', () => {
    const directory = createTempDir();
    const inputPath = path.join(directory, 'input.json');
    const invalidConfigPath = path.join(directory, 'config.json');
    const outputPath = path.join(directory, 'failed-observation');
    const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    writeFileSync(inputPath, JSON.stringify(inputBundle()), 'utf8');
    writeFileSync(
      invalidConfigPath,
      JSON.stringify({ ...config, studyId: '' }),
      'utf8',
    );

    const result = runCli(invalidConfigPath, inputPath, outputPath);

    expect(result.status).toBe(1);
    expect(existsSync(path.join(outputPath, 'failure.json'))).toBe(true);
    expect(existsSync(path.join(outputPath, 'snapshot.json'))).toBe(false);
    expect(readFileSync(path.join(outputPath, 'failure.json'), 'utf8'))
      .toContain('missing_study_configuration');
  });

  it('contains no live network acquisition path', () => {
    const source = readFileSync(SCRIPT, 'utf8');

    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/https?:\/\//);
    expect(source).not.toMatch(/rssAggregator|fetchSectionNews/);
  });
});
