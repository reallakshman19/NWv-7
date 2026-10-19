import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PAGES_DEPLOYMENT_PROVENANCE_SCHEMA,
  PAGES_CI_VERIFIED_SOURCE_MODE,
  PAGES_SOURCE_RESOLUTION_MODES,
  buildPagesDeploymentProvenance,
  PAGES_TRACKED_FILE_NAMES,
  resolvePagesDeploymentSource,
  sha256Bytes,
  validatePagesDeploymentProvenance,
} from '../../../scripts/pagesDeploymentProvenance.mjs';
import {
  buildPagesDataManifest,
  buildPagesTrackedFileRecord,
} from '../../../scripts/write_pages_data_manifest.mjs';

const SOURCE_SHA = 'b'.repeat(40);
const UPSTREAM_SHA = 'a'.repeat(40);
const EVENT_SHA = 'c'.repeat(40);
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
    githubSha: EVENT_SHA,
    sourceSha: SOURCE_SHA,
    checkedOutSha: SOURCE_SHA,
    sourceResolutionMode:
      PAGES_SOURCE_RESOLUTION_MODES.workflow_run,
    deployWorkflowRunId: '200',
    deployWorkflowRunAttempt: '2',
    frozenAt: FROZEN_AT,
    workflowRun: {
      workflowName: 'News Prefetch',
      runId: '100',
      runAttempt: '3',
      headSha: UPSTREAM_SHA,
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

function occurrences(text, value) {
  return text.split(value).length - 1;
}

describe('Pages deployment provenance authority', () => {
  it('separates workflow antecedent SHA from the frozen checkout source', () => {
    expect(resolvePagesDeploymentSource(workflowRunContext())).toBe(SOURCE_SHA);
    expect(SOURCE_SHA).not.toBe(UPSTREAM_SHA);
    expect(resolvePagesDeploymentSource({
      triggerEvent: 'push',
      githubSha: SOURCE_SHA,
    })).toBe(SOURCE_SHA);
    expect(resolvePagesDeploymentSource({
      triggerEvent: 'workflow_dispatch',
      githubSha: SOURCE_SHA,
    })).toBe(SOURCE_SHA);
    expect(() => resolvePagesDeploymentSource({
      triggerEvent: 'workflow_run',
      checkedOutSha: SOURCE_SHA,
      workflowRun: {},
    })).toThrow(/workflow_run_upstream_sha_invalid/);
    expect(() => resolvePagesDeploymentSource({
      triggerEvent: 'workflow_run',
      workflowRun: { headSha: UPSTREAM_SHA },
    })).toThrow(/checked_out_sha_invalid/);
  });

  it('uses exact CI-approved upstream SHA and rejects mismatched or failed upstream runs', () => {
    const ciContext = {
      ...workflowRunContext(),
      sourceResolutionMode: PAGES_CI_VERIFIED_SOURCE_MODE,
      workflowRun: {
        ...workflowRunContext().workflowRun,
        workflowName: 'CI Validation Gate',
        headSha: SOURCE_SHA,
      },
    };
    const provenance = buildPagesDeploymentProvenance(ciContext);
    expect(resolvePagesDeploymentSource(ciContext)).toBe(SOURCE_SHA);
    expect(provenance.sourceResolutionMode).toBe(PAGES_CI_VERIFIED_SOURCE_MODE);
    expect(provenance.sourceSha).toBe(provenance.upstreamHeadSha);
    expect(provenance.sourceCheckoutMatched).toBe(true);

    expect(() => buildPagesDeploymentProvenance({
      ...ciContext,
      sourceSha: EVENT_SHA,
    })).toThrow(/sourceSha does not match its event authority/);
    expect(() => buildPagesDeploymentProvenance({
      ...ciContext,
      checkedOutSha: UPSTREAM_SHA,
    })).toThrow(/source_checkout_mismatch/);
    expect(() => buildPagesDeploymentProvenance({
      ...ciContext,
      workflowRun: { ...ciContext.workflowRun, conclusion: 'failure' },
    })).toThrow(/ci_upstream_not_successful/);

    // Legacy data-refresh runs are not tied to the producer's starting SHA:
    // producers may commit new data before they finish.
    expect(resolvePagesDeploymentSource(workflowRunContext())).toBe(SOURCE_SHA);
    expect(workflowRunContext().workflowRun.headSha).toBe(UPSTREAM_SHA);
  });

  it('preserves the v1 manifest and records resolution mode', () => {
    const manifest = buildFixture();
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.manifestVersion).toBe('pages-data-publish-v1');
    expect(manifest.generatedAt).toBe(FROZEN_AT);
    expect(manifest.provenance.schemaVersion)
      .toBe(PAGES_DEPLOYMENT_PROVENANCE_SCHEMA);
    expect(manifest.provenance.sourceSha).toBe(SOURCE_SHA);
    expect(manifest.provenance.upstreamHeadSha).toBe(UPSTREAM_SHA);
    expect(manifest.provenance.sourceResolutionMode)
      .toBe(PAGES_SOURCE_RESOLUTION_MODES.workflow_run);
    expect(manifest.provenance.sourceCheckoutMatched).toBe(true);
    expect(manifest.allTrackedFilesMatched).toBe(true);
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
    expect(() => buildPagesDataManifest({ sourceDir, distDir })).toThrow();
  });

  it('reports specific independent corruption reason classes', () => {
    const source = buildFixture();
    const sourceMismatch = structuredClone(source);
    sourceMismatch.provenance.sourceSha = EVENT_SHA;
    expect(reasonCodes(sourceMismatch)).toContain('expected_source_sha_mismatch');

    const checkoutMismatch = structuredClone(source);
    checkoutMismatch.provenance.checkedOutSha = EVENT_SHA;
    expect(reasonCodes(checkoutMismatch)).toContain('source_checkout_mismatch');

    const upstreamInvalid = structuredClone(source);
    upstreamInvalid.provenance.upstreamHeadSha = 'main';
    expect(reasonCodes(upstreamInvalid))
      .toContain('workflow_run_upstream_sha_invalid');

    const modeInvalid = structuredClone(source);
    modeInvalid.provenance.sourceResolutionMode = 'workflow-run-head-sha';
    expect(reasonCodes(modeInvalid)).toContain('source_resolution_mode_invalid');

    const schemaMismatch = structuredClone(source);
    schemaMismatch.provenance.schemaVersion = 'unsupported/v9';
    expect(reasonCodes(schemaMismatch))
      .toContain('provenance_schema_unsupported');

    const hashMismatch = structuredClone(source);
    hashMismatch.files[0].distSha256 = 'd'.repeat(64);
    expect(reasonCodes(hashMismatch)).toContain('tracked_file_hash_mismatch');

    const matchedMismatch = structuredClone(source);
    matchedMismatch.files[0].matched = false;
    expect(reasonCodes(matchedMismatch)).toContain('tracked_file_hash_mismatch');

    const missingDist = structuredClone(source);
    missingDist.files[0].distExists = false;
    expect(reasonCodes(missingDist)).toContain('tracked_file_missing');
  });

  it.skipIf(!fs.existsSync(path.join(ROOT, '.github/workflows/deploy.yml')))('freezes one checkout and targets status at its observed SHA', () => {
    const workflow = fs.readFileSync(
      path.join(ROOT, '.github/workflows/deploy.yml'),
      'utf8',
    );
    const resolve = workflow.indexOf('Resolve deployment checkout authority');
    const checkout = workflow.indexOf('Checkout deployment source once');
    const proof = workflow.indexOf('git rev-parse HEAD');
    const build = workflow.indexOf('npm run build');
    const manifest = workflow.indexOf('node scripts/write_pages_data_manifest.mjs');
    const upload = workflow.indexOf('actions/upload-pages-artifact@v3');
    expect(resolve).toBeGreaterThanOrEqual(0);
    expect(resolve).toBeLessThan(checkout);
    expect(checkout).toBeLessThan(proof);
    expect(proof).toBeLessThan(build);
    expect(build).toBeLessThan(manifest);
    expect(manifest).toBeLessThan(upload);
    expect(workflow).toContain('checkout_ref="$DEFAULT_BRANCH"');
    expect(workflow).toContain('checkout_ref="$upstream_head_sha"');
    expect(workflow).toContain('source_resolution_mode="workflow-run-ci-verified-sha"');
    expect(workflow).toContain('Reject superseded CI release source');
    expect(workflow).toContain('CI Validation Gate');
    expect(workflow).not.toMatch(/^ {2}push:$/m);
    expect(workflow).toContain('ref: ${{ steps.source.outputs.checkout_ref }}');
    expect(workflow).toContain('echo "source_sha=$checked_out_sha"');
    expect(workflow).toContain(
      'source_sha: ${{ steps.checkout.outputs.source_sha }}',
    );
    expect(workflow).not.toContain('source_sha="$UPSTREAM_HEAD_SHA"');
    expect(occurrences(
      workflow,
      'github.event.repository.default_branch',
    )).toBe(1);
    expect(workflow.slice(proof)).not.toContain(
      'github.event.repository.default_branch',
    );
    expect(workflow).toContain(
      'EXPECTED_SOURCE_SHA: ${{ needs.build.outputs.source_sha }}',
    );
    expect(workflow).toContain('deployment/pages-provenance');
    expect(workflow).toContain('statuses/$SOURCE_SHA');
    expect(workflow).toContain('verify-world-health:');
  });

  it.skipIf(!fs.existsSync(path.join(ROOT, '.github/workflows/top_stories_shadow.yml')))('keeps repository replay separate and uses no browser runtime', () => {
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
    expect(authority).not.toContain('sourceSha must equal upstreamHeadSha');
    expect(verifier.toLowerCase()).not.toContain('playwright');
  });
});
