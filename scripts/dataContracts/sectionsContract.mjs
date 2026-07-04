import {
  asArray,
  asObject,
  makeResult,
  parseTimestamp,
} from './sharedContractUtils.mjs';

const SUPPORTED_SCHEMAS = new Set([1, 2]);
const REQUIRED_SECTION_KEYS = ['topStories', 'india', 'world'];

function normalizeSections(snapshot) {
  const sections = asObject(snapshot?.sections);
  return Object.fromEntries(
    Object.entries(sections).map(([key, value]) => [key, asArray(value)])
  );
}

function diagnosticCount(snapshot) {
  const quality = asObject(snapshot?.sectionQuality);
  return Object.keys(quality).length + asArray(snapshot?.diagnostics).length;
}

export function validateSectionsContract(snapshot) {
  const errors = [];
  const warnings = [];
  const schema = Number(snapshot?.schemaVersion || 0);
  const fetchedAt = parseTimestamp(snapshot?.fetchedAt || snapshot?.generatedAt);
  const sections = normalizeSections(snapshot);
  const sectionKeys = Object.keys(sections);
  const storyCount = Object.values(sections).reduce((sum, rows) => sum + rows.length, 0);
  const diagnostics = diagnosticCount(snapshot);
  const missing = REQUIRED_SECTION_KEYS.filter(key => !sectionKeys.includes(key));

  if (schema && !SUPPORTED_SCHEMAS.has(schema)) errors.push(`Unsupported sections schemaVersion: ${schema}`);
  if (!fetchedAt) errors.push('sections fetchedAt/runtime timestamp is missing or invalid');
  if (sectionKeys.length === 0) errors.push('sections object is missing or empty');
  if (missing.length > 0) warnings.push(`sections snapshot missing common keys: ${missing.join(', ')}`);
  if (storyCount === 0 && diagnostics === 0) errors.push('sections has zero rows and no explicit diagnostic/status');
  if (storyCount === 0 && diagnostics > 0) warnings.push('sections has zero rows but includes diagnostics/status');
  if (!snapshot?.contentHash) warnings.push('sections contentHash is missing');
  if (asArray(sections.topStories).length === 0) warnings.push('topStories section is empty');

  return makeResult(errors, warnings, {
    schemaVersion: schema,
    fetchedAt,
    sectionCount: sectionKeys.length,
    storyCount,
    diagnosticCount: diagnostics,
    topStoriesCount: asArray(sections.topStories).length,
  });
}
