const SOURCE_ROW_UNIT = 'SOURCE_ROW';
const CANDIDATE_UNIT = 'RANKING_CANDIDATE';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function flattenSectionItems(sectionItems) {
  if (Array.isArray(sectionItems)) return sectionItems;
  return Object.values(sectionItems || {}).flatMap(asArray);
}

export function getTopStoryDedupeKey(story = {}) {
  return String(
    story.id ||
    story.canonicalId ||
    story.url ||
    story.link ||
    story.title ||
    '',
  ).trim().toLowerCase();
}

function mergeDuplicate(existing, next) {
  const sourceCount = Math.max(
    Number(existing.sourceCount || 1),
    Number(next.sourceCount || 1),
  );
  const clusteredItems = Math.max(
    Number(existing.clusteredItems || 1),
    Number(next.clusteredItems || 1),
  );
  const allSources = [...new Set([
    ...(existing.allSources || []),
    ...(next.allSources || []),
    existing.source,
    next.source,
  ].filter(Boolean))];
  return { ...existing, sourceCount, clusteredItems, allSources };
}

function makeBuildTrace({
  index,
  key,
  disposition,
  representativeKey = null,
  reasonCode,
}) {
  return {
    sourceRowIndex: index,
    sourceRowKey: key || `row:${index}`,
    populationUnit: SOURCE_ROW_UNIT,
    outputUnit: disposition === 'PROMOTED_TO_CANDIDATE'
      ? CANDIDATE_UNIT
      : null,
    buildDisposition: disposition,
    reasonCode,
    representativeKey,
  };
}

export function buildTopStoryCandidatesWithTrace({
  sectionItems = {},
  topFeedItems = [],
  nowMs = Date.now(),
} = {}) {
  const rows = [...flattenSectionItems(sectionItems), ...asArray(topFeedItems)];
  const merged = new Map();
  const candidateBuildTrace = [];

  rows.forEach((item, index) => {
    if (!item || typeof item !== 'object') {
      candidateBuildTrace.push(makeBuildTrace({
        index,
        disposition: 'INVALID_INPUT',
        reasonCode: 'invalid_input',
      }));
      return;
    }

    const key = getTopStoryDedupeKey(item);
    if (!key) {
      candidateBuildTrace.push(makeBuildTrace({
        index,
        disposition: 'INVALID_INPUT',
        reasonCode: 'missing_identity',
      }));
      return;
    }

    const enriched = { ...item, _candidateSeenAt: nowMs };
    if (merged.has(key)) {
      merged.set(key, mergeDuplicate(merged.get(key), enriched));
      candidateBuildTrace.push(makeBuildTrace({
        index,
        key,
        disposition: 'COLLAPSED_AS_DUPLICATE',
        representativeKey: key,
        reasonCode: 'duplicate_identity',
      }));
      return;
    }

    merged.set(key, enriched);
    candidateBuildTrace.push(makeBuildTrace({
      index,
      key,
      disposition: 'PROMOTED_TO_CANDIDATE',
      representativeKey: key,
      reasonCode: 'candidate_created',
    }));
  });

  return {
    rawInputCount: rows.length,
    candidates: [...merged.values()],
    candidateBuildTrace,
  };
}

export function buildTopStoryCandidates(input = {}) {
  return buildTopStoryCandidatesWithTrace(input).candidates;
}
