import { isTopStoryTimeEligible, getAgeHours } from './topStoriesSignals.js';
import { getTopStoriesPolicy } from './topStoriesPolicy.js';
import { newsIdentityKey, disambiguateNewsIds, stableNewsRowKey } from '../newsStoryIdentity.js';
import { clusterPublisherFamilies, captureNewsEvidenceRows } from '../newsClusterEvidence.js';

const SOURCE_ROW_UNIT = 'SOURCE_ROW';
const CANDIDATE_UNIT = 'RANKING_CANDIDATE';

export const TOP_STORY_SOURCE_LANES = Object.freeze({
  SECTION_ITEMS_ARRAY: 'section_items_array',
  SECTION_ITEMS_OBJECT: 'section_items_object',
  TOP_FEED_ITEMS: 'top_feed_items',
});

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function listSectionRows(sectionItems) {
  if (Array.isArray(sectionItems)) {
    return sectionItems.map(sourceRow => ({
      sourceLane: TOP_STORY_SOURCE_LANES.SECTION_ITEMS_ARRAY,
      sourceSectionKey: null,
      sourceRow,
    }));
  }
  return Object.entries(sectionItems || {}).flatMap(([sectionKey, items]) =>
    asArray(items).map(sourceRow => ({
      sourceLane: TOP_STORY_SOURCE_LANES.SECTION_ITEMS_OBJECT,
      sourceSectionKey: sectionKey,
      sourceRow,
    })));
}

export function listTopStorySourceRows({
  sectionItems = {},
  topFeedItems = [],
} = {}) {
  const rows = [
    ...listSectionRows(sectionItems),
    ...asArray(topFeedItems).map(sourceRow => ({
      sourceLane: TOP_STORY_SOURCE_LANES.TOP_FEED_ITEMS,
      sourceSectionKey: null,
      sourceRow,
    })),
  ];
  const disambiguated=disambiguateNewsIds(rows.map(row=>row.sourceRow));
  return rows.map((row, sourceRowIndex) => ({ ...row, sourceRow:disambiguated[sourceRowIndex], sourceRowIndex }));
}

export function getTopStoryDedupeKey(story = {}) { return newsIdentityKey(story); }

function mergeDuplicate(existing, next, nowMs, policy) {
  const existingValid = isTopStoryTimeEligible(existing, nowMs, policy);
  const nextValid = isTopStoryTimeEligible(next, nowMs, policy);
  if (!existingValid || !nextValid) return nextValid ? next : existing;
  const nextAge=getAgeHours(next,nowMs), existingAge=getAgeHours(existing,nowMs);
  const representative = nextAge < existingAge || (nextAge===existingAge && stableNewsRowKey(next).localeCompare(stableNewsRowKey(existing))<0) ? next : existing;
  const evidence = captureNewsEvidenceRows([existing,next]).filter(row=>isTopStoryTimeEligible(row,nowMs,policy));
  const allSources = clusterPublisherFamilies(evidence);
  return {...representative,sourceCount:Math.max(1,allSources.length),allSources,clusteredItems:evidence.length,newsEvidenceRows:evidence};
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
  policy = getTopStoriesPolicy(),
} = {}) {
  const rows = listTopStorySourceRows({ sectionItems, topFeedItems });
  const merged = new Map();
  const candidateBuildTrace = [];

  rows.forEach(({ sourceRow: item, sourceRowIndex: index }) => {
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
      merged.set(key, mergeDuplicate(merged.get(key), enriched, nowMs, policy));
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
