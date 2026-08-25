import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const WORKFLOW = path.join(ROOT, '.github/workflows/top_stories_shadow_aggregate.yml');
const DOWNLOADER = path.join(ROOT, 'scripts/download_top_stories_shadow_artifacts.mjs');
const AGGREGATOR = path.join(ROOT, 'scripts/aggregate_top_stories_shadow.mjs');
const STUDY_CONFIG = path.join(ROOT, 'config/top_stories_shadow_study.json');

async function text(filePath) {
  return readFile(filePath, 'utf8');
}

describe('Top Stories shadow aggregation workflow', () => {
  it.skipIf(!existsSync(WORKFLOW))('uses read-only Actions access and artifact-only publication', async () => {
    const workflow = await text(WORKFLOW);
    expect(workflow).toContain("cron: '17 2 * * *'");
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('contents: read');
    expect(workflow).toContain('actions: read');
    expect(workflow).not.toContain('contents: write');
    expect(workflow).not.toContain('cancel-in-progress: true');
    expect(workflow).not.toContain('git push');
    expect(workflow).toContain('actions/upload-artifact@v4');
    expect(workflow).toContain('top_stories_shadow.yml');
    expect(workflow).toContain('config/top_stories_shadow_study.json');
    expect(workflow).toContain("if: always()");
  });

  it('limits acquisition to GitHub Actions APIs', async () => {
    const source = await text(DOWNLOADER);
    expect(source).toContain("const API_ORIGIN = 'https://api.github.com'");
    expect(source).toContain('/actions/workflows/');
    expect(source).toContain('/actions/artifacts/');
    expect(source).not.toMatch(/fetch_(sections|insight)|rssAggregator|feedUrl/i);
    expect(source).not.toContain('public/newsdata');
  });

  it('produces byte-stable empty-day outputs', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'nw-shadow-aggregate-cli-'));
    const input = path.join(root, 'input');
    const outputA = path.join(root, 'output-a');
    const outputB = path.join(root, 'output-b');
    await mkdir(input, { recursive: true });

    const args = [
      AGGREGATOR,
      '--input', input,
      '--config', STUDY_CONFIG,
      '--date', '2026-07-16',
    ];
    execFileSync(process.execPath, [...args, '--output', outputA], { cwd: ROOT });
    execFileSync(process.execPath, [...args, '--output', outputB], { cwd: ROOT });

    for (const name of ['daily_report.json', 'daily_report.md', 'aggregation_manifest.json']) {
      expect(await text(path.join(outputB, name))).toBe(await text(path.join(outputA, name)));
    }
    const report = JSON.parse(await text(path.join(outputA, 'daily_report.json')));
    expect(report.status).toBe('EMPTY');
    expect(report.coverage.scheduledSlots).toBe(96);
  });
});
