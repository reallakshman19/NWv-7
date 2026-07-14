const DEFAULT_OPTIONS = Object.freeze({
  maxHits: 6,
  maxSources: 4,
  maxRank: 25,
});

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function textValue(value) {
  return String(value || '').trim();
}

function normalizeText(value) {
  return textValue(value).toLowerCase().replace(/\s+/g, ' ');
}

function normalizeTitle(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeUrl(value) {
  const raw = textValue(value);
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '').toLowerCase();
  } catch {
    return raw.replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
  }
}

function getOptions(options = {}) {
  return {
    maxHits: Math.max(1, Number(options.maxHits || DEFAULT_OPTIONS.maxHits)),
    maxSources: Math.max(1, Number(options.maxSources || DEFAULT_OPTIONS.maxSources)),
    maxRank: Math.max(1, Number(options.maxRank || DEFAULT_OPTIONS.maxRank)),
  };
}

function getRank(value) {
  const rank = Number(value);
  return Number.isFinite(rank) && rank > 0 ? rank : null;
}

function rankScore(rank, fallbackIndex, maxRank) {
  const effectiveRank = getRank(rank) || (fallbackIndex + 1);
  const bounded = Math.min(maxRank, Math.max(1, effectiveRank));
  return Math.max(0, 1 - ((bounded - 1) / Math.max(1, maxRank - 1)));
}

function clampScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(1, Math.max(0, number));
}

function sourceKey(row = {}) {
  return normalizeText(row.sourceGroup || row.source || row.topFeedSource || 'unknown');
}

function feedSourceKey(row = {}) {
  return normalizeText(row.topFeedSource || row.sourceGroup || row.source || 'unknown');
}

function identityKeys(row = {}) {
  return [
    textValue(row.canonicalId),
    textValue(row.id),
    normalizeUrl(row.url),
    normalizeUrl(row.link),
    textValue(row.url),
    textValue(row.link),
    textValue(row.title),
    normalizeTitle(row.title),
    textValue(row.normalizedIdentity),
  ].filter(Boolean);
}

export function getTopFeedIdentity(row = {}) {
  if (!isRecord(row)) return '';
  return textValue(row.canonicalId) ||
    textValue(row.id) ||
    normalizeUrl(row.url) ||
    normalizeUrl(row.link) ||
    normalizeTitle(row.title);
}

function createGroup(identity, row, index) {
  return {
    identity,
    firstRow: { ...row },
    firstIndex: index,
    evidenceKeys: new Set(),
    sources: new Set(),
    feedSources: new Set(),
    ranks: [],
  };
}

function addEvidence(group, row, index) {
  const source = sourceKey(row);
  const feedSource = feedSourceKey(row);
  const rank = getRank(row.topFeedRank);
  group.sources.add(source);
  group.feedSources.add(feedSource);
  if (rank) group.ranks.push(rank);
  group.evidenceKeys.add(`${source}|${feedSource}|${rank || index + 1}`);
}

// Legacy membership/evidence-volume metric retained for compatibility and display.
// It is not used as independent corroboration by the Top Stories ranker.
function getHitCount(group, options) {
  const sourceCount = Math.max(1, group.sources.size);
  const evidenceCount = Math.max(sourceCount, group.evidenceKeys.size);
  const boundedEvidence = Math.log1p(evidenceCount) / Math.log1p(options.maxHits);
  return Math.min(options.maxHits, sourceCount + boundedEvidence);
}

// Independent corroboration starts only after the first publisher/source family.
// Multiple rows or feed positions from the same publisher do not corroborate themselves.
function getCorroborationHits(group, options) {
  return Math.min(options.maxHits, Math.max(0, group.sources.size - 1));
}

function finalizeGroup(group, options) {
  const topFeedHits = getHitCount(group, options);
  const topFeedSourceCount = Math.min(options.maxSources, Math.max(1, group.sources.size));
  const topFeedCorroborationHits = getCorroborationHits(group, options);
  const topFeedCorroboratingSourceCount = Math.min(
    Math.max(0, options.maxSources - 1),
    Math.max(0, topFeedSourceCount - 1),
  );
  const bestRank = group.ranks.length > 0 ? Math.min(...group.ranks) : null;
  const topFeedRankScore = rankScore(bestRank, group.firstIndex, options.maxRank);
  const topFeedConsensusScore = topFeedCorroborationHits > 0
    ? clampScore(Math.log1p(topFeedCorroborationHits) / Math.log1p(options.maxSources))
    : 0;

  return {
    ...group.firstRow,
    normalizedIdentity: group.identity,
    topFeedPresent: true,
    topFeedHits,
    topFeedCorroborationHits,
    topFeedConsensusScore,
    topFeedRankScore,
    topFeedSourceCount,
    topFeedCorroboratingSourceCount,
    topFeedSources: [...group.sources].sort(),
    topFeedFeedSources: [...group.feedSources].sort(),
    topFeedBestRank: bestRank,
  };
}

export function normalizeTopFeedSnapshotRows(rows = [], options = {}) {
  const opts = getOptions(options);
  const groups = new Map();
  asArray(rows).forEach((row, index) => {
    if (!isRecord(row)) return;
    const identity = getTopFeedIdentity(row);
    if (!identity) return;
    if (!groups.has(identity)) groups.set(identity, createGroup(identity, row, index));
    addEvidence(groups.get(identity), row, index);
  });
  return [...groups.values()]
    .map(group => finalizeGroup(group, opts))
    .sort((a, b) => (Number(b.topFeedRankScore) - Number(a.topFeedRankScore)) ||
      a.normalizedIdentity.localeCompare(b.normalizedIdentity));
}

export function buildTopFeedSnapshotSignalMap(rows = [], options = {}) {
  const map = new Map();
  normalizeTopFeedSnapshotRows(rows, options).forEach(signal => {
    for (const key of new Set([getTopFeedIdentity(signal), ...identityKeys(signal)])) {
      if (key) map.set(String(key), signal);
      if (key) map.set(normalizeText(key), signal);
    }
  });
  return map;
}

export function mergeTopFeedSignalsIntoStories(stories = [], rows = [], options = {}) {
  const signalMap = buildTopFeedSnapshotSignalMap(rows, options);
  return asArray(stories).map(story => {
    if (!isRecord(story)) return story;
    const signal = identityKeys(story).map(key => signalMap.get(key) || signalMap.get(normalizeText(key))).find(Boolean);
    if (!signal) return { ...story };
    return {
      ...story,
      topFeedPresent: Boolean(story.topFeedPresent || signal.topFeedPresent),
      topFeedHits: Math.max(Number(story.topFeedHits || 0), Number(signal.topFeedHits || 0)),
      topFeedCorroborationHits: Math.max(
        Number(story.topFeedCorroborationHits || 0),
        Number(signal.topFeedCorroborationHits || 0),
      ),
      topFeedConsensusScore: Math.max(Number(story.topFeedConsensusScore || 0), Number(signal.topFeedConsensusScore || 0)),
      topFeedRankScore: Math.max(Number(story.topFeedRankScore || 0), Number(signal.topFeedRankScore || 0)),
      topFeedSourceCount: Math.max(Number(story.topFeedSourceCount || 0), Number(signal.topFeedSourceCount || 0)),
      topFeedCorroboratingSourceCount: Math.max(
        Number(story.topFeedCorroboratingSourceCount || 0),
        Number(signal.topFeedCorroboratingSourceCount || 0),
      ),
      topFeedSources: signal.topFeedSources || [],
    };
  });
}

export function explainTopFeedSignal(signal = {}) {
  return [
    `identity=${signal.normalizedIdentity || 'unknown'}`,
    `present=${Boolean(signal.topFeedPresent)}`,
    `hits=${Number(signal.topFeedHits || 0).toFixed(2)}`,
    `corroboration=${Number(signal.topFeedCorroborationHits || 0).toFixed(2)}`,
    `consensus=${Number(signal.topFeedConsensusScore || 0).toFixed(2)}`,
    `rank=${Number(signal.topFeedRankScore || 0).toFixed(2)}`,
    `sources=${Number(signal.topFeedSourceCount || 0)}`,
  ].join('; ');
}
