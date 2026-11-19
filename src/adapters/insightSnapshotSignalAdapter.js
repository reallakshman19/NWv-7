import { extractLocalEntities, extractLocalVerbs } from './nlpAdapter.js';

const SUPPORTED_SNAPSHOT_SCHEMAS = new Set([2, 3]);

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeText(value, fallback = '') {
  const text = String(value || '').trim();
  return text || fallback;
}

function unique(values) {
  return [...new Set(
    safeArray(values)
      .map(value => String(value || '').trim())
      .filter(Boolean)
  )];
}

function getSignalTopicTokens(story) {
  return unique([
    ...safeArray(story?.storySignals?.topicTokens),
    ...safeArray(story?.topicTokens),
  ]).slice(0, 16);
}

function getSignalNumbers(story) {
  return unique([
    ...safeArray(story?.storySignals?.numbers),
    ...safeArray(story?.numbers),
  ]).slice(0, 16);
}

function getSignalKeywords(story) {
  const topicTokens = getSignalTopicTokens(story);

  return unique([
    ...topicTokens,
    ...safeArray(story?.keywords),
  ]).slice(0, 12);
}

function getSignalEntities(story) {
  const existing = story?.entities || {};
  const extracted = extractLocalEntities(`${story?.title || ''} ${story?.summary || story?.description || ''}`);
  const sourceGroup = safeText(story?.storySignals?.sourceGroup || story?.sourceGroup || story?.source);
  return {
    people: unique([...safeArray(existing.people), ...extracted.people]),
    orgs: unique([...safeArray(existing.orgs), ...extracted.orgs]),
    places: unique([...safeArray(existing.places), ...extracted.places]),
    products: unique([...safeArray(existing.products), ...extracted.products]),
    symbols: unique([...safeArray(existing.symbols), ...extracted.symbols]),
    sourceGroup,
  };
}

export function isSupportedInsightSnapshotSchema(snapshot) {
  return SUPPORTED_SNAPSHOT_SCHEMAS.has(Number(snapshot?.schemaVersion));
}

export function getInsightSnapshotSignals(story) {
  const hasCollectorSignals = Boolean(story?.storySignals || story?.angleHints);

  if (!hasCollectorSignals) {
    return {
      hasCollectorSignals: false,
      entities: null,
      keywords: null,
      verbs: null,
      numbers: null,
      angleHints: [],
      topicTokens: [],
    };
  }

  const angleHints = safeArray(story?.angleHints || story?.storySignals?.angleHints)
    .map(hint => {
      if (typeof hint === 'string') {
        return {
          angle: hint,
          score: 0.5,
          matches: [],
        };
      }

      return {
        angle: hint?.angle || 'base_report',
        score: Number.isFinite(Number(hint?.score)) ? Number(hint.score) : 0.5,
        matches: safeArray(hint?.matches),
      };
    })
    .filter(hint => hint.angle);

  const keywords = getSignalKeywords(story);
  const numbers = getSignalNumbers(story);
  const entities = getSignalEntities(story);
  const verbs = unique([
    ...safeArray(story?.eventVerbs),
    ...extractLocalVerbs(`${story?.title || ''} ${story?.summary || story?.description || ''}`),
  ]).slice(0, 10);

  return {
    hasCollectorSignals: true,
    entities,
    keywords,
    verbs,
    numbers,
    angleHints,
    topicTokens: getSignalTopicTokens(story),
  };
}

export function enrichRawStoryWithSnapshotSignals(story, snapshot = null) {
  const signals = getInsightSnapshotSignals(story);

  return {
    ...story,
    sourceGroup: safeText(story?.sourceGroup || story?.storySignals?.sourceGroup || story?.source, 'unknown_source'),
    source: safeText(story?.source || story?.sourceGroup || story?.storySignals?.sourceGroup, 'Unknown source'),
    category: safeText(story?.category, 'general'),
    language: safeText(story?.language, 'en'),
    angleHints: signals.angleHints,
    storySignals: {
      ...(story?.storySignals || {}),
      topicTokens: signals.topicTokens,
      numbers: signals.numbers,
      angleHints: signals.angleHints,
      sourceGroup: safeText(story?.storySignals?.sourceGroup || story?.sourceGroup || story?.source, 'unknown_source'),
    },
    snapshotDiagnostics: snapshot ? {
      schemaVersion: snapshot.schemaVersion,
      collectorVersion: snapshot.collectorVersion || '',
      contentHash: snapshot.contentHash || '',
      slotQuality: snapshot.slotQuality || null,
      sourceDiversity: snapshot.sourceDiversity || null,
    } : story?.snapshotDiagnostics,
    _collectorSignalStatus: signals.hasCollectorSignals ? 'collector-signals-used' : 'browser-signals-required',
  };
}

export function getInsightSnapshotRuntimeSummary(snapshot) {
  return {
    schemaVersion: Number(snapshot?.schemaVersion || 0),
    supported: isSupportedInsightSnapshotSchema(snapshot),
    collectorVersion: snapshot?.collectorVersion || '',
    contentHash: snapshot?.contentHash || '',
    totalStories: safeArray(snapshot?.stories).length,
    hasStorySignals: safeArray(snapshot?.stories).some(story => Boolean(story?.storySignals)),
    hasAngleHints: safeArray(snapshot?.stories).some(story => safeArray(story?.angleHints || story?.storySignals?.angleHints).length > 0),
    slotQuality: snapshot?.slotQuality || null,
    sourceDiversity: snapshot?.sourceDiversity || null,
  };
}

export default getInsightSnapshotSignals;
