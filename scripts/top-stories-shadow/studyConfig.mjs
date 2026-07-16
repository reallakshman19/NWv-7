const REQUIRED_STRINGS = [
  'schemaVersion',
  'studyId',
  'observationMode',
  'runnerVersion',
  'rankerVersion',
  'identityVersion',
  'periodClassifierVersion',
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

function assertMode(config) {
  if (config.observationMode !== 'repository-snapshot-replay') {
    throw new StudyConfigurationError(
      'unsupported_observation_mode',
      'Only repository-snapshot-replay is permitted in NW-RANK-011C',
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
  assertMode(config);
  assertExpiry(config, Number(options.nowMs));
  return deepFreeze({ ...config });
}
