import {
  DEFAULT_CONFIG,
  InsightConfig,
  InsightParent,
  InsightStory,
} from "../types";
import {
  comparePostTreeParentQuality,
  computePostTreeQualityScore,
  selectChildStoriesForParent,
} from "../pipeline/pipeline";
import { getInsightCoreQualityDiagnostics, getVisibleChildAngles } from "./insightCoreQuality";
import { repairInsightResult } from "./insightResultRepair";
import { applyPostClusterDeltaDedup } from "../dedup/dedup";
import { isWeakTree } from "../tree/treeBuilder";

const RECOVERY_CONFIG_OVERRIDES: Partial<InsightConfig> = {
  MIN_CHILD_INFO_GAIN: 0.08,
  WEAK_TREE_CHILD_MIN: 2,
  MIN_SOURCES_PER_TREE: 2,
  MAX_PER_SOURCE_GROUP: 3,
  MAX_PER_ANGLE: 4,
  TIER_D_EXCLUDE: false,
};

function safeArray<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : [];
}

function normalizeStoriesById(storiesById: any): Map<string, InsightStory> {
  if (storiesById instanceof Map) return storiesById;
  if (storiesById && typeof storiesById === "object") {
    return new Map(Object.entries(storiesById));
  }
  return new Map();
}

function cloneStory(story: InsightStory): InsightStory {
  return {
    ...story,
    entities: {
      people: [...(story.entities?.people || [])],
      orgs: [...(story.entities?.orgs || [])],
      places: [...(story.entities?.places || [])],
      products: [...(story.entities?.products || [])],
      symbols: [...(story.entities?.symbols || [])],
    },
    keywords: [...(story.keywords || [])],
    embedding: [...(story.embedding || [])],
    eventVerbs: [...(story.eventVerbs || [])],
    numbers: [...(story.numbers || [])],
  };
}

function cloneParent(parent: InsightParent): InsightParent {
  return {
    ...parent,
    clusterStoryIds: [...safeArray(parent.clusterStoryIds)],
    childStoryIds: [...safeArray(parent.childStoryIds)],
    hiddenDuplicateIds: [...safeArray(parent.hiddenDuplicateIds)],
    keyEntities: [...safeArray(parent.keyEntities)],
    keyPlaces: [...safeArray(parent.keyPlaces)],
    keyVerbs: [...safeArray(parent.keyVerbs)],
    keyNumbers: [...safeArray(parent.keyNumbers)],
    snapshotPresence: { ...parent.snapshotPresence },
    debug: {
      ...(parent.debug || {}),
      clusterSize: parent.debug?.clusterSize ?? parent.clusterStoryIds.length,
      hiddenCount: parent.debug?.hiddenCount ?? 0,
      matchedSnapshots: [...safeArray(parent.debug?.matchedSnapshots)],
      scoreBreakdown: { ...(parent.debug?.scoreBreakdown || {}) },
      replacements: [...safeArray(parent.debug?.replacements)],
    },
  };
}

function cloneResult(result: any) {
  const storiesById = normalizeStoriesById(result?.storiesById);
  const clonedStoriesById = new Map<string, InsightStory>();

  for (const [id, story] of storiesById.entries()) {
    clonedStoriesById.set(id, cloneStory(story));
  }

  return {
    ...result,
    parents: safeArray<InsightParent>(result?.parents).map(cloneParent),
    storiesById: clonedStoriesById,
    hiddenIds: result?.hiddenIds instanceof Set ? new Set(result.hiddenIds) : new Set<string>(),
  };
}

function getGradeRank(grade: string): number {
  return ["F", "D", "C", "B", "A"].indexOf(grade);
}

export function isInsightQualityAcceptable(diagnostics: any): boolean {
  if (!diagnostics) return false;

  const gradeOk = getGradeRank(diagnostics.grade) >= getGradeRank("C");
  const angleOk =
    Number(diagnostics.multiAngleCount || 0) >= 1 &&
    Number(diagnostics.avgAngles || 0) >= 1.4;

  return gradeOk && angleOk;
}

export function makeInsightRecoveryConfig(cfg: InsightConfig = DEFAULT_CONFIG): InsightConfig {
  return {
    ...cfg,
    ...RECOVERY_CONFIG_OVERRIDES,
  };
}

function rebuildParentTreeForRecovery(
  parent: InsightParent,
  storiesById: Map<string, InsightStory>,
  cfg: InsightConfig,
  excludedEvidence: Map<string, { reason: string; parentId: string | null }>,
  eligibleStoryIds: Set<string> | null,
  preHiddenIds: Set<string>,
  originalCfg: InsightConfig
): InsightParent {
  const admittedIds = [...new Set(safeArray(parent.clusterStoryIds))].filter(id => {
    const story = storiesById.get(id);
    if (!story || (story.parentId && story.parentId !== parent.parentId) || excludedEvidence.has(id) ||
      (eligibleStoryIds !== null && !eligibleStoryIds.has(id)) || (story as any).postClusterDeltaDedup?.hidden) return false;
    // Soft selection/cap omissions may be reconsidered only when they already
    // meet the original information-gain floor. Hard repeats never return.
    return !preHiddenIds.has(id) || (story.informationDeltaScore ?? 0) >= originalCfg.MIN_CHILD_INFO_GAIN;
  });
  parent.clusterStoryIds = admittedIds;
  parent.childStoryIds = safeArray(parent.childStoryIds).filter(id => admittedIds.includes(id));
  const clusterStories = admittedIds
    .map(id => storiesById.get(id))
    .filter(Boolean)
    .map(story => cloneStory(story as InsightStory));

  const hiddenIds = new Set<string>(preHiddenIds);
  const deduped = applyPostClusterDeltaDedup(clusterStories, hiddenIds, originalCfg);
  const children = selectChildStoriesForParent(parent, deduped, storiesById, cfg, hiddenIds);
  for (const id of hiddenIds) preHiddenIds.add(id);
  for (const child of children) preHiddenIds.delete(child.id);

  (parent.debug as any).runtimeQualityRecovery = {
    attempted: true,
    recoveryConfig: RECOVERY_CONFIG_OVERRIDES,
    childCount: children.length,
    visibleAngles: getVisibleChildAngles(parent, storiesById),
    weakTree: parent.weakTree,
  };

  return parent;
}

export function recoverInsightRuntimeQuality(
  result: any,
  source = "live",
  cfg: InsightConfig = DEFAULT_CONFIG
) {
  const firstPass = repairInsightResult(result);
  const firstDiagnostics = getInsightCoreQualityDiagnostics(firstPass, source, cfg);

  if (isInsightQualityAcceptable(firstDiagnostics)) {
    return {
      result: {
        ...firstPass,
        runtimeQualityGate: {
          attempted: false,
          recovered: false,
          reason: "first-pass acceptable",
          before: firstDiagnostics,
          after: firstDiagnostics,
        },
      },
      diagnostics: firstDiagnostics,
      gate: {
        attempted: false,
        recovered: false,
        reason: "first-pass acceptable",
      },
    };
  }

  const recoveryConfig = makeInsightRecoveryConfig(cfg);
  const recovered = cloneResult(firstPass);
  const storiesById = normalizeStoriesById(recovered.storiesById);

  const rejected = recovered.excludedEvidence instanceof Map
    ? recovered.excludedEvidence : new Map<string, { reason: string; parentId: string | null }>();
  const eligibleIds = recovered.eligibleStoryIds instanceof Set ? recovered.eligibleStoryIds as Set<string> : null;
  const preHidden = recovered.hiddenIds instanceof Set ? recovered.hiddenIds as Set<string> : new Set<string>();
  recovered.parents = safeArray<InsightParent>(recovered.parents).map(parent => (
    rebuildParentTreeForRecovery(parent, storiesById, recoveryConfig, rejected, eligibleIds, preHidden, cfg)
  ));

  recovered.parents = recovered.parents.filter(parent => parent.clusterStoryIds.length > 0);
  // Recompute weak flags against the original contract after relaxed selection.
  for (const parent of recovered.parents) {
    const children = parent.childStoryIds.map(id => storiesById.get(id)).filter(Boolean) as InsightStory[];
    parent.weakTree = isWeakTree(children, cfg);
    computePostTreeQualityScore(parent, storiesById, cfg);
  }
  recovered.parents.sort((a: InsightParent, b: InsightParent) => comparePostTreeParentQuality(a,b,storiesById,cfg));
  recovered.parents = recovered.parents.slice(0, cfg.TOP_PARENTS);
  recovered.storiesById = storiesById;

  const repairedRecovered = repairInsightResult(recovered);
  // Relax selection only, not the quality contract against which it is judged.
  const afterDiagnostics = getInsightCoreQualityDiagnostics(repairedRecovered, source, cfg);
  const recoveredOk = isInsightQualityAcceptable(afterDiagnostics);

  const runtimeQualityGate = {
    attempted: true,
    recovered: recoveredOk,
    reason: recoveredOk
      ? "relaxed-tree recovery produced acceptable output"
      : "relaxed-tree recovery could not produce acceptable output",
    before: firstDiagnostics,
    after: afterDiagnostics,
    recoveryConfig: RECOVERY_CONFIG_OVERRIDES,
  };

  return {
    result: {
      ...repairedRecovered,
      runtimeQualityGate,
    },
    diagnostics: afterDiagnostics,
    gate: runtimeQualityGate,
  };
}

export default recoverInsightRuntimeQuality;
