export const REPOSITORY_REPLAY_ADAPTER_VERSION =
  'nw-top-stories-repository-replay-adapter/v1';

export const REPOSITORY_REPLAY_PRIORITY_SECTIONS = Object.freeze({
  world: 'world',
  india: 'india',
  chennai: 'tn',
  trichy: 'trichy',
  local: 'muscat',
});

export const REPOSITORY_SNAPSHOT_MAX_AGE_MS = 12 * 60 * 60 * 1000;
export const REPOSITORY_ITEM_MAX_AGE_MS = 36 * 60 * 60 * 1000;
export const REPOSITORY_SECTION_LIMIT = 10;

const SUPPORTED_SCHEMAS = new Set([1, 2]);
const LOW_CONFIDENCE_SOURCES = new Set([
  'missing',
  'invalid',
  'fetch_time_fallback',
  'unknown',
]);

export class RepositoryReplayAdapterError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RepositoryReplayAdapterError';
    this.code = code;
  }
}

function timestampMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1000 : value;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeText(value, fallback = '') {
  const text = String(value || '').trim();
  return text || fallback;
}

function isLowConfidence(item = {}) {
  const confidence = safeText(item.timestampConfidence).toLowerCase();
  const source = safeText(
    item.publishedAtSource || item.timestampSource,
  ).toLowerCase();
  return confidence === 'low' || LOW_CONFIDENCE_SOURCES.has(source);
}

function normalizeItem(item, requestedSection, sourceSection, fetchedAt) {
  const title = safeText(item.title || item.headline, 'Untitled');
  const summary = safeText(item.summary || item.description);
  const url = safeText(item.url || item.link || item.guid);
  const publishedAt = timestampMs(
    item.publishedAt || item.pubDate || item.date || item.updatedAt,
  );
  return {
    ...item,
    id: safeText(item.id || item.canonicalId || url || title),
    title,
    headline: title,
    summary,
    description: summary,
    url,
    link: url,
    source: safeText(item.source || item.sourceGroup, 'Unknown'),
    sourceGroup: safeText(
      item.sourceGroup || item.source,
      'unknown',
    ),
    publishedAt,
    fetchedAt: timestampMs(item.fetchedAt) || fetchedAt,
    section: requestedSection,
    sourceSection,
  };
}

function selectSectionRows(rows, context) {
  const normalized = rows.map(item => normalizeItem(
    item,
    context.requestedSection,
    context.sourceSection,
    context.fetchedAt,
  ));
  const timestampValid = normalized.filter(item => item.publishedAt > 0);
  const fresh = timestampValid.filter(item => (
    context.nowMs - item.publishedAt <= REPOSITORY_ITEM_MAX_AGE_MS
  ));
  const selectedPool = fresh.length > 0 ? fresh : timestampValid;
  const selected = selectedPool
    .sort((left, right) => right.publishedAt - left.publishedAt)
    .slice(0, REPOSITORY_SECTION_LIMIT);
  return {
    selected,
    rawCount: rows.length,
    validTimestampCount: timestampValid.length,
    freshCount: fresh.length,
    lowConfidenceCount: normalized.filter(isLowConfidence).length,
    staleFallback: fresh.length === 0 && timestampValid.length > 0,
  };
}

function summarizeSourceHealth(snapshot = {}) {
  const sources = snapshot.sources && typeof snapshot.sources === 'object'
    ? snapshot.sources
    : {};
  const entries = Object.entries(sources);
  return {
    sourceCount: entries.length,
    failedSourceCount: entries.filter(([, value]) => (
      value?.status === 'fail' || value?.ok === false
    )).length,
    warningSourceCount: entries.filter(([, value]) => (
      value?.status === 'warn'
    )).length,
    lastChecked: timestampMs(snapshot.lastChecked),
    sources,
  };
}

function assertInputs(sectionsSnapshot, sourceHealthSnapshot, nowMs) {
  if (!sectionsSnapshot || typeof sectionsSnapshot !== 'object') {
    throw new RepositoryReplayAdapterError(
      'missing_sections_snapshot',
      'Repository sections snapshot is required',
    );
  }
  if (!SUPPORTED_SCHEMAS.has(Number(sectionsSnapshot.schemaVersion))) {
    throw new RepositoryReplayAdapterError(
      'unsupported_sections_snapshot_schema',
      `Unsupported sections snapshot schema ${sectionsSnapshot.schemaVersion}`,
    );
  }
  if (!sectionsSnapshot.sections || typeof sectionsSnapshot.sections !== 'object') {
    throw new RepositoryReplayAdapterError(
      'invalid_sections_snapshot',
      'Repository sections snapshot requires sections',
    );
  }
  if (!sourceHealthSnapshot || typeof sourceHealthSnapshot !== 'object') {
    throw new RepositoryReplayAdapterError(
      'missing_source_health_snapshot',
      'Repository source-health snapshot is required',
    );
  }
  if (!Number.isFinite(nowMs)) {
    throw new RepositoryReplayAdapterError(
      'invalid_observation_clock',
      'Repository replay requires a finite nowMs',
    );
  }
}

export function buildRepositoryReplayInput({
  sectionsSnapshot,
  sourceHealthSnapshot,
  nowMs,
  sourceFiles = {},
}) {
  assertInputs(sectionsSnapshot, sourceHealthSnapshot, nowMs);
  const fetchedAt = timestampMs(sectionsSnapshot.fetchedAt);
  const snapshotAgeMs = fetchedAt > 0 ? Math.max(0, nowMs - fetchedAt) : Infinity;
  const snapshotStale = snapshotAgeMs > REPOSITORY_SNAPSHOT_MAX_AGE_MS;
  const sectionItems = {};
  const sectionDiagnostics = {};
  const missingSections = [];

  Object.entries(REPOSITORY_REPLAY_PRIORITY_SECTIONS)
    .forEach(([requestedSection, sourceSection]) => {
      const rows = sectionsSnapshot.sections[sourceSection];
      if (!Array.isArray(rows)) missingSections.push(sourceSection);
      const result = selectSectionRows(Array.isArray(rows) ? rows : [], {
        requestedSection,
        sourceSection,
        fetchedAt,
        nowMs,
      });
      sectionItems[requestedSection] = result.selected;
      sectionDiagnostics[requestedSection] = {
        sourceSection,
        ...result,
        selected: undefined,
      };
    });

  const healthSummary = summarizeSourceHealth(sourceHealthSnapshot);
  const complete = missingSections.length === 0;
  const usable = fetchedAt > 0 && Object.values(sectionItems)
    .some(items => items.length > 0);

  return {
    sectionItems,
    topFeedItems: [],
    settings: {},
    sourceHealth: {
      ok: usable && !snapshotStale,
      complete,
      snapshotStale,
      snapshotAgeMs,
      missingSections,
      ...healthSummary,
    },
    inputSource: 'repository-public-newsdata-sections-v2',
    inputSnapshotGeneratedAt: fetchedAt
      ? new Date(fetchedAt).toISOString()
      : null,
    inputDiagnostics: {
      adapterVersion: REPOSITORY_REPLAY_ADAPTER_VERSION,
      observationMode: 'repository-snapshot-replay',
      sectionsSchemaVersion: Number(sectionsSnapshot.schemaVersion),
      sectionsContentHash: sectionsSnapshot.contentHash || null,
      snapshotAgeMs,
      snapshotStale,
      itemMaxAgeMs: REPOSITORY_ITEM_MAX_AGE_MS,
      sectionLimit: REPOSITORY_SECTION_LIMIT,
      prioritySectionMap: REPOSITORY_REPLAY_PRIORITY_SECTIONS,
      sectionDiagnostics,
      topFeedMode: 'explicit-empty-current-main-runtime-contract',
      settingsMode: 'explicit-empty-current-ranker-contract',
      sourceFiles,
    },
  };
}
