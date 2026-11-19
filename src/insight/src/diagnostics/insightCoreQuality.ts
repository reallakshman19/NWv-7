import { countPublisherEvidenceFamilies } from "../pipeline/publisherIdentity";

import {
  InsightConfig,
  InsightParent,
  InsightStory,
  DEFAULT_CONFIG,
  AngleLabel,
} from "../types";

type StoriesByIdInput = Map<string, InsightStory> | Record<string, InsightStory> | undefined;

function safeArray<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : [];
}

function normalizeStoriesById(storiesById: StoriesByIdInput): Map<string, InsightStory> {
  if (storiesById instanceof Map) return storiesById;
  if (storiesById && typeof storiesById === "object") {
    return new Map(Object.entries(storiesById));
  }
  return new Map();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function asFiniteNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getInsightSourceLabel(source: string): string {
  if (source === "stale-snapshot") return "Stale snapshot";
  if (source === "snapshot") return "Snapshot";
  if (source === "cached") return "Cached";
  if (source === "unavailable") return "Unavailable";
  return "Live";
}

export function getVisibleChildStories(
  parent: InsightParent,
  storiesById: Map<string, InsightStory>
): InsightStory[] {
  const members = new Set(safeArray(parent.clusterStoryIds));
  const hidden = new Set(safeArray(parent.hiddenDuplicateIds));
  return [...new Set(safeArray(parent.childStoryIds))]
    .filter(id => members.has(id) && !hidden.has(id))
    .map(id => storiesById.get(id))
    .filter((story): story is InsightStory => Boolean(story && (!story.parentId || story.parentId === parent.parentId)));
}

export function getVisibleChildAngles(
  parent: InsightParent,
  storiesByIdInput: StoriesByIdInput
): AngleLabel[] {
  const storiesById = normalizeStoriesById(storiesByIdInput);

  return [
    ...new Set(
      getVisibleChildStories(parent, storiesById)
        .map(story => story.angle || "unknown")
        .filter(angle => angle !== "unknown")
    ),
  ] as AngleLabel[];
}

export function getInsightCoreQualityDiagnostics(
  result: {
    parents?: InsightParent[];
    storiesById?: StoriesByIdInput;
    hiddenIds?: Set<string>;
  } | null | undefined,
  source = "live",
  cfg: InsightConfig = DEFAULT_CONFIG
) {
  const parents = safeArray(result?.parents);
  const storiesById = normalizeStoriesById(result?.storiesById);

  const rankedCount = parents.length;
  const storyCount = storiesById.size || parents.reduce((sum, parent) => {
    return sum + safeArray(parent.clusterStoryIds).length;
  }, 0);

  // Diagnostic quality is based on the actually visible child evidence.
  // Eligible-but-unselected cluster members are reported separately, not
  // credited as visible publisher independence or temporal development.
  const eligibleSourceFamilyCounts = parents.map(parent => countPublisherEvidenceFamilies(
    safeArray(parent.clusterStoryIds).map(id => storiesById.get(id)).filter(Boolean) as InsightStory[]
  ));
  const eligibleSnapshotCounts = parents.map(parent => new Set(
    safeArray(parent.clusterStoryIds).map(id => storiesById.get(id)).filter(Boolean)
      .map(story => story?.capturedAtSnapshot).filter(Boolean)
  ).size);
  const childCounts = parents.map(parent => getVisibleChildStories(parent, storiesById).length);
  const visibleAngleCounts = parents.map(parent => getVisibleChildAngles(parent, storiesById).length);
  const sourceGroupCounts = parents.map(parent => countPublisherEvidenceFamilies(getVisibleChildStories(parent, storiesById)));

  const snapshotCounts = parents.map(parent => {
    const slots = new Set(
      getVisibleChildStories(parent, storiesById)
        .map(story => story?.capturedAtSnapshot)
        .filter(Boolean)
    );

    return slots.size;
  });

  const risingCount = parents.filter(parent => parent.isRising).length;
  const thinCount = parents.filter(parent => parent.weakTree).length;
  const multiAngleCount = visibleAngleCounts.filter(count => count >= 2).length;
  const lowAngleCount = visibleAngleCounts.filter(count => count < 2).length;
  const strongAngleCount = visibleAngleCounts.filter(count => count >= 3).length;
  const lowSourceDiversityCount = sourceGroupCounts.filter(count => count < cfg.MIN_SOURCES_PER_TREE).length;
  const lowSnapshotCoverageCount = snapshotCounts.filter(count => count < 2).length;

  const avgAngles = rankedCount > 0
    ? visibleAngleCounts.reduce((sum, count) => sum + count, 0) / rankedCount
    : 0;

  const avgChildren = rankedCount > 0
    ? childCounts.reduce((sum, count) => sum + count, 0) / rankedCount
    : 0;

  const avgScore = rankedCount > 0
    ? parents.reduce((sum, parent) => sum + asFiniteNumber(parent.finalParentScore), 0) / rankedCount
    : 0;

  const sourceLabel = getInsightSourceLabel(source);
  const isStale = source === "stale-snapshot" || source === "cached";
  const hiddenDuplicateCount = new Set([
    ...(result?.hiddenIds instanceof Set ? result.hiddenIds : []),
    ...parents.flatMap(parent => safeArray(parent.hiddenDuplicateIds)),
  ]).size;

  const angleCoverageScore = rankedCount > 0 ? multiAngleCount / rankedCount : 0;
  const strongAngleScore = rankedCount > 0 ? strongAngleCount / rankedCount : 0;
  const sourceDiversityScore = rankedCount > 0
    ? sourceGroupCounts.filter(count => count >= cfg.MIN_SOURCES_PER_TREE).length / rankedCount
    : 0;
  const snapshotCoverageScore = rankedCount > 0
    ? snapshotCounts.filter(count => count >= 2).length / rankedCount
    : 0;
  const childDepthScore = clamp(avgChildren / Math.max(1, cfg.WEAK_TREE_CHILD_MIN), 0, 1);
  const rankingScore = clamp(avgScore, 0, 1);
  const weakTreePenalty = rankedCount > 0 ? thinCount / rankedCount : 0;
  const stalePenalty = isStale ? 0.12 : 0;

  const signalScore = clamp(Math.round(
    (rankingScore * 24) +
    (angleCoverageScore * 22) +
    (strongAngleScore * 14) +
    (sourceDiversityScore * 14) +
    (snapshotCoverageScore * 10) +
    (childDepthScore * 10) +
    Math.min(6, risingCount * 2) -
    (weakTreePenalty * 18) -
    stalePenalty * 100
  ), 0, 100);

  let grade = "F";
  let tone = "danger";
  let title = "No insight signal";

  if (signalScore >= 80) {
    grade = "A";
    tone = "good";
    title = "Strong insight signal";
  } else if (signalScore >= 65) {
    grade = "B";
    tone = "info";
    title = "Useful insight signal";
  } else if (signalScore >= 45) {
    grade = "C";
    tone = "warn";
    title = "Thin but usable signal";
  } else if (signalScore > 0) {
    grade = "D";
    tone = "danger";
    title = "Weak insight signal";
  }

  const warnings: string[] = [];

  if (rankedCount === 0) warnings.push("No ranked clusters available.");
  if (lowAngleCount > 0) warnings.push(`${lowAngleCount} cluster(s) have fewer than two visible child angles.`);
  if (strongAngleCount === 0 && rankedCount > 0) warnings.push("No cluster currently exposes three or more visible child angles.");
  if (lowSourceDiversityCount > 0) warnings.push(`${lowSourceDiversityCount} cluster(s) are below source-diversity target.`);
  if (lowSnapshotCoverageCount > 0) warnings.push(`${lowSnapshotCoverageCount} cluster(s) have weak snapshot coverage.`);
  if (thinCount > 0) warnings.push(`${thinCount} cluster(s) are marked thin.`);
  if (hiddenDuplicateCount > 0) warnings.push(`${hiddenDuplicateCount} duplicate/near-duplicate item(s) were hidden or downgraded.`);
  if (isStale) warnings.push(`Source is ${sourceLabel.toLowerCase()}.`);

  if (rankedCount > 0 && signalScore === 0) title = "Weak insight signal";

  if (warnings.length === 0) warnings.push("No major diagnostic warnings.");

  return {
    grade,
    tone,
    title,
    signalScore,
    sourceLabel,
    rankedCount,
    storyCount,
    risingCount,
    thinCount,
    multiAngleCount,
    lowAngleCount,
    strongAngleCount,
    avgAngles,
    avgChildren,
    avgScore,
    eligibleSourceFamilyCounts,
    eligibleSnapshotCounts,
    visibleSourceFamilyCounts: sourceGroupCounts,
    visibleSnapshotCounts: snapshotCounts,
    sourceDiversityCoverage: rankedCount > 0 ? sourceGroupCounts.filter(count => count >= cfg.MIN_SOURCES_PER_TREE).length : 0,
    snapshotCoverage: rankedCount > 0 ? snapshotCounts.filter(count => count >= 2).length : 0,
    coverageLabel: rankedCount > 0 ? `${multiAngleCount}/${rankedCount}` : 'none',
    warnings,
  };
}

export default getInsightCoreQualityDiagnostics;
