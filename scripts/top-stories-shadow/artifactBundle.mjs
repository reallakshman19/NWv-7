import { stableJson, sha256Text } from './canonicalJson.mjs';
import { buildTopStoriesRunSnapshot } from './snapshotBuilder.mjs';

export const ARTIFACT_MANIFEST_SCHEMA_VERSION = 'nw-top-stories-artifact-manifest/v1';
export const RUN_FAILURE_SCHEMA_VERSION = 'nw-top-stories-run-failure/v1';

function toJsonText(value) {
  return `${stableJson(value)}\n`;
}

function describeFile(name, schemaVersion, text) {
  return {
    name,
    schemaVersion,
    contentType: 'application/json',
    byteSize: Buffer.byteLength(text, 'utf8'),
    sha256: sha256Text(text),
  };
}

function buildManifest(context, fileDescription) {
  return {
    schemaVersion: ARTIFACT_MANIFEST_SCHEMA_VERSION,
    studyId: context.studyId || null,
    observationId: context.observationId || null,
    runAt: context.runAt || null,
    integrityScope: 'accidental-corruption-and-transfer-completeness-only',
    selfHashExcluded: true,
    files: [fileDescription],
  };
}

function bundleFile(name, schemaVersion, value, context) {
  const text = toJsonText(value);
  const manifest = buildManifest(
    context,
    describeFile(name, schemaVersion, text),
  );
  return {
    [name]: text,
    'manifest.json': toJsonText(manifest),
  };
}

export function createSuccessArtifactBundle(snapshot) {
  return {
    ok: true,
    snapshot,
    files: bundleFile(
      'snapshot.json',
      snapshot.schemaVersion,
      snapshot,
      snapshot,
    ),
  };
}

function getFailureContext(args = {}) {
  return {
    studyId: args.studyConfig?.studyId || null,
    observationId: null,
    repositorySha: args.metadata?.repositorySha || null,
    workflowRunId: args.metadata?.workflowRunId || null,
    workflowRunAttempt: args.metadata?.workflowRunAttempt || null,
    scheduledAt: args.metadata?.scheduledAt || null,
    runAt: args.metadata?.runAt || null,
  };
}

export function createFailureArtifactBundle(error, args = {}) {
  const context = getFailureContext(args);
  const failure = {
    schemaVersion: RUN_FAILURE_SCHEMA_VERSION,
    ...context,
    errorName: error?.name || 'Error',
    errorCode: error?.code || 'snapshot_run_failed',
    errorMessage: error?.message || String(error),
  };
  return {
    ok: false,
    failure,
    files: bundleFile(
      'failure.json',
      failure.schemaVersion,
      failure,
      context,
    ),
  };
}

export function createTopStoriesRunArtifacts(args = {}) {
  try {
    return createSuccessArtifactBundle(buildTopStoriesRunSnapshot(args));
  } catch (error) {
    return createFailureArtifactBundle(error, args);
  }
}
