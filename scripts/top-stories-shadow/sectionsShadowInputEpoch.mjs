import {
  canonicalizeJson,
  digestCanonicalJson,
  VOLATILE_INPUT_KEYS,
} from './canonicalJson.mjs';
import { sanitizeObservationEvidence } from './inputContract.mjs';

export const SECTIONS_SHADOW_INPUT_EPOCH_SCHEMA =
  'nw-sections-shadow-input-epoch/v1';

const SHA256_PATTERN = /^[0-9a-f]{64}$/i;

export class SectionsShadowInputError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SectionsShadowInputError';
    this.code = code;
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requiredText(value, field) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    throw new SectionsShadowInputError(
      'input_epoch_field_missing',
      `Frozen input epoch requires string ${field}`,
    );
  }
  return text;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function replayPayload(epoch = {}) {
  return {
    sectionItems: epoch.sectionItems || {},
    topFeedItems: epoch.topFeedItems || [],
    settings: epoch.settings || {},
    sourceHealth: epoch.sourceHealth || {},
  };
}

function canonicalizeRow(row) {
  return canonicalizeJson(row, {
    omitKeys: VOLATILE_INPUT_KEYS,
    sortArrays: true,
  });
}

function buildOrderedSectionEvidence(sectionItems = {}) {
  return Object.entries(sectionItems).map(([section, rows]) => ({
    section,
    rows: (Array.isArray(rows) ? rows : []).map(canonicalizeRow),
  }));
}

function buildOrderedTopFeedEvidence(topFeedItems = []) {
  return (Array.isArray(topFeedItems) ? topFeedItems : []).map(canonicalizeRow);
}

function assertSanitizedEvidence(epoch) {
  const raw = replayPayload(epoch);
  const sanitized = sanitizeObservationEvidence(raw);
  if (digestCanonicalJson(raw) !== digestCanonicalJson(sanitized)) {
    throw new SectionsShadowInputError(
      'input_epoch_sensitive_evidence',
      'Frozen input epoch contains evidence fields excluded by replay sanitization',
    );
  }
  return sanitized;
}

export function buildSectionsShadowInputEvidenceValue(epoch = {}) {
  const sanitized = sanitizeObservationEvidence(replayPayload(epoch));
  return {
    sectionSequence: buildOrderedSectionEvidence(sanitized.sectionItems),
    topFeedSequence: buildOrderedTopFeedEvidence(sanitized.topFeedItems),
    settings: canonicalizeJson(sanitized.settings, {
      omitKeys: VOLATILE_INPUT_KEYS,
      sortArrays: true,
    }),
    sourceHealth: canonicalizeJson(sanitized.sourceHealth, {
      omitKeys: VOLATILE_INPUT_KEYS,
      sortArrays: true,
    }),
  };
}

export function getSectionsShadowInputEvidenceDigest(epoch = {}) {
  return digestCanonicalJson(buildSectionsShadowInputEvidenceValue(epoch));
}

function assertTimestamp(value, field) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new SectionsShadowInputError(
      'input_epoch_timestamp_invalid',
      `Frozen input epoch requires valid string ${field}`,
    );
  }
}

function assertDigest(value, field) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new SectionsShadowInputError(
      'input_epoch_digest_invalid',
      `Frozen input epoch requires SHA-256 ${field}`,
    );
  }
}

function validateShape(epoch) {
  if (!isRecord(epoch)) {
    throw new SectionsShadowInputError(
      'input_epoch_missing',
      'Frozen input epoch object is required',
    );
  }
  if (epoch.schemaVersion !== SECTIONS_SHADOW_INPUT_EPOCH_SCHEMA) {
    throw new SectionsShadowInputError(
      'input_epoch_schema_unsupported',
      `Unsupported frozen input schema ${epoch.schemaVersion}`,
    );
  }
  if (typeof epoch.nowMs !== 'number' ||
      !Number.isFinite(epoch.nowMs) ||
      epoch.nowMs < 0) {
    throw new SectionsShadowInputError(
      'input_epoch_clock_invalid',
      'Frozen input epoch requires finite non-negative numeric nowMs',
    );
  }
  assertTimestamp(epoch.capturedAt, 'capturedAt');
  requiredText(epoch.sourceRegistryVersion, 'sourceRegistryVersion');
  assertDigest(epoch.sourceRegistryDigest, 'sourceRegistryDigest');
  const inputSource = requiredText(epoch.inputSource, 'inputSource');
  if (!inputSource.startsWith('frozen-replay-fixture/')) {
    throw new SectionsShadowInputError(
      'input_epoch_source_invalid',
      'Frozen replay inputSource must use frozen-replay-fixture/<id>',
    );
  }
  if (!isRecord(epoch.sectionItems)) {
    throw new SectionsShadowInputError(
      'input_epoch_sections_invalid',
      'Frozen input epoch sectionItems must be an object',
    );
  }
  if (!Array.isArray(epoch.topFeedItems)) {
    throw new SectionsShadowInputError(
      'input_epoch_top_feed_invalid',
      'Frozen input epoch topFeedItems must be an array',
    );
  }
  if (!isRecord(epoch.settings) || !isRecord(epoch.sourceHealth)) {
    throw new SectionsShadowInputError(
      'input_epoch_context_invalid',
      'Frozen input epoch settings and sourceHealth must be objects',
    );
  }
  if (epoch.frozenBeforeShadowObservation !== true ||
      epoch.shadowOutputUsedToChooseExpected !== false) {
    throw new SectionsShadowInputError(
      'input_epoch_anti_circularity_invalid',
      'Frozen input epoch must prove benchmark anti-circularity',
    );
  }
  assertSanitizedEvidence(epoch);
  assertDigest(epoch.inputEvidenceDigest, 'inputEvidenceDigest');
}

function assertRegistryBoundary(epoch, expectedRegistry) {
  if (!expectedRegistry) return;
  if (epoch.sourceRegistryVersion !== expectedRegistry.sourceRegistryVersion) {
    throw new SectionsShadowInputError(
      'input_epoch_registry_version_mismatch',
      'Frozen input source registry version does not match expected authority',
    );
  }
  if (epoch.sourceRegistryDigest.toLowerCase() !==
      expectedRegistry.sourceRegistryDigest.toLowerCase()) {
    throw new SectionsShadowInputError(
      'input_epoch_registry_digest_mismatch',
      'Frozen input source registry digest does not match expected authority',
    );
  }
}

export function validateSectionsShadowInputEpoch(epoch, options = {}) {
  validateShape(epoch);
  const actualDigest = getSectionsShadowInputEvidenceDigest(epoch);
  if (actualDigest !== epoch.inputEvidenceDigest.toLowerCase()) {
    throw new SectionsShadowInputError(
      'input_epoch_evidence_digest_mismatch',
      'Frozen input evidence digest does not match canonical evidence',
    );
  }
  assertRegistryBoundary(epoch, options.expectedRegistryAuthority);
  return deepFreeze(cloneJson(epoch));
}

export function createSectionsShadowInputEpoch(input = {}, options = {}) {
  const epoch = {
    ...cloneJson(input),
    schemaVersion: SECTIONS_SHADOW_INPUT_EPOCH_SCHEMA,
  };
  assertSanitizedEvidence(epoch);
  epoch.inputEvidenceDigest = getSectionsShadowInputEvidenceDigest(epoch);
  return validateSectionsShadowInputEpoch(epoch, options);
}
