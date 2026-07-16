import { sha256Text, stableJson } from './canonicalJson.mjs';

export const TOP_STORIES_OPERATIONAL_SCHEMA_VERSION =
  'nw-top-stories-shadow-operational/v1';

function parseManifest(files = {}) {
  if (!files['manifest.json']) return null;
  try {
    return JSON.parse(files['manifest.json']);
  } catch {
    return null;
  }
}

function describePublishedFiles(files = {}) {
  return Object.entries(files)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, text]) => ({
      name,
      byteSize: Buffer.byteLength(text, 'utf8'),
      sha256: sha256Text(text),
    }));
}

export function buildTopStoriesOperationalRecord({
  studyConfig,
  metadata,
  slot,
  adapterInput,
  runResult,
}) {
  const coreManifest = parseManifest(runResult.files);
  const snapshotAgeMs = Number(
    adapterInput?.inputDiagnostics?.snapshotAgeMs,
  );
  return {
    schemaVersion: TOP_STORIES_OPERATIONAL_SCHEMA_VERSION,
    studyId: studyConfig?.studyId || null,
    repositorySha: metadata?.repositorySha || null,
    workflowRunId: String(metadata?.workflowRunId || ''),
    workflowRunAttempt: Number(metadata?.workflowRunAttempt || 0),
    observationMode: studyConfig?.observationMode || null,
    scheduledAt: slot?.scheduledAt || metadata?.scheduledAt || null,
    runAt: slot?.runAt || metadata?.runAt || null,
    scheduleDelaySeconds: slot?.scheduleDelaySeconds ?? null,
    nominalSlotKey: slot?.slotKey || null,
    nominalSlotMethod: slot?.method || null,
    adapterVersion: adapterInput?.inputDiagnostics?.adapterVersion || null,
    adapterState: adapterInput
      ? (adapterInput.sourceHealth?.complete ? 'COMPLETE' : 'PARTIAL')
      : 'FAILED',
    inputSource: adapterInput?.inputSource || null,
    inputSnapshotGeneratedAt: adapterInput?.inputSnapshotGeneratedAt || null,
    inputSnapshotAgeMs: Number.isFinite(snapshotAgeMs) ? snapshotAgeMs : null,
    sourceHealth: adapterInput?.sourceHealth
      ? {
        ok: adapterInput.sourceHealth.ok,
        complete: adapterInput.sourceHealth.complete,
        snapshotStale: adapterInput.sourceHealth.snapshotStale,
        failedSourceCount: adapterInput.sourceHealth.failedSourceCount,
        warningSourceCount: adapterInput.sourceHealth.warningSourceCount,
        missingSections: adapterInput.sourceHealth.missingSections,
      }
      : null,
    observationState: runResult.ok ? 'SNAPSHOT_WRITTEN' : 'FAILURE_WRITTEN',
    observationId: runResult.snapshot?.observationId || null,
    errorCode: runResult.failure?.errorCode || null,
    errorMessage: runResult.failure?.errorMessage || null,
    coreManifestSchemaVersion: coreManifest?.schemaVersion || null,
    publishedFiles: describePublishedFiles(runResult.files),
    crossRunMetricsIncluded: false,
  };
}

export function serializeTopStoriesOperationalRecord(record) {
  return `${stableJson(record)}\n`;
}
