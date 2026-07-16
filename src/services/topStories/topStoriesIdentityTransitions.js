import { TOP_STORIES_IDENTITY_STATES } from './topStoriesStudyIdentity.js';

function getIdentity(record = {}) {
  return record._studyIdentity || record;
}

function isResolved(record) {
  return getIdentity(record).identityState === TOP_STORIES_IDENTITY_STATES.RESOLVED &&
    Boolean(getIdentity(record).editorialIdentity);
}

function getMemberSet(record = {}) {
  const identity = getIdentity(record);
  const raw = record.identityMembers || record.clusterMemberIds || identity.identityMembers || [];
  const members = new Set(Array.isArray(raw) ? raw.filter(Boolean) : []);
  if (identity.rowIdentity) members.add(identity.rowIdentity);
  return members;
}

function indexResolved(records = []) {
  return new Map(records
    .filter(isResolved)
    .map(record => [getIdentity(record).editorialIdentity, record]));
}

function addSharedIdentityTransitions(transitions, prior, current) {
  const before = getIdentity(prior);
  const after = getIdentity(current);
  const evidenceId = after.editorialIdentity;
  if (before.sourceFamily !== after.sourceFamily) {
    transitions.push({
      type: 'representative_source_substitution',
      evidenceIds: [evidenceId],
      before: before.sourceFamily,
      after: after.sourceFamily,
    });
  }
  if (before.titleFingerprint !== after.titleFingerprint) {
    transitions.push({
      type: 'headline_mutation',
      evidenceIds: [evidenceId],
      before: before.titleFingerprint,
      after: after.titleFingerprint,
    });
  }
  if (before.rowIdentity !== after.rowIdentity) {
    transitions.push({
      type: 'representative_row_substitution',
      evidenceIds: [evidenceId],
      before: before.rowIdentity,
      after: after.rowIdentity,
    });
  }
}

function hasOverlap(left, right) {
  for (const value of left) {
    if (right.has(value)) return true;
  }
  return false;
}

function findIdentitySplits(priorMap, currentMap) {
  const transitions = [];
  for (const [priorId, priorRecord] of priorMap) {
    const priorMembers = getMemberSet(priorRecord);
    const targets = [...currentMap]
      .filter(([, record]) => hasOverlap(priorMembers, getMemberSet(record)))
      .map(([identity]) => identity);
    if (targets.length > 1) {
      transitions.push({
        type: 'cluster_split',
        evidenceIds: [priorId, ...targets],
        before: priorId,
        after: targets,
      });
    }
  }
  return transitions;
}

function findIdentityMerges(priorMap, currentMap) {
  const transitions = [];
  for (const [currentId, currentRecord] of currentMap) {
    const currentMembers = getMemberSet(currentRecord);
    const sources = [...priorMap]
      .filter(([, record]) => hasOverlap(currentMembers, getMemberSet(record)))
      .map(([identity]) => identity);
    if (sources.length > 1) {
      transitions.push({
        type: 'cluster_merge',
        evidenceIds: [...sources, currentId],
        before: sources,
        after: currentId,
      });
    }
  }
  return transitions;
}

function getVersion(records = []) {
  return records.map(getIdentity).find(identity => identity.identityVersion)?.identityVersion || null;
}

function countStates(records = []) {
  return records.reduce((counts, record) => {
    const state = getIdentity(record).identityState || TOP_STORIES_IDENTITY_STATES.UNAVAILABLE;
    counts[state] = (counts[state] || 0) + 1;
    return counts;
  }, {});
}

export function compareTopStoryIdentitySnapshots(priorRows = [], currentRows = []) {
  const priorVersion = getVersion(priorRows);
  const currentVersion = getVersion(currentRows);
  const versionBoundary = Boolean(
    priorVersion && currentVersion && priorVersion !== currentVersion,
  );
  const priorMap = indexResolved(priorRows);
  const currentMap = indexResolved(currentRows);
  const transitions = [];

  if (versionBoundary) {
    transitions.push({
      type: 'identity_version_boundary',
      evidenceIds: [],
      before: priorVersion,
      after: currentVersion,
    });
  } else {
    for (const [identity, prior] of priorMap) {
      const current = currentMap.get(identity);
      if (current) addSharedIdentityTransitions(transitions, prior, current);
    }
    transitions.push(...findIdentitySplits(priorMap, currentMap));
    transitions.push(...findIdentityMerges(priorMap, currentMap));
  }

  return {
    priorVersion,
    currentVersion,
    versionBoundary,
    transitions,
    entrantIdentityIds: versionBoundary
      ? []
      : [...currentMap.keys()].filter(identity => !priorMap.has(identity)),
    exitIdentityIds: versionBoundary
      ? []
      : [...priorMap.keys()].filter(identity => !currentMap.has(identity)),
    retainedIdentityIds: versionBoundary
      ? []
      : [...priorMap.keys()].filter(identity => currentMap.has(identity)),
    priorStateCounts: countStates(priorRows),
    currentStateCounts: countStates(currentRows),
  };
}
