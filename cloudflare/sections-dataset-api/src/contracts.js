export const SECTIONS_SHADOW_SNAPSHOT_SCHEMA = 'nw-sections-shadow-snapshot/v1';
export const SECTIONS_SHADOW_POINTER_NAME = 'sections-shadow-current';

export const SOURCE_RUN_STATES = Object.freeze({
  RUNNING: 'RUNNING',
  COMPLETE: 'COMPLETE',
  FAILED: 'FAILED',
});

export const SNAPSHOT_STATES = Object.freeze({
  STAGED: 'STAGED',
  COMMITTED: 'COMMITTED',
  FAILED: 'FAILED',
});

export const SOURCE_FETCH_STATES = Object.freeze([
  'OK',
  'EMPTY',
  'TIMEOUT',
  'HTTP_ERROR',
  'PARSE_ERROR',
  'POLICY_BLOCKED',
]);

const SHA256_RE = /^[0-9a-f]{64}$/i;

export class SectionsShadowStoreError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'SectionsShadowStoreError';
    this.code = code;
    this.details = details;
  }
}

export function requireText(value, field) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    throw new SectionsShadowStoreError(
      'shadow_field_missing',
      `Sections shadow requires ${field}`,
      { field },
    );
  }
  return text;
}

export function requireSha256(value, field) {
  const text = requireText(value, field).toLowerCase();
  if (!SHA256_RE.test(text)) {
    throw new SectionsShadowStoreError(
      'shadow_digest_invalid',
      `Sections shadow requires SHA-256 ${field}`,
      { field },
    );
  }
  return text;
}

export function requireNonNegativeInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new SectionsShadowStoreError(
      'shadow_integer_invalid',
      `${field} must be a non-negative integer`,
      { field, value },
    );
  }
  return number;
}

export function requirePositiveInteger(value, field) {
  const number = requireNonNegativeInteger(value, field);
  if (number < 1) {
    throw new SectionsShadowStoreError(
      'shadow_integer_invalid',
      `${field} must be greater than zero`,
      { field, value },
    );
  }
  return number;
}

export function normalizeSourceRun(input = {}) {
  const state = input.state || SOURCE_RUN_STATES.RUNNING;
  if (!Object.values(SOURCE_RUN_STATES).includes(state)) {
    throw new SectionsShadowStoreError('source_run_state_invalid', `Unsupported run state ${state}`);
  }
  return Object.freeze({
    runId: requireText(input.runId, 'runId'),
    scheduledAt: requireText(input.scheduledAt, 'scheduledAt'),
    acquisitionStartedAt: requireText(input.acquisitionStartedAt, 'acquisitionStartedAt'),
    acquisitionCompletedAt: input.acquisitionCompletedAt || null,
    codeCommitSha: requireText(input.codeCommitSha, 'codeCommitSha'),
    sourceRegistryVersion: requireText(input.sourceRegistryVersion, 'sourceRegistryVersion'),
    sourceRegistryDigest: requireSha256(input.sourceRegistryDigest, 'sourceRegistryDigest'),
    inputEvidenceDigest: input.inputEvidenceDigest
      ? requireSha256(input.inputEvidenceDigest, 'inputEvidenceDigest')
      : null,
    state,
    failureReason: input.failureReason || null,
  });
}

export function normalizeSnapshot(input = {}) {
  const state = input.state || SNAPSHOT_STATES.STAGED;
  if (!Object.values(SNAPSHOT_STATES).includes(state)) {
    throw new SectionsShadowStoreError('snapshot_state_invalid', `Unsupported snapshot state ${state}`);
  }
  return Object.freeze({
    snapshotId: requireText(input.snapshotId, 'snapshotId'),
    runId: requireText(input.runId, 'runId'),
    snapshotSchemaVersion: requireText(
      input.snapshotSchemaVersion || SECTIONS_SHADOW_SNAPSHOT_SCHEMA,
      'snapshotSchemaVersion',
    ),
    createdAt: requireText(input.createdAt, 'createdAt'),
    sourceRegistryVersion: requireText(input.sourceRegistryVersion, 'sourceRegistryVersion'),
    sourceRegistryDigest: requireSha256(input.sourceRegistryDigest, 'sourceRegistryDigest'),
    sourceIdentityVersion: requireText(input.sourceIdentityVersion, 'sourceIdentityVersion'),
    normalizationVersion: requireText(input.normalizationVersion, 'normalizationVersion'),
    normalizationDigest: requireSha256(input.normalizationDigest, 'normalizationDigest'),
    eventClassifierVersion: requireText(input.eventClassifierVersion, 'eventClassifierVersion'),
    rankerVersion: requireText(input.rankerVersion, 'rankerVersion'),
    rankerPolicyDigest: requireSha256(input.rankerPolicyDigest, 'rankerPolicyDigest'),
    inputEvidenceDigest: requireSha256(input.inputEvidenceDigest, 'inputEvidenceDigest'),
    decisionOutputDigest: requireSha256(input.decisionOutputDigest, 'decisionOutputDigest'),
    expectedSectionCount: requirePositiveInteger(input.expectedSectionCount, 'expectedSectionCount'),
    expectedItemCount: requireNonNegativeInteger(input.expectedItemCount, 'expectedItemCount'),
    expectedPartitionDigest: requireSha256(input.expectedPartitionDigest, 'expectedPartitionDigest'),
    expectedItemRowsDigest: requireSha256(input.expectedItemRowsDigest, 'expectedItemRowsDigest'),
    state,
    failureReason: input.failureReason || null,
  });
}

export function normalizeSnapshotPartition(snapshotId, partition = {}) {
  return Object.freeze({
    snapshotId: requireText(snapshotId, 'snapshotId'),
    sectionKey: requireText(partition.sectionKey, 'sectionKey'),
    expectedItemCount: requireNonNegativeInteger(
      partition.expectedItemCount,
      'partition.expectedItemCount',
    ),
  });
}

export function normalizeSnapshotItem(snapshotId, item = {}) {
  return Object.freeze({
    snapshotId: requireText(snapshotId, 'snapshotId'),
    sectionKey: requireText(item.sectionKey, 'sectionKey'),
    position: requireNonNegativeInteger(item.position, 'position'),
    storyId: requireText(item.storyId, 'storyId'),
    sourceFamily: requireText(item.sourceFamily, 'sourceFamily'),
    storyJson: requireText(item.storyJson, 'storyJson'),
  });
}

export function resultChanges(result) {
  const meta = result?.meta || {};
  const value = meta.changes ?? meta.rows_written ?? meta.rowsWritten ?? 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
