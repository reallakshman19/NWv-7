import { digestCanonicalJson } from './canonicalJson.mjs';

export const SECTIONS_SOURCE_REGISTRY_AUTHORITY_SCHEMA =
  'nw-sections-source-registry-authority/v1';

export const REQUIRED_SECTION_KEYS = Object.freeze([
  'topStories',
  'india',
  'tn',
  'trichy',
  'muscat',
  'world',
  'business',
  'technology',
  'sports',
  'entertainment',
]);

export class SectionsSourceRegistryError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SectionsSourceRegistryError';
    this.code = code;
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requiredText(value, field) {
  const text = String(value || '').trim();
  if (!text) {
    throw new SectionsSourceRegistryError(
      'source_registry_field_missing',
      `Source registry requires ${field}`,
    );
  }
  return text;
}

function normalizeFeed(feed, sectionKey, index) {
  if (!isRecord(feed)) {
    throw new SectionsSourceRegistryError(
      'source_registry_feed_invalid',
      `Invalid feed at ${sectionKey}[${index}]`,
    );
  }
  return Object.freeze({
    url: requiredText(feed.url, `${sectionKey}[${index}].url`),
    source: requiredText(feed.source, `${sectionKey}[${index}].source`),
    sourceGroup: requiredText(
      feed.sourceGroup,
      `${sectionKey}[${index}].sourceGroup`,
    ),
    tier: requiredText(feed.tier, `${sectionKey}[${index}].tier`),
  });
}

function normalizeSections(sections) {
  if (!isRecord(sections)) {
    throw new SectionsSourceRegistryError(
      'source_registry_sections_missing',
      'Source registry sections object is required',
    );
  }
  const keys = Object.keys(sections).sort();
  const required = [...REQUIRED_SECTION_KEYS].sort();
  if (JSON.stringify(keys) !== JSON.stringify(required)) {
    throw new SectionsSourceRegistryError(
      'source_registry_section_set_mismatch',
      'Source registry must contain the exact ten qualified sections',
    );
  }
  return Object.freeze(Object.fromEntries(REQUIRED_SECTION_KEYS.map(sectionKey => {
    const feeds = sections[sectionKey];
    if (!Array.isArray(feeds) || feeds.length === 0) {
      throw new SectionsSourceRegistryError(
        'source_registry_section_empty',
        `Source registry section ${sectionKey} requires feeds`,
      );
    }
    return [
      sectionKey,
      Object.freeze(feeds.map((feed, index) => normalizeFeed(feed, sectionKey, index))),
    ];
  })));
}

function normalizeCoverage(value = {}) {
  if (!isRecord(value)) return Object.freeze({});
  return Object.freeze(Object.fromEntries(
    Object.entries(value).map(([key, raw]) => [key, Number(raw)]),
  ));
}

function countLanes(sections) {
  return Object.values(sections).reduce((sum, feeds) => sum + feeds.length, 0);
}

export function buildSectionsSourceRegistryAuthority(registry = {}) {
  if (!isRecord(registry)) {
    throw new SectionsSourceRegistryError(
      'source_registry_missing',
      'Source registry object is required',
    );
  }
  const schemaVersion = Number(registry.schemaVersion || 0);
  if (schemaVersion !== 1) {
    throw new SectionsSourceRegistryError(
      'source_registry_schema_unsupported',
      `Unsupported source registry schema ${schemaVersion}`,
    );
  }
  const policyVersion = requiredText(registry.policyVersion, 'policyVersion');
  const sections = normalizeSections(registry.sections);
  const requiredCoverage = normalizeCoverage(registry.requiredCoverage);
  const canonicalRegistry = Object.freeze({
    schemaVersion,
    policyVersion,
    sections,
    requiredCoverage,
  });
  const sectionCount = Object.keys(sections).length;
  const laneCount = countLanes(sections);
  return Object.freeze({
    schemaVersion: SECTIONS_SOURCE_REGISTRY_AUTHORITY_SCHEMA,
    sourceRegistryVersion: policyVersion,
    sourceRegistryDigest: digestCanonicalJson(canonicalRegistry),
    sectionCount,
    laneCount,
    canonicalRegistry,
  });
}
