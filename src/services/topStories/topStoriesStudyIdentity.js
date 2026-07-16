export const TOP_STORIES_IDENTITY_VERSION = 'nw-top-stories-identity-v1';

export const TOP_STORIES_IDENTITY_STATES = Object.freeze({
  RESOLVED: 'IDENTITY_RESOLVED',
  AMBIGUOUS: 'IDENTITY_AMBIGUOUS',
  CONFLICT: 'IDENTITY_CONFLICT',
  UNAVAILABLE: 'IDENTITY_UNAVAILABLE',
});

const TRACKING_PARAMS = new Set([
  'at_campaign', 'at_medium', 'cmpid', 'fbclid', 'gclid', 'output',
  'publisher', 'ref', 'source',
]);

const TITLE_STOP_WORDS = new Set([
  'about', 'after', 'against', 'amid', 'and', 'are', 'been', 'before',
  'from', 'have', 'into', 'more', 'over', 'says', 'that', 'the', 'their',
  'this', 'through', 'under', 'with', 'will', 'your',
]);

function hashText(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeIdentityValue(value) {
  return normalizeText(value).replace(/\s+/g, '-');
}

function getDistinctValues(story, fields) {
  return [...new Set(fields
    .map(field => normalizeIdentityValue(story?.[field]))
    .filter(Boolean))];
}

function getSourceFamily(story = {}) {
  return normalizeIdentityValue(
    story.sourceFamily || story.sourceGroup || story.source || 'unknown',
  ) || 'unknown';
}

export function normalizeTopStoryCanonicalUrl(value) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    parsed.hash = '';
    parsed.hostname = parsed.hostname
      .toLowerCase()
      .replace(/^www\./, '')
      .replace(/^m\./, '');
    [...parsed.searchParams.keys()].forEach(key => {
      if (key.startsWith('utm_') || TRACKING_PARAMS.has(key)) {
        parsed.searchParams.delete(key);
      }
    });
    parsed.searchParams.sort();
    parsed.pathname = parsed.pathname
      .replace(/\/(amp|amp\/?)$/i, '')
      .replace(/\/{2,}/g, '/')
      .replace(/\/$/, '') || '/';
    return parsed.toString().replace(/\?$/, '');
  } catch {
    return null;
  }
}

function getTitleTokens(story = {}) {
  return [...new Set(normalizeText(story.title)
    .split(' ')
    .filter(token => token.length > 2 && !TITLE_STOP_WORDS.has(token)))]
    .sort();
}

function getEventFingerprint(story = {}) {
  const tokens = getTitleTokens(story);
  if (tokens.length < 4) return null;
  const eventType = normalizeIdentityValue(
    story._topStoryRank?.eventType || story.eventType || story.category,
  ) || 'unknown';
  return `${eventType}:${tokens.slice(0, 12).join('-')}`;
}

function getTitleFingerprint(story = {}) {
  const normalized = normalizeText(story.title);
  return normalized ? hashText(normalized) : null;
}

function getRowIdentity(story = {}, sourceFamily) {
  const explicit = normalizeIdentityValue(story.id || story.rowId);
  if (explicit) return `row:${sourceFamily}:${hashText(explicit)}`;
  const url = normalizeTopStoryCanonicalUrl(story.url || story.link);
  if (url) return `row-url:${sourceFamily}:${hashText(url)}`;
  const title = getTitleFingerprint(story);
  return title ? `row-title:${sourceFamily}:${title}` : null;
}

function buildStrongSignals(story = {}) {
  const clusterValues = getDistinctValues(story, [
    'clusterId', 'cluster_id', 'editorialClusterId',
  ]);
  const canonicalValues = getDistinctValues(story, [
    'canonicalId', 'canonical_id',
  ]);
  const canonicalUrl = normalizeTopStoryCanonicalUrl(
    story.canonicalUrl || story.canonical_url || story.url || story.link,
  );
  return {
    clusterValues,
    canonicalValues,
    canonicalUrl,
  };
}

function chooseIdentity(story, signals) {
  if (signals.clusterValues[0]) {
    return ['cluster_id', signals.clusterValues[0], 'high'];
  }
  if (signals.canonicalValues[0]) {
    return ['canonical_id', signals.canonicalValues[0], 'high'];
  }
  if (signals.canonicalUrl) {
    return ['canonical_url', signals.canonicalUrl, 'high'];
  }
  const eventFingerprint = getEventFingerprint(story);
  if (eventFingerprint) {
    return ['event_fingerprint', eventFingerprint, 'medium'];
  }
  const titleFingerprint = getTitleFingerprint(story);
  if (titleFingerprint) {
    return ['title_fingerprint_fallback', titleFingerprint, 'low'];
  }
  return [null, null, 'none'];
}

function getInitialState(signals, method) {
  if (signals.clusterValues.length > 1 || signals.canonicalValues.length > 1) {
    return TOP_STORIES_IDENTITY_STATES.CONFLICT;
  }
  if (!method) return TOP_STORIES_IDENTITY_STATES.UNAVAILABLE;
  if (method === 'title_fingerprint_fallback') {
    return TOP_STORIES_IDENTITY_STATES.AMBIGUOUS;
  }
  return TOP_STORIES_IDENTITY_STATES.RESOLVED;
}

export function resolveTopStoryStudyIdentity(story = {}, options = {}) {
  const identityVersion = options.identityVersion || TOP_STORIES_IDENTITY_VERSION;
  const sourceFamily = getSourceFamily(story);
  const signals = buildStrongSignals(story);
  const [identityMethod, value, identityConfidence] = chooseIdentity(story, signals);
  const identityState = getInitialState(signals, identityMethod);
  const editorialIdentity = identityState === TOP_STORIES_IDENTITY_STATES.CONFLICT || !value
    ? null
    : `${identityMethod}:${hashText(value)}`;
  return {
    editorialIdentity,
    identityMethod,
    identityConfidence,
    identityVersion,
    identityState,
    rowIdentity: getRowIdentity(story, sourceFamily),
    sourceFamily,
    titleFingerprint: getTitleFingerprint(story),
    strongSignals: {
      clusterId: signals.clusterValues[0] || null,
      canonicalId: signals.canonicalValues[0] || null,
      canonicalUrl: signals.canonicalUrl,
    },
    diagnostics: identityState === TOP_STORIES_IDENTITY_STATES.CONFLICT
      ? ['conflicting_same_method_identifiers']
      : [],
  };
}

function registerLink(map, key, value, index) {
  if (!key || !value) return;
  const entry = map.get(key) || { values: new Map(), indexes: new Set() };
  entry.indexes.add(index);
  entry.values.set(value, (entry.values.get(value) || 0) + 1);
  map.set(key, entry);
}

function collectCrossRecordConflicts(identities) {
  const clusterToCanonical = new Map();
  const canonicalToCluster = new Map();
  identities.forEach((identity, index) => {
    const { clusterId, canonicalId } = identity.strongSignals;
    registerLink(clusterToCanonical, clusterId, canonicalId, index);
    registerLink(canonicalToCluster, canonicalId, clusterId, index);
  });
  const conflicts = new Set();
  for (const map of [clusterToCanonical, canonicalToCluster]) {
    for (const entry of map.values()) {
      if (entry.values.size > 1) entry.indexes.forEach(index => conflicts.add(index));
    }
  }
  return conflicts;
}

export function resolveTopStoryIdentitySet(stories = [], options = {}) {
  const identities = stories.map(story => resolveTopStoryStudyIdentity(story, options));
  const conflicts = collectCrossRecordConflicts(identities);
  return identities.map((identity, index) => {
    if (!conflicts.has(index)) return identity;
    return {
      ...identity,
      editorialIdentity: null,
      identityState: TOP_STORIES_IDENTITY_STATES.CONFLICT,
      diagnostics: [...identity.diagnostics, 'cross_record_strong_identity_conflict'],
    };
  });
}

export function attachTopStoryStudyIdentities(stories = [], options = {}) {
  const identities = resolveTopStoryIdentitySet(stories, options);
  return stories.map((story, index) => ({
    ...story,
    _studyIdentity: identities[index],
  }));
}
