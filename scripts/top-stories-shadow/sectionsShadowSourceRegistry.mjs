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

const REQUIRED_COVERAGE_KEYS = Object.freeze([
  'minSections',
  'minFeedsPerSection',
  'minSourceGroups',
  'minTierAFeeds',
]);
const VALID_TIERS = new Set(['A', 'B', 'C']);

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
  const tier = requiredText(feed.tier, `${sectionKey}[${index}].tier`).toUpperCase();
  if (!VALID_TIERS.has(tier)) {
    throw new SectionsSourceRegistryError(
      'source_registry_tier_invalid',
      `Unsupported tier at ${sectionKey}[${index}]`,
    );
  }
  return Object.freeze({
    ...feed,
    url: requiredText(feed.url, `${sectionKey}[${index}].url`),
    source: requiredText(feed.source, `${sectionKey}[${index}].source`),
    sourceGroup: requiredText(
      feed.sourceGroup,
      `${sectionKey}[${index}].sourceGroup`,
    ),
    tier,
    topic: requiredText(feed.topic, `${sectionKey}[${index}].topic`),
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

function normalizeCoverage(value) {
  if (!isRecord(value)) {
    throw new SectionsSourceRegistryError(
      'source_registry_coverage_missing',
      'Source registry requiredCoverage object is required',
    );
  }
  const missing = REQUIRED_COVERAGE_KEYS.filter(key => !Object.hasOwn(value, key));
  if (missing.length > 0) {
    throw new SectionsSourceRegistryError(
      'source_registry_coverage_missing',
      `Source registry requiredCoverage missing: ${missing.join(', ')}`,
    );
  }
  const entries = Object.entries(value).map(([key, raw]) => {
    const number = Number(raw);
    if (!Number.isInteger(number) || number < 0) {
      throw new SectionsSourceRegistryError(
        'source_registry_coverage_invalid',
        `Source registry requiredCoverage.${key} must be a non-negative integer`,
      );
    }
    return [key, number];
  });
  return Object.freeze(Object.fromEntries(entries));
}

function buildCoverageMetrics(sections) {
  const feeds = Object.values(sections).flat();
  const feedCounts = Object.fromEntries(
    REQUIRED_SECTION_KEYS.map(section => [section, sections[section].length]),
  );
  return Object.freeze({
    sectionCount: Object.keys(sections).length,
    laneCount: feeds.length,
    minFeedsInSection: Math.min(...Object.values(feedCounts)),
    sourceGroupCount: new Set(feeds.map(feed => feed.sourceGroup)).size,
    tierACount: feeds.filter(feed => feed.tier === 'A').length,
    feedCounts: Object.freeze(feedCounts),
  });
}

function assertRequiredCoverage(metrics, requiredCoverage) {
  const failures = [];
  if (metrics.sectionCount < requiredCoverage.minSections) failures.push('minSections');
  if (metrics.minFeedsInSection < requiredCoverage.minFeedsPerSection) {
    failures.push('minFeedsPerSection');
  }
  if (metrics.sourceGroupCount < requiredCoverage.minSourceGroups) {
    failures.push('minSourceGroups');
  }
  if (metrics.tierACount < requiredCoverage.minTierAFeeds) failures.push('minTierAFeeds');
  if (failures.length > 0) {
    throw new SectionsSourceRegistryError(
      'source_registry_coverage_failed',
      `Source registry fails required coverage: ${failures.join(', ')}`,
    );
  }
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
  const metrics = buildCoverageMetrics(sections);
  assertRequiredCoverage(metrics, requiredCoverage);
  const canonicalRegistry = Object.freeze({
    schemaVersion,
    policyVersion,
    sections,
    requiredCoverage,
  });
  return Object.freeze({
    schemaVersion: SECTIONS_SOURCE_REGISTRY_AUTHORITY_SCHEMA,
    sourceRegistryVersion: policyVersion,
    sourceRegistryDigest: digestCanonicalJson(canonicalRegistry),
    ...metrics,
    canonicalRegistry,
  });
}
