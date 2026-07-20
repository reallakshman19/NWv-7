import { TOP_STORIES_IDENTITY_VERSION } from '../../src/services/topStories/topStoriesStudyIdentity.js';
import { TOP_STORIES_PERIOD_CLASSIFIER_VERSION } from '../../src/services/topStories/topStoriesPeriodClassifier.js';
import { TOP_STORIES_NORMALIZATION_VERSION } from '../../src/services/topStories/topStoriesVersionSegment.js';

export const STUDY_CONFIG_SCHEMA_VERSION = 'nw-top-stories-shadow-study/v1';
export const REPOSITORY_INPUT_CONTRACT_VERSION = 'nw-top-stories-repository-input/v1';

const REQUIRED_STRINGS = [
  'schemaVersion',
  'studyId',
  'observationMode',
  'runnerVersion',
  'rankerVersion',
  'identityVersion',
  'periodClassifierVersion',
  'normalizationVersion',
  'inputContractVersion',
  'expiryAt',
  'owner',
  'approver',
];

export class StudyConfigurationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'StudyConfigurationError';
    this.code = code;
  }
}

function assertRequiredStrings(config) {
  REQUIRED_STRINGS.forEach(field => {
    if (typeof config?.[field] !== 'string' || !config[field].trim()) {
      throw new StudyConfigurationError(
        'missing_study_configuration',
        `Study configuration requires non-empty ${field}`,
      );
    }
  });
}

function assertPositiveInteger(config, field) {
  const value = Number(config?.[field]);
  if (!Number.isInteger(value) || value <= 0) {
    throw new StudyConfigurationError(
      'invalid_study_configuration',
      `Study configuration requires positive integer ${field}`,
    );
  }
}

function assertSchemas(config) {
  if (config.schemaVersion !== STUDY_CONFIG_SCHEMA_VERSION) {
    throw new StudyConfigurationError(
      'study_schema_version_mismatch',
      'Unsupported study configuration schemaVersion',
    );
  }
  if (config.inputContractVersion !== REPOSITORY_INPUT_CONTRACT_VERSION) {
    throw new StudyConfigurationError(
      'input_contract_version_mismatch',
      'Unsupported repository inputContractVersion',
    );
  }
}

function assertMode(config) {
  if (config.observationMode !== 'repository-snapshot-replay') {
    throw new StudyConfigurationError(
      'unsupported_observation_mode',
      'Only repository-snapshot-replay is permitted',
    );
  }
}

function assertExecutableVersions(config) {
  const checks = [
    [
      config.identityVersion === TOP_STORIES_IDENTITY_VERSION,
      'identity_version_mismatch',
      'Configured identityVersion does not match the executable identity contract',
    ],
    [
      config.periodClassifierVersion === TOP_STORIES_PERIOD_CLASSIFIER_VERSION,
      'period_classifier_version_mismatch',
      'Configured periodClassifierVersion does not match the executable classifier',
    ],
    [
      config.normalizationVersion === TOP_STORIES_NORMALIZATION_VERSION,
      'normalization_version_mismatch',
      'Configured normalizationVersion does not match the executable normalization contract',
    ],
  ];
  checks.forEach(([passed, code, message]) => {
    if (!passed) throw new StudyConfigurationError(code, message);
  });
}

function assertLimits(config) {
  if (Number(config.displayDepth) > Number(config.rankerLimit)) {
    throw new StudyConfigurationError(
      'invalid_study_configuration',
      'displayDepth cannot exceed rankerLimit',
    );
  }
}

function assertExpiry(config, nowMs) {
  const expiryMs = Date.parse(config.expiryAt);
  if (!Number.isFinite(expiryMs)) {
    throw new StudyConfigurationError(
      'invalid_study_configuration',
      'Study configuration expiryAt must be a valid timestamp',
    );
  }
  if (Number.isFinite(nowMs) && nowMs > expiryMs) {
    throw new StudyConfigurationError(
      'expired_study_configuration',
      'Study configuration has expired',
    );
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

export function validateTopStoriesStudyConfig(config, options = {}) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new StudyConfigurationError(
      'missing_study_configuration',
      'Study configuration object is required',
    );
  }
  assertRequiredStrings(config);
  assertPositiveInteger(config, 'displayDepth');
  assertPositiveInteger(config, 'rankerLimit');
  assertSchemas(config);
  assertMode(config);
  assertExecutableVersions(config);
  assertLimits(config);
  assertExpiry(config, Number(options.nowMs));
  return deepFreeze({ ...config });
}
