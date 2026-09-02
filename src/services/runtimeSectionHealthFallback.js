function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object') {
    return String(value.name || value.title || value.label || value.id || '').trim();
  }
  return String(value ?? '').trim();
}

function normalizeKey(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function normalizeRuntimeSectionId(sectionId) {
  const normalized = normalizeKey(sectionId);
  if (['topstories', 'frontpage'].includes(normalized)) return 'topStories';
  if (['chennai', 'chennainenews', 'tn', 'tamilnadu', 'tamilnadunews'].includes(normalized)) return 'chennai';
  if (['local', 'localnews', 'muscat', 'muscatnews'].includes(normalized)) return 'local';
  if (['india', 'indianews'].includes(normalized)) return 'india';
  if (['world', 'worldnews'].includes(normalized)) return 'world';
  return normalized || 'section';
}

function getSourceLabel(story) {
  return text(story?.source || story?.publisher || story?.sourceGroup || story?.publisherId) || 'Unknown';
}

function getSourceGroupKey(story) {
  return normalizeKey(story?.sourceGroup || story?.publisherId || story?.source || story?.publisher);
}

function getLatestFetchTimestamp(stories) {
  const timestamps = stories
    .map(story => Number(story?.fetchedAt || story?.lastCheckedAt || 0))
    .filter(value => Number.isFinite(value) && value > 0);
  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

function buildTopSources(stories) {
  const counts = new Map();
  stories.forEach(story => {
    const source = getSourceLabel(story);
    counts.set(source, (counts.get(source) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source))
    .slice(0, 8);
}

function uniqueReasons(reasons = []) {
  return [...new Set(asArray(reasons).map(text).filter(Boolean))];
}

export function hasConcreteSectionHealth(summary) {
  return ['ok', 'warning', 'critical'].includes(String(summary?.status || '').toLowerCase());
}

export function buildEmptySectionHealthSummary({ sectionId, healthSummary } = {}) {
  const base = healthSummary && typeof healthSummary === 'object' ? healthSummary : {};
  return {
    ...base,
    sectionId: normalizeRuntimeSectionId(sectionId || base.sectionId),
    status: 'critical',
    storyCount: 0,
    sourceGroupCount: Number(base.sourceGroupCount || 0),
    topSources: asArray(base.topSources),
    warningFeeds: asArray(base.warningFeeds),
    deadFeeds: asArray(base.deadFeeds),
    staleFeeds: asArray(base.staleFeeds),
    zeroItemFeeds: asArray(base.zeroItemFeeds),
    lastCheckedAt: base.lastCheckedAt || null,
    lastNonZeroSuccess: base.lastNonZeroSuccess || null,
    lastError: text(base.lastError),
    reasons: uniqueReasons([
      ...asArray(base.reasons),
      'served_section_empty',
      ...(hasConcreteSectionHealth(base) ? ['stored_health_disagrees_with_served_data'] : ['source_health_unavailable']),
    ]),
    evidenceSource: hasConcreteSectionHealth(base)
      ? 'served-stories+stored-health'
      : 'served-stories',
  };
}

export function buildRuntimeSectionHealthSummary({ sectionId, stories } = {}) {
  const rows = asArray(stories).filter(Boolean);
  if (rows.length === 0) return buildEmptySectionHealthSummary({ sectionId });

  const sourceGroups = new Set(rows.map(getSourceGroupKey).filter(Boolean));
  const sourceGroupCount = sourceGroups.size;
  const singleSource = sourceGroupCount === 1;

  return {
    sectionId: normalizeRuntimeSectionId(sectionId),
    status: 'warning',
    storyCount: rows.length,
    sourceGroupCount,
    topSources: buildTopSources(rows),
    warningFeeds: [],
    deadFeeds: [],
    staleFeeds: [],
    zeroItemFeeds: [],
    singleSource,
    lastCheckedAt: getLatestFetchTimestamp(rows),
    lastNonZeroSuccess: null,
    lastError: '',
    reasons: [
      'runtime_story_evidence_only',
      'source_health_unavailable',
      ...(singleSource ? ['single_source_section'] : []),
    ],
    evidenceSource: 'rendered-stories',
  };
}

export function resolveSectionHealthSummary({ healthSummary, sectionId, stories } = {}) {
  const rows = asArray(stories).filter(Boolean);
  if (rows.length === 0) return buildEmptySectionHealthSummary({ sectionId, healthSummary });
  if (hasConcreteSectionHealth(healthSummary)) return healthSummary;
  return buildRuntimeSectionHealthSummary({ sectionId, stories: rows });
}
