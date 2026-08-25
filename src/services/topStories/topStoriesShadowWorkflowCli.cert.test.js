import {
  mkdtempSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { sha256Text } from '../../../scripts/top-stories-shadow/canonicalJson.mjs';

const ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);
const WORKFLOW = path.join(ROOT, '.github/workflows/top_stories_shadow.yml');
const RUN_AT = '2026-07-16T18:22:30.000Z';
const RUN_MS = Date.parse(RUN_AT);

function story(section, index) {
  return {
    id: `${section}-${index}`,
    canonicalId: `${section}-canonical-${index}`,
    title: `Public safety alert near station ${section} ${index}`,
    source: `Trusted Source ${index}`,
    sourceGroup: `publisher-${index}`,
    url: `https://example.com/${section}/${index}`,
    publishedAt: RUN_MS - ((index + 1) * 60 * 1000),
    timestampConfidence: 'high',
  };
}

function sectionsSnapshot() {
  return {
    schemaVersion: 2,
    fetchedAt: RUN_MS - (5 * 60 * 1000),
    contentHash: 'publication-fixture',
    sections: {
      world: Array.from({ length: 4 }, (_, index) => story('world', index)),
      india: Array.from({ length: 4 }, (_, index) => story('india', index)),
      tn: Array.from({ length: 4 }, (_, index) => story('tn', index)),
      trichy: Array.from({ length: 4 }, (_, index) => story('trichy', index)),
      muscat: Array.from({ length: 4 }, (_, index) => story('muscat', index)),
    },
  };
}

function writeFixture(dir, name, value) {
  const filePath = path.join(dir, name);
  writeFileSync(filePath, JSON.stringify(value), 'utf8');
  return filePath;
}

function executeShadow({ missingSections = false } = {}) {
  const workDir = mkdtempSync(path.join(tmpdir(), 'nw-rank-011d-'));
  const outputDir = path.join(workDir, 'output');
  const sectionsPath = missingSections
    ? path.join(workDir, 'missing-sections.json')
    : writeFixture(workDir, 'sections.json', sectionsSnapshot());
  const healthPath = writeFixture(workDir, 'source-health.json', {
    lastChecked: RUN_MS - (5 * 60 * 1000),
    sources: { trusted: { ok: true, status: 'ok', items: 20 } },
  });
  const result = spawnSync(process.execPath, [
    'scripts/run_top_stories_repository_shadow.mjs',
    '--config', 'config/top_stories_shadow_study.json',
    '--sections', sectionsPath,
    '--source-health', healthPath,
    '--output', outputDir,
    '--run-at', RUN_AT,
    '--repository-sha', 'fixture-sha',
    '--workflow-run-id', 'fixture-run',
    '--workflow-run-attempt', '1',
  ], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return { result, workDir, outputDir };
}

describe('NW-RANK-011D repository shadow CLI', () => {
  it('writes success evidence and verifiable publication hashes', () => {
    const execution = executeShadow();
    try {
      expect(execution.result.status).toBe(0);
      const names = [
        'snapshot.json',
        'manifest.json',
        'operational.json',
        'publication_manifest.json',
      ];
      names.forEach(name => {
        expect(() => readFileSync(
          path.join(execution.outputDir, name),
          'utf8',
        )).not.toThrow();
      });
      const publication = JSON.parse(readFileSync(
        path.join(execution.outputDir, 'publication_manifest.json'),
        'utf8',
      ));
      publication.files.forEach(file => {
        const content = readFileSync(
          path.join(execution.outputDir, file.name),
          'utf8',
        );
        expect(file.sha256).toBe(sha256Text(content));
        expect(file.byteSize).toBe(Buffer.byteLength(content, 'utf8'));
      });
    } finally {
      rmSync(execution.workDir, { recursive: true, force: true });
    }
  });

  it('writes failure and operational evidence before returning non-zero', () => {
    const execution = executeShadow({ missingSections: true });
    try {
      expect(execution.result.status).not.toBe(0);
      expect(JSON.parse(readFileSync(
        path.join(execution.outputDir, 'failure.json'),
        'utf8',
      )).errorCode).toBeTruthy();
      expect(JSON.parse(readFileSync(
        path.join(execution.outputDir, 'operational.json'),
        'utf8',
      ))).toMatchObject({
        observationState: 'FAILURE_WRITTEN',
        adapterState: 'FAILED',
      });
    } finally {
      rmSync(execution.workDir, { recursive: true, force: true });
    }
  });
});

describe('NW-RANK-011D workflow contract', () => {
  it.skipIf(!existsSync(WORKFLOW))('uses offset scheduling, read-only permissions and unconditional upload', () => {
    const workflow = readFileSync(WORKFLOW, 'utf8');

    expect(workflow).toContain("cron: '7,22,37,52 * * * *'");
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('contents: read');
    expect(workflow).not.toContain('contents: write');
    expect(workflow).not.toContain('cancel-in-progress');
    expect(workflow).not.toMatch(/^concurrency:/m);
    expect(workflow).toContain('actions/upload-artifact@v4');
    expect(workflow).toContain('if: always()');
    expect(workflow).toContain('retention-days: 30');
    expect(workflow).not.toMatch(/git\s+(add|commit|push)/);
    expect(workflow).not.toMatch(/curl|wget|fetchSectionNews|fetch_insight|fetch_sections/);
  });
});
