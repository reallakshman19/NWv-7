import { SECTIONS_DATA_SOURCES } from '../utils/sectionsDataSource.js';

function safeSections(snapshot) {
  const sections = snapshot?.sections;
  return sections && typeof sections === 'object' && !Array.isArray(sections) ? sections : {};
}

function storyIdentity(story) {
  return String(story?.url || story?.id || '').trim().toLowerCase();
}

function isUsableStory(story) {
  const publishedAt = Number(story?.publishedAt || 0);
  return Boolean(
    String(story?.title || '').trim() &&
    String(story?.url || '').trim() &&
    Number.isFinite(publishedAt) &&
    publishedAt > 0
  );
}

export function flattenSectionsForInsight(snapshot) {
  const seen = new Set();
  const stories = [];
  for (const sectionKey of Object.keys(safeSections(snapshot)).sort()) {
    const sectionStories = Array.isArray(snapshot.sections[sectionKey])
      ? snapshot.sections[sectionKey]
      : [];
    for (const story of sectionStories) {
      if (!isUsableStory(story)) continue;
      const identity = storyIdentity(story);
      if (!identity || seen.has(identity)) continue;
      seen.add(identity);
      stories.push({
        ...story,
        category: story.category || sectionKey,
      });
    }
  }
  return stories;
}

export function buildInsightSnapshotFromSectionsSnapshot(snapshot) {
  const effectiveSource = snapshot?.runtimeDataSource?.effective;
  const evidenceVerified = snapshot?.preview?.evidenceVerified === true;
  const fetchedAt = Number(snapshot?.fetchedAt || 0);
  if (
    effectiveSource !== SECTIONS_DATA_SOURCES.CLOUDFLARE_PREVIEW ||
    !evidenceVerified ||
    !Number.isFinite(fetchedAt) ||
    fetchedAt <= 0
  ) {
    return null;
  }

  const stories = flattenSectionsForInsight(snapshot);
  if (stories.length === 0) return null;

  return {
    schemaVersion: 2,
    fetchedAt,
    contentHash: String(
      snapshot?.contentHash || snapshot?.preview?.decisionOutputDigest || ''
    ),
    stories,
    sourceAuthority: {
      requested: snapshot.runtimeDataSource.requested,
      effective: effectiveSource,
      epochId: snapshot?.preview?.epochId || null,
      evidenceVerified: true,
      sourceRegistryVersion: snapshot?.preview?.sourceRegistryVersion || null,
    },
  };
}
