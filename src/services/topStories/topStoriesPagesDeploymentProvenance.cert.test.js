import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PAGES_DEPLOYMENT_PROVENANCE_SCHEMA,
  PAGES_TRACKED_FILE_NAMES,
  resolvePagesDeploymentSource,
  sha256Bytes,
  validatePagesDeploymentProvenance,
} from '../../../scripts/pagesDeploymentProvenance.mjs';
import {
  buildPagesDataManifest,
  buildPagesTrackedFileRecord,
} from '../../../scripts/write_pages_data_manifest.mjs';

const SOURCE_SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const FROZEN_AT = '2026-07-21T01:00:00.000Z';
const ROOT = process.cwd();

function writeTrackedFiles(sourceDir, distDir) {
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.mkdirSync(distDir, { recursive: true });
  for (const name of PAGES_TRACKED_FILE_NAMES) {
    const bytes = name.endsWith('.json')
      ? Buffer.from(`{"name":"${name}"}\n`)
      : Buffer.from(`summary:${name}\n`);
    fs.writeFileSync(path.join(sourceDir, name), bytes);
    fs.writeFileSync(path.join(distDir, name), bytes);
  }
}

function workflowRunContext() {
  return {
    triggerEvent: 'workflow_run',
    githubSha: OTHER_SHA,
    sourceSha: SOURCE_SHA,
    checkedOutSha: SOURCE_SHA,
    deployWorkflowRunId: '200',
    deployWorkflowRunAttempt: '2',
    frozenAt: FROZEN_AT,
    workflowRun: {
      workflowName: 'News Prefetch',
      runId: '100',
      runAttempt: '3',
      headSha: SOURCE_SHA,
      conclusion: 'success',
    },
  };
}

function buildFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pages-provenance-'));
  const sourceDir = path.join(root, 'public/newsdata');
  const distDir = path.join(root, 'dist/newsdata');
  writeTrackedFiles(sourceDir, distDir);
  return buildPagesDataManifest({
    sourceDir,
    distDir,
    provenanceContext: workflowRunContext(),
  });
}

function reasonCodes(manifest) {
  return validatePagesDeploymentProvenance(manifest, {
    expectedSourceSha: SOURCE_SHA,
  }).reasonCodes;
}

function gitBlobSha(text) {
  const prefix = `blob ${Buffer.byteLength(text, 'utf8')}\0`;
  return crypto.createHash('sha1').update(prefix).update(text).digest('hex');
}

describe('Pages deployment provenance authority', () => {
  it('resolves only the immutable source owned by each trigger', () => {
    expect(resolvePagesDeploymentSource({
      triggerEvent: 'workflow_run',
      githubSha: OTHER_SHA,
      workflowRun: { headSha: SOURCE_SHA },
    })).toBe(SOURCE_SHA);
    expect(resolvePagesDeploymentSource({
      triggerEvent: 'push',
      githubSha: SOURCE_SHA,
      workflowRun: { headSha: OTHER_SHA },
    })).toBe(SOURCE_SHA);
    expect(resolvePagesDeploymentSource({
      triggerEvent: 'workflow_dispatch',
      githubSha: SOURCE_SHA,
    })).toBe(SOURCE_SHA);
    expect(() => resolvePagesDeploymentSource({
      triggerEvent: 'workflow_run',
      githubSha: SOURCE_SHA,
      workflowRun: {},
    })).toThrow(/head_sha is required/);
    expect(() => resolvePagesDeploymentSource({
      triggerEvent: 'push',
      githubSha: 'main',
    })).toThrow(/40-character Git SHA/);
  });

  it('preserves the v1 manifest while adding full byte provenance', () => {
    const manifest = buildFixture();
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.manifestVersion).toBe('pages-data-publish-v1');
    expect(manifest.generatedAt).toBe(FROZEN_AT);
    expect(manifest.provenance.schemaVersion)
      .toBe(PAGES_DEPLOYMENT_PROVENANCE_SCHEMA);
    expect(manifest.provenance.sourceCheckoutMatched).toBe(true);
    expect(manifest.allTrackedFilesMatched).toBe(true);
    expect(manifest.files.map(file => file.name)).toEqual(PAGES_TRACKED_FILE_NAMES);
    for (const file of manifest.files) {
      expect(file).toEqual(expect.objectContaining({
        name: expect.any(String),
        sourceExists: true,
        distExists: true,
        sourceHash: expect.any(String),
        distHash: expect.any(String),
        matched: true,
        sourceSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        distSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      }));
      expect(file.sourceHash).toBe(file.sourceSha256.slice(0, 16));
      expect(file.distHash).toBe(file.distSha256.slice(0, 16));
    }
    expect(reasonCodes(manifest)).toEqual([]);
    expect(sha256Bytes(Buffer.from('bytes')))
      .toBe(sha256Bytes(Buffer.from('bytes')));
  });

  it('derives matched from full bytes and rejects missing provenance', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pages-hash-'));
    const sourceDir = path.join(root, 'source');
    const distDir = path.join(root, 'dist');
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'asset.json'), 'source');
    fs.writeFileSync(path.join(distDir, 'asset.json'), 'different');
    const record = buildPagesTrackedFileRecord('asset.json', {
      sourceDir,
      distDir,
    });
    expect(record.sourceHash).toBe(record.sourceSha256.slice(0, 16));
    expect(record.distHash).toBe(record.distSha256.slice(0, 16));
    expect(record.matched).toBe(false);
    expect(() => buildPagesDataManifest({ sourceDir, distDir }))
      .toThrow();
  });

  it('reports specific corruption reason classes', () => {
    const source = buildFixture();
    const sourceMismatch = structuredClone(source);
    sourceMismatch.provenance.sourceSha = OTHER_SHA;
    expect(reasonCodes(sourceMismatch)).toContain('expected_source_sha_mismatch');

    const checkoutMismatch = structuredClone(source);
    checkoutMismatch.provenance.checkedOutSha = OTHER_SHA;
    expect(reasonCodes(checkoutMismatch)).toContain('source_checkout_mismatch');

    const upstreamMismatch = structuredClone(source);
    upstreamMismatch.provenance.upstreamHeadSha = OTHER_SHA;
    expect(reasonCodes(upstreamMismatch))
      .toContain('workflow_run_upstream_sha_mismatch');

    const schemaMismatch = structuredClone(source);
    schemaMismatch.provenance.schemaVersion = 'unsupported/v9';
    expect(reasonCodes(schemaMismatch))
      .toContain('provenance_schema_unsupported');

    const hashMismatch = structuredClone(source);
    hashMismatch.files[0].distSha256 = 'c'.repeat(64);
    expect(reasonCodes(hashMismatch)).toContain('tracked_file_hash_mismatch');

    const matchedMismatch = structuredClone(source);
    matchedMismatch.files[0].matched = false;
    expect(reasonCodes(matchedMismatch)).toContain('tracked_file_hash_mismatch');

    const missingDist = structuredClone(source);
    missingDist.files[0].distExists = false;
    expect(reasonCodes(missingDist)).toContain('tracked_file_missing');
  });

  it('pins workflow order and the exact post-deploy status target', () => {
    const workflow = fs.readFileSync(
      path.join(ROOT, '.github/workflows/deploy.yml'),
      'utf8',
    );
    const source = workflow.indexOf('Resolve immutable deployment source');
    const checkout = workflow.indexOf('Checkout immutable deployment source');
    const proof = workflow.indexOf('git rev-parse HEAD');
    const build = workflow.indexOf('npm run build');
    const manifest = workflow.indexOf('node scripts/write_pages_data_manifest.mjs');
    const upload = workflow.indexOf('actions/upload-pages-artifact@v3');
    expect(source).toBeGreaterThanOrEqual(0);
    expect(source).toBeLessThan(checkout);
    expect(checkout).toBeLessThan(proof);
    expect(proof).toBeLessThan(build);
    expect(build).toBeLessThan(manifest);
    expect(manifest).toBeLessThan(upload);
    expect(workflow).toContain('ref: ${{ steps.source.outputs.source_sha }}');
    expect(workflow).toContain('needs: [build, deploy]');
    expect(workflow).toContain('EXPECTED_SOURCE_SHA: ${{ needs.build.outputs.source_sha }}');
    expect(workflow).toContain('if: always()');
    expect(workflow).toContain('retention-days: 30');
    expect(workflow).toContain('deployment/pages-provenance');
    expect(workflow).toContain('statuses/$SOURCE_SHA');
    expect(workflow).toContain('verify-world-health:');
    expect(workflow).toContain('verify_world_health_deployment.mjs');
  });

  it('keeps repository replay separate and uses no browser runtime', () => {
    const shadow = fs.readFileSync(
      path.join(ROOT, '.github/workflows/top_stories_shadow.yml'),
      'utf8',
    );
    expect(gitBlobSha(shadow)).toBe('935032864a6a693d2291650ba8a13e8470acf7f3');
    expect(shadow).toContain('Checkout repository snapshot');
    expect(shadow).toContain('Run repository snapshot observation');
    const authority = fs.readFileSync(
      path.join(ROOT, 'scripts/pagesDeploymentProvenance.mjs'),
      'utf8',
    );
    const verifier = fs.readFileSync(
      path.join(ROOT, 'scripts/verify_pages_deployment_provenance.mjs'),
      'utf8',
    );
    for (const forbidden of [
      'topStoriesRanker',
      'src/context',
      'src/viewModels',
      'src/pages',
      'src/components',
    ]) {
      expect(authority).not.toContain(forbidden);
      expect(verifier).not.toContain(forbidden);
    }
    expect(verifier.toLowerCase()).not.toContain('playwright');
  });
});
