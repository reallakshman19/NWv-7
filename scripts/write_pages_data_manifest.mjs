import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PAGES_TRACKED_FILE_NAMES,
  buildPagesDeploymentProvenance,
  sha256Bytes,
  validatePagesDeploymentProvenance,
} from './pagesDeploymentProvenance.mjs';

const NEWSDATA_DIR = 'public/newsdata';
const DIST_NEWSDATA_DIR = 'dist/newsdata';
const MANIFEST_NAME = 'pages_data_manifest.json';

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function readBytes(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath) : null;
}

export function buildPagesTrackedFileRecord(name, directories = {}) {
  const sourceDir = directories.sourceDir || NEWSDATA_DIR;
  const distDir = directories.distDir || DIST_NEWSDATA_DIR;
  const sourceBytes = readBytes(path.join(sourceDir, name));
  const distBytes = readBytes(path.join(distDir, name));
  const sourceSha256 = sourceBytes ? sha256Bytes(sourceBytes) : '';
  const distSha256 = distBytes ? sha256Bytes(distBytes) : '';
  return {
    name,
    sourceExists: sourceBytes !== null,
    distExists: distBytes !== null,
    sourceHash: sourceSha256.slice(0, 16),
    distHash: distSha256.slice(0, 16),
    matched: sourceBytes !== null && distBytes !== null &&
      sourceSha256 === distSha256,
    sourceSha256,
    distSha256,
  };
}

function readManifestInputs(sourceDir) {
  return {
    insight: readJson(path.join(sourceDir, 'insight_latest.json'), {}),
    sections: readJson(path.join(sourceDir, 'sections_latest.json'), {}),
    prefetchManifest: readJson(
      path.join(sourceDir, 'prefetch_commit_manifest.json'),
      {},
    ),
    qualityReport: readJson(
      path.join(sourceDir, 'insight_quality_report.json'),
      {},
    ),
  };
}

export function buildPagesDataManifest(options = {}) {
  const sourceDir = options.sourceDir || NEWSDATA_DIR;
  const distDir = options.distDir || DIST_NEWSDATA_DIR;
  const trackedFileNames = options.trackedFileNames || PAGES_TRACKED_FILE_NAMES;
  const provenance = buildPagesDeploymentProvenance(options.provenanceContext);
  const { insight, sections, prefetchManifest, qualityReport } =
    readManifestInputs(sourceDir);
  const files = trackedFileNames.map(name =>
    buildPagesTrackedFileRecord(name, { sourceDir, distDir }));
  const manifest = {
    schemaVersion: 1,
    manifestVersion: 'pages-data-publish-v1',
    generatedAt: provenance.frozenAt,
    provenance,
    insight: {
      schemaVersion: insight.schemaVersion || 0,
      collectorVersion: insight.collectorVersion || '',
      contentHash: insight.contentHash || '',
      storyCount: Array.isArray(insight.stories) ? insight.stories.length : 0,
      fetchedAt: insight.fetchedAt || 0,
    },
    sections: {
      schemaVersion: sections.schemaVersion || 0,
      contentHash: sections.contentHash || '',
    },
    quality: {
      status: qualityReport.status || '',
      storyCount: qualityReport.storyCount || 0,
      sourceGroupCount: qualityReport.sourceGroupCount || 0,
      angleHintCoverage: qualityReport.angleHintCoverage || 0,
    },
    prefetchCommit: {
      shouldCommit: Boolean(prefetchManifest.shouldCommit),
      diagnosticOnly: Boolean(prefetchManifest.diagnosticOnly),
      changedContentFiles: prefetchManifest.changedContentFiles || [],
    },
    files,
    allTrackedFilesMatched: files
      .filter(file => file.sourceExists)
      .every(file => file.distExists && file.matched),
  };
  const validation = validatePagesDeploymentProvenance(manifest, {
    expectedSourceSha: provenance.sourceSha,
    requiredFileNames: trackedFileNames,
  });
  if (!validation.valid) {
    const error = new Error(validation.reasonCodes.join(', '));
    error.code = validation.reasonCodes[0];
    throw error;
  }
  return manifest;
}

export function provenanceContextFromEnv(env = process.env) {
  return {
    triggerEvent: env.PAGES_TRIGGER_EVENT,
    githubSha: env.PAGES_EVENT_SHA,
    sourceSha: env.PAGES_SOURCE_SHA,
    checkedOutSha: env.PAGES_CHECKED_OUT_SHA,
    sourceResolutionMode: env.PAGES_SOURCE_RESOLUTION_MODE,
    deployWorkflowRunId: env.PAGES_DEPLOY_WORKFLOW_RUN_ID,
    deployWorkflowRunAttempt: env.PAGES_DEPLOY_WORKFLOW_RUN_ATTEMPT,
    frozenAt: env.PAGES_FROZEN_AT,
    workflowRun: {
      workflowName: env.PAGES_UPSTREAM_WORKFLOW_NAME,
      runId: env.PAGES_UPSTREAM_WORKFLOW_RUN_ID,
      runAttempt: env.PAGES_UPSTREAM_WORKFLOW_RUN_ATTEMPT,
      headSha: env.PAGES_UPSTREAM_HEAD_SHA,
      conclusion: env.PAGES_UPSTREAM_CONCLUSION,
    },
  };
}

export function writePagesDataManifest(options = {}) {
  const distDir = options.distDir || DIST_NEWSDATA_DIR;
  fs.mkdirSync(distDir, { recursive: true });
  const manifest = buildPagesDataManifest({
    ...options,
    provenanceContext: options.provenanceContext || provenanceContextFromEnv(),
  });
  const manifestPath = options.manifestPath || path.join(distDir, MANIFEST_NAME);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(JSON.stringify({
    status: manifest.allTrackedFilesMatched ? 'PASS' : 'WARN',
    manifestPath,
    insightContentHash: manifest.insight.contentHash,
    sourceSha: manifest.provenance.sourceSha,
    sourceResolutionMode: manifest.provenance.sourceResolutionMode,
    allTrackedFilesMatched: manifest.allTrackedFilesMatched,
  }, null, 2));
  if (!manifest.files.find(file => file.name === 'insight_latest.json')?.distExists) {
    throw new Error('dist/newsdata/insight_latest.json missing after build');
  }
  return manifest;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) writePagesDataManifest();
