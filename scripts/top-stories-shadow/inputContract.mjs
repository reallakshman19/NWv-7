const COMPLETENESS_STATES = new Set([
  'COMPLETE',
  'PARTIAL_INPUT',
  'PARTIAL_TRACE',
  'FAILED',
]);

const ANALYTICAL_STATES = new Set([
  'ELIGIBLE',
  'IDENTITY_UNCERTAIN',
  'PERIOD_UNCERTAIN',
  'INPUT_CHANGED_UNINTERPRETABLE',
  'INELIGIBLE',
]);

const STORY_FIELDS = [
  'id', 'rowId', 'canonicalId', 'clusterId', 'title', 'url', 'link',
  'source', 'sourceGroup', 'sourceFamily', 'section', 'sourceSection',
  'country', 'geography', 'location', 'publishedAt', 'updatedAt',
  'timestampConfidence', 'sourceCount', 'clusteredItems', 'allSources',
  '_topStoryRank', '_studyIdentity',
];

const SENSITIVE_KEYS = new Set([
  'apikey', 'authorization', 'body', 'content', 'cookie', 'html', 'password',
  'personalisation', 'personalization', 'readstate', 'secret', 'token',
  'userid', 'viewed',
]);

export class RepositoryReplayInputError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RepositoryReplayInputError';
    this.code = code;
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertTimestamp(value, field) {
  if (!Number.isFinite(Date.parse(value))) {
    throw new RepositoryReplayInputError(
      'invalid_repository_snapshot_input',
      `${field} must be a valid timestamp`,
    );
  }
}

function assertInputSource(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new RepositoryReplayInputError(
      'invalid_repository_snapshot_input',
      'inputSource is required',
    );
  }
  if (!value.startsWith('repository-')) {
    throw new RepositoryReplayInputError(
      'unsupported_repository_snapshot_source',
      'inputSource must identify an explicit repository snapshot source',
    );
  }
}

export function validateRepositoryReplayInput(inputBundle) {
  if (!isObject(inputBundle)) {
    throw new RepositoryReplayInputError(
      'missing_repository_snapshot_input',
      'Repository replay input bundle is required',
    );
  }
  if (!isObject(inputBundle.sectionItems) && !Array.isArray(inputBundle.sectionItems)) {
    throw new RepositoryReplayInputError(
      'invalid_repository_snapshot_input',
      'sectionItems must be an object or array',
    );
  }
  if (!Array.isArray(inputBundle.topFeedItems)) {
    throw new RepositoryReplayInputError(
      'invalid_repository_snapshot_input',
      'topFeedItems must be an array',
    );
  }
  if (!isObject(inputBundle.settings) || !isObject(inputBundle.sourceHealth)) {
    throw new RepositoryReplayInputError(
      'invalid_repository_snapshot_input',
      'settings and sourceHealth objects are required',
    );
  }
  assertInputSource(inputBundle.inputSource);
  assertTimestamp(inputBundle.inputSnapshotGeneratedAt, 'inputSnapshotGeneratedAt');
  return inputBundle;
}

function sanitizeValue(value) {
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (!isObject(value)) return value;
  return Object.keys(value).sort().reduce((result, key) => {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) return result;
    return { ...result, [key]: sanitizeValue(value[key]) };
  }, {});
}

export function sanitizeStoryEvidence(story = {}) {
  return STORY_FIELDS.reduce((result, field) => {
    if (story[field] === undefined) return result;
    return { ...result, [field]: sanitizeValue(story[field]) };
  }, {});
}

export function sanitizeObservationEvidence(value) {
  return sanitizeValue(value);
}

export function deriveObservationStates(inputBundle = {}) {
  const requestedCompleteness = inputBundle.completenessState;
  const completenessState = COMPLETENESS_STATES.has(requestedCompleteness)
    ? requestedCompleteness
    : inputBundle.sourceHealth?.complete === false
      ? 'PARTIAL_INPUT'
      : 'COMPLETE';
  const requestedEligibility = inputBundle.analyticalEligibility;
  if (ANALYTICAL_STATES.has(requestedEligibility)) {
    return { completenessState, analyticalEligibility: requestedEligibility };
  }
  if (completenessState !== 'COMPLETE') {
    return { completenessState, analyticalEligibility: 'INELIGIBLE' };
  }
  return {
    completenessState,
    analyticalEligibility: inputBundle.sourceHealth?.ok === false
      ? 'INPUT_CHANGED_UNINTERPRETABLE'
      : 'ELIGIBLE',
  };
}
