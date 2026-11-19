// ─────────────────────────────────────────────
//  INSIGHT TAB — Deduplication (3 Layers)
// ─────────────────────────────────────────────

import { EvolutionRole, InsightConfig, InsightStory, AngleLabel } from "../types";
import { canonicalPublisherFamily } from "../pipeline/publisherIdentity";
import { hasConflictingEventIdentity } from "../cluster/eventOccurrenceIdentity";
import { hasSharedNamedEventSignature, hasSharedTopicSignature, topicTokenOverlap } from "../cluster/topicCohesion";

// ── Duplicate diagnostics ─────────────────────────────────────────────────────

export type DuplicateDecisionReason =
  | "CANONICAL_URL_DUPLICATE"
  | "CANONICAL_TEXT_HASH_DUPLICATE"
  | "HARD_TITLE_SIMILARITY"
  | "HARD_EMBEDDING_SIMILARITY"
  | "SAME_EVENT_DUPLICATE"
  | "WEAK_ANGLE_VARIANT"
  | "SOURCE_REPEAT_DUPLICATE"
  | "USEFUL_EMBEDDING_VARIANT_RESCUED";

export interface DuplicateDecisionDiagnostic {
  hiddenId?: string;
  keptId: string;
  reason: DuplicateDecisionReason;
  score?: number;
  matchedId?: string;
  sourceGroup?: string;
  angle?: AngleLabel;
  note?: string;
}

export interface DuplicateDiagnosticsAccumulator {
  reasonCounts: Record<DuplicateDecisionReason, number>;
  decisions: DuplicateDecisionDiagnostic[];
}

export function createDuplicateDiagnostics(): DuplicateDiagnosticsAccumulator {
  return {
    reasonCounts: {
      CANONICAL_URL_DUPLICATE: 0,
      CANONICAL_TEXT_HASH_DUPLICATE: 0,
      HARD_TITLE_SIMILARITY: 0,
      HARD_EMBEDDING_SIMILARITY: 0,
      SAME_EVENT_DUPLICATE: 0,
      WEAK_ANGLE_VARIANT: 0,
      SOURCE_REPEAT_DUPLICATE: 0,
      USEFUL_EMBEDDING_VARIANT_RESCUED: 0,
    },
    decisions: [],
  };
}

function recordDuplicateDecision(
  diagnostics: DuplicateDiagnosticsAccumulator | undefined,
  reason: DuplicateDecisionReason,
  hiddenStory: InsightStory,
  keptStory: InsightStory,
  score?: number,
  matchedId?: string,
  note?: string
): void {
  if (!diagnostics) return;

  diagnostics.reasonCounts[reason] = (diagnostics.reasonCounts[reason] || 0) + 1;

  const decision: DuplicateDecisionDiagnostic = {
    hiddenId: hiddenStory.id,
    keptId: keptStory.id,
    reason,
    score,
    matchedId,
    sourceGroup: hiddenStory.sourceGroup,
    angle: hiddenStory.angle,
    note,
  };

  if (diagnostics.decisions.length < 100) {
    diagnostics.decisions.push(decision);
  }

  (hiddenStory as any).duplicateDecision = decision;
}

function getNewNumberCount(candidate: InsightStory, existing: InsightStory): number {
  const existingNumbers = new Set(existing.numbers.map(value => value.toLowerCase()));
  return candidate.numbers.filter(value => !existingNumbers.has(value.toLowerCase())).length;
}

function getIntentTokens(story: InsightStory): Set<string> {
  const text = `${story.title || ""} ${story.summary || ""}`
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ");

  const titleTokens = text
    .split(/\s+/)
    .filter(token => token.length >= 5)
    .filter(token => !/^(about|after|before|their|there|which|could|would|should|while|where|being|under|over)$/.test(token));

  return new Set([
    ...(story.eventVerbs || []).map(token => token.toLowerCase()),
    ...(story.keywords || []).map(token => token.toLowerCase()),
    ...(story.numbers || []).map(token => token.toLowerCase()),
    classifyAngle(story),
    ...titleTokens.slice(0, 8),
  ]);
}

function intentOverlap(candidate: InsightStory, existing: InsightStory): number {
  const candidateTokens = getIntentTokens(candidate);
  const existingTokens = getIntentTokens(existing);

  if (candidateTokens.size === 0 || existingTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of candidateTokens) {
    if (existingTokens.has(token)) intersection += 1;
  }

  const union = candidateTokens.size + existingTokens.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function hasDistinctStoryIntent(candidate: InsightStory, existing: InsightStory): boolean {
  const candidateTokens = getIntentTokens(candidate);
  if (candidateTokens.size < 3) return false;

  return intentOverlap(candidate, existing) <= 0.42;
}

export function shouldKeepUsefulVariantOverEmbeddingDuplicate(
  candidate: InsightStory,
  existing: InsightStory
): boolean {
  const isCrossSource = canonicalPublisherFamily(candidate) !== canonicalPublisherFamily(existing);
  if (!isCrossSource) return false;

  const isSameUrl = candidate.canonicalUrl === existing.canonicalUrl;
  const isSameTextHash = candidate.canonicalTextHash === existing.canonicalTextHash;
  if (isSameUrl || isSameTextHash) return false;

  const titleSim = titleSimilarity(candidate.title, existing.title);
  if (titleSim >= 0.92) return false;

  const candidateAngle = classifyAngle(candidate);
  const existingAngle = classifyAngle(existing);
  const hasDistinctAngle = candidateAngle !== existingAngle;
  const hasNewNumbers = getNewNumberCount(candidate, existing) > 0;
  const candidateEntitySet = new Set([
    ...(candidate.entities?.people || []),
    ...(candidate.entities?.orgs || []),
    ...(candidate.entities?.places || []),
  ].map(x => x.toLowerCase()));
  const existingEntitySet = new Set([
    ...(existing.entities?.people || []),
    ...(existing.entities?.orgs || []),
    ...(existing.entities?.places || []),
  ].map(x => x.toLowerCase()));
  let newEntities = 0;
  for (const ent of candidateEntitySet) {
    if (!existingEntitySet.has(ent)) newEntities += 1;
  }
  const hasTwoNewEntities = newEntities >= 2;

  const hasDistinctIntent = hasDistinctStoryIntent(candidate, existing);
  const hasDifferentSourcePerspective =
    canonicalPublisherFamily(candidate) !== canonicalPublisherFamily(existing) &&
    candidate.source !== existing.source &&
    titleSimilarity(candidate.title, existing.title) < 0.88;

  return hasDistinctAngle ||
    hasNewNumbers ||
    hasTwoNewEntities ||
    hasDistinctIntent ||
    hasDifferentSourcePerspective;
}

function recordUsefulVariantRescue(
  diagnostics: DuplicateDiagnosticsAccumulator | undefined,
  candidate: InsightStory,
  matchedStory: InsightStory,
  score: number
): void {
  if (!diagnostics) return;

  const reason: DuplicateDecisionReason = "USEFUL_EMBEDDING_VARIANT_RESCUED";

  diagnostics.reasonCounts[reason] = (diagnostics.reasonCounts[reason] || 0) + 1;

  const decision: DuplicateDecisionDiagnostic = {
    keptId: candidate.id,
    reason,
    score,
    matchedId: matchedStory.id,
    sourceGroup: candidate.sourceGroup,
    angle: classifyAngle(candidate),
    note: "cross-source useful variant rescued from hard embedding duplicate path",
  };

  if (diagnostics.decisions.length < 100) {
    diagnostics.decisions.push(decision);
  }

  (candidate as any).duplicateDecision = {
    ...decision,
    rescued: true,
  };
}

export function getDuplicateDiagnosticsSummary(
  diagnostics: DuplicateDiagnosticsAccumulator
): Record<DuplicateDecisionReason, number> {
  return { ...diagnostics.reasonCounts };
}

// ── Similarity helpers ────────────────────────────────────────────────────────

/**
 * Cosine similarity between two dense vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Character n-gram based title similarity (Jaccard on trigrams).
 * Lightweight proxy for edit-distance without heavy deps.
 */
export function titleSimilarity(a: string, b: string): number {
  const ngrams = (s: string, n = 3) => {
    const norm = s.toLowerCase().replace(/\s+/g, " ").trim();
    const set = new Set<string>();
    for (let i = 0; i <= norm.length - n; i++) set.add(norm.slice(i, i + n));
    return set;
  };
  const ga = ngrams(a);
  const gb = ngrams(b);
  let intersection = 0;
  for (const g of ga) if (gb.has(g)) intersection++;
  const union = ga.size + gb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Jaccard overlap of two string arrays (lowercased).
 */
function jaccardOverlap(a: string[], b: string[]): number {
  const sa = new Set(a.map(x => x.toLowerCase()));
  const sb = new Set(b.map(x => x.toLowerCase()));
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

// ── Layer A: Hard Duplicate Removal ──────────────────────────────────────────

/**
 * Returns the de-duplicated list. Hidden duplicate IDs are pushed into
 * the provided `hiddenIds` set for later surfacing in the UI.
 *
 * Winner selection: highest sourceAuthority → earliest publishedAt.
 */
export function getAngleVariantDecision(
  candidate: InsightStory,
  selectedChildren: InsightStory[]
): {
  eligible: boolean;
  reason?: DuplicateDecisionReason;
  matchedId?: string;
  metrics?: {
    entityOverlap?: number;
    numberOverlap?: number;
    titleSimilarity?: number;
    embeddingSimilarity?: number;
  };
} {
  if (selectedChildren.length === 0) return { eligible: true };

  const sameAngle = selectedChildren.filter(c => c.angle === candidate.angle);
  if (sameAngle.length === 0) return { eligible: true };

  for (const existing of sameAngle) {
    const entOverlap = entityOverlap(candidate, existing);
    const numOverlap = numberFactMatch(candidate, existing);
    const titleSim = titleSimilarity(candidate.title, existing.title);
    const embedSim = cosineSimilarity(candidate.embedding, existing.embedding);

    if (entOverlap > 0.7 && numOverlap > 0.6 && embedSim > 0.85) {
      return {
        eligible: false,
        reason: "WEAK_ANGLE_VARIANT",
        matchedId: existing.id,
        metrics: {
          entityOverlap: entOverlap,
          numberOverlap: numOverlap,
          embeddingSimilarity: embedSim,
        },
      };
    }

    if (titleSim > 0.80 && embedSim > 0.80) {
      return {
        eligible: false,
        reason: "SAME_EVENT_DUPLICATE",
        matchedId: existing.id,
        metrics: {
          titleSimilarity: titleSim,
          embeddingSimilarity: embedSim,
        },
      };
    }
  }

  return { eligible: true };
}

/**
 * Strip source-attribution / syndication tails so near-identical syndicated copies
 * canonicalize to the same title. Conservative: only removes trailing " - X" / " | X"
 * / " — X" segments and a trailing "(... )" parenthetical (e.g. "(Google)"), plus
 * common live/update prefixes. Does NOT touch the semantic body of the headline.
 */
function canonicalizeTitle(title: string): string {
  let t = String(title || "").trim();
  // drop a trailing parenthetical source tag e.g. "... - Reuters India (Google)"
  t = t.replace(/\s*\([^)]*\)\s*$/, "");
  // drop a trailing " - Source" / " | Source" / " — Source" attribution (<= 5 words)
  t = t.replace(/\s*[-|–—]\s*[A-Za-z0-9.&'’ ]{2,40}$/, "");
  return t
    .toLowerCase()
    .replace(/^(live|breaking|watch|video|update|updated)\b[:\s-]*/i, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function removeHardDuplicates(
  stories: InsightStory[],
  cfg: InsightConfig,
  hiddenIds: Set<string>,
  diagnostics: DuplicateDiagnosticsAccumulator = createDuplicateDiagnostics()
): InsightStory[] {
  const kept: InsightStory[] = [];
  const seenUrls = new Map<string, InsightStory>();
  const seenHashes = new Map<string, InsightStory>();

  // One canonical winner must be shared by retained rows and BOTH identity maps.
  // Otherwise a later authoritative duplicate only updates an index while the
  // lower-authority row remains visible to cluster/rank/child selection.
  const promote = (previous: InsightStory, winner: InsightStory, candidate: InsightStory): void => {
    if (winner !== previous) {
      const position = kept.indexOf(previous);
      if (position >= 0) kept[position] = winner;
      for (const [key, mapped] of seenUrls) if (mapped === previous) seenUrls.set(key, winner);
      for (const [key, mapped] of seenHashes) if (mapped === previous) seenHashes.set(key, winner);
    }
    if (candidate.canonicalUrl) seenUrls.set(candidate.canonicalUrl, winner);
    if (candidate.canonicalTextHash) seenHashes.set(candidate.canonicalTextHash, winner);
    if (winner.canonicalUrl) seenUrls.set(winner.canonicalUrl, winner);
    if (winner.canonicalTextHash) seenHashes.set(winner.canonicalTextHash, winner);
  };

  // Exact identity is transitive: a later URL/hash bridge can connect two
  // already-seen groups. Resolve components before fuzzy comparison so all
  // permutations retain the same authoritative representative.
  // A legacy article ID is not authoritative when two different canonical URLs
  // share it. Preserve both URLs with deterministic, collision-resistant IDs.
  const urlsById = new Map<string, Set<string>>();
  for (const story of stories) {
    if (!story.id || !story.canonicalUrl) continue;
    if (!urlsById.has(story.id)) urlsById.set(story.id, new Set());
    urlsById.get(story.id)!.add(story.canonicalUrl);
  }
  stories = stories.map(story => (urlsById.get(story.id)?.size || 0) > 1
    ? { ...story, id: `${story.id}~${encodeURIComponent(story.canonicalUrl || story.canonicalText || story.title)}` }
    : story);
  const roots = stories.map((_, index) => index);
  const find = (index: number): number => {
    while (roots[index] !== index) { roots[index] = roots[roots[index]]; index = roots[index]; }
    return index;
  };
  const identityIndex = new Map<string, number>();
  stories.forEach((story, index) => {
    for (const [prefix, value] of [["id", story.id], ["url", story.canonicalUrl], ["hash", story.canonicalTextHash]]) {
      if (!value) continue;
      const key = `${prefix}:${value}`;
      const previous = identityIndex.get(key);
      if (previous !== undefined) roots[find(index)] = find(previous);
      else identityIndex.set(key, index);
    }
  });
  const components = new Map<number, InsightStory[]>();
  stories.forEach((story, index) => {
    const key = find(index);
    if (!components.has(key)) components.set(key, []);
    components.get(key)!.push(story);
  });
  const exactWinners = [...components.values()].map(group => {
    const winner = group.reduce(pickWinner);
    for (const loser of group) {
      if (loser === winner) continue;
      if (loser.id !== winner.id) hiddenIds.add(loser.id);
      recordDuplicateDecision(diagnostics, loser.canonicalUrl === winner.canonicalUrl ? "CANONICAL_URL_DUPLICATE" : "CANONICAL_TEXT_HASH_DUPLICATE", loser, winner, 1, winner.id, "exact identity component");
    }
    return winner;
  });
  for (const story of exactWinners) {
    story.angle = classifyAngle(story);
    if (story.canonicalUrl && seenUrls.has(story.canonicalUrl)) {
      const previous = seenUrls.get(story.canonicalUrl)!;
      const winner = pickWinner(previous, story);
      const hidden = winner === story ? previous : story;

      hiddenIds.add(hidden.id);
      recordDuplicateDecision(
        diagnostics,
        "CANONICAL_URL_DUPLICATE",
        hidden,
        winner,
        1,
        previous.id,
        "same canonical URL"
      );

      promote(previous, winner, story);
      continue;
    }

    if (story.canonicalTextHash && seenHashes.has(story.canonicalTextHash)) {
      const previous = seenHashes.get(story.canonicalTextHash)!;
      const winner = pickWinner(previous, story);
      const hidden = winner === story ? previous : story;

      hiddenIds.add(hidden.id);
      recordDuplicateDecision(
        diagnostics,
        "CANONICAL_TEXT_HASH_DUPLICATE",
        hidden,
        winner,
        1,
        previous.id,
        "same canonical text hash"
      );

      promote(previous, winner, story);
      continue;
    }

    // Syndication near-duplicate (cross-source): the same wire story republished by
    // multiple feeds differs only by a source-attribution suffix, so it bypasses the
    // URL and hash layers and — being a DIFFERENT sourceGroup — also bypasses the
    // same-group title layer below, leaving the user with visible duplicates (recall
    // leak measured at ~0.42 on real snapshots). Canonicalize the title (strip the
    // syndication tail) and match at the SAME strict HARD_DUP_TITLE_SIM bar, with a
    // length guard so short/generic headlines can't collide. Precision is protected
    // by the 0.96 bar; this only adds recall, never lowers a threshold.
    const canonTitle = canonicalizeTitle(story.title);
    const syndicationMatch = canonTitle.length >= 20
      ? kept.find(k => !hasConflictingEventIdentity(k, story) && titleSimilarity(canonicalizeTitle(k.title), canonTitle) >= cfg.HARD_DUP_TITLE_SIM)
      : undefined;
    if (syndicationMatch) {
      const score = titleSimilarity(canonicalizeTitle(syndicationMatch.title), canonTitle);
      const winner = pickWinner(syndicationMatch, story);
      const hidden = winner === story ? syndicationMatch : story;

      hiddenIds.add(hidden.id);
      recordDuplicateDecision(
        diagnostics,
        "HARD_TITLE_SIMILARITY",
        hidden,
        winner,
        score,
        syndicationMatch.id,
        `cross-source syndication: canonical title similarity >= ${cfg.HARD_DUP_TITLE_SIM}`
      );

      promote(syndicationMatch, winner, story);
      continue;
    }

    const sameGroupMatch = kept.find(
      k => !hasConflictingEventIdentity(k, story) &&
           canonicalPublisherFamily(k) === canonicalPublisherFamily(story) &&
           titleSimilarity(k.title, story.title) >= cfg.HARD_DUP_TITLE_SIM
    );
    if (sameGroupMatch) {
      const score = titleSimilarity(sameGroupMatch.title, story.title);
      const winner = pickWinner(sameGroupMatch, story);
      const hidden = winner === story ? sameGroupMatch : story;

      hiddenIds.add(hidden.id);
      recordDuplicateDecision(
        diagnostics,
        "HARD_TITLE_SIMILARITY",
        hidden,
        winner,
        score,
        sameGroupMatch.id,
        `title similarity >= ${cfg.HARD_DUP_TITLE_SIM}`
      );

      promote(sameGroupMatch, winner, story);
      continue;
    }

    const embedMatch = kept.find(
      k => !hasConflictingEventIdentity(k, story) &&
        canonicalPublisherFamily(k) === canonicalPublisherFamily(story) &&
        cosineSimilarity(k.embedding, story.embedding) >= cfg.HARD_DUP_EMBED_SIM
    );
    if (embedMatch) {
      const score = cosineSimilarity(embedMatch.embedding, story.embedding);

      if (shouldKeepUsefulVariantOverEmbeddingDuplicate(story, embedMatch)) {
        recordUsefulVariantRescue(
          diagnostics,
          story,
          embedMatch,
          score
        );

        if (story.canonicalUrl) seenUrls.set(story.canonicalUrl, story);
        if (story.canonicalTextHash) seenHashes.set(story.canonicalTextHash, story);
        kept.push(story);
        continue;
      }

      const winner = pickWinner(embedMatch, story);
      const hidden = winner === story ? embedMatch : story;

      hiddenIds.add(hidden.id);
      recordDuplicateDecision(
        diagnostics,
        "HARD_EMBEDDING_SIMILARITY",
        hidden,
        winner,
        score,
        embedMatch.id,
        `embedding similarity >= ${cfg.HARD_DUP_EMBED_SIM}`
      );

      promote(embedMatch, winner, story);
      continue;
    }

    const crossSourceEmbedMatch = kept.find(
      k => !hasConflictingEventIdentity(k, story) &&
        canonicalPublisherFamily(k) !== canonicalPublisherFamily(story) &&
        cosineSimilarity(k.embedding, story.embedding) >= cfg.HARD_DUP_EMBED_SIM
    );
    if (
      crossSourceEmbedMatch &&
      shouldKeepUsefulVariantOverEmbeddingDuplicate(story, crossSourceEmbedMatch)
    ) {
      recordUsefulVariantRescue(
        diagnostics,
        story,
        crossSourceEmbedMatch,
        cosineSimilarity(crossSourceEmbedMatch.embedding, story.embedding)
      );
    }

    if (story.canonicalUrl) seenUrls.set(story.canonicalUrl, story);
    if (story.canonicalTextHash) seenHashes.set(story.canonicalTextHash, story);
    kept.push(story);
  }

  // The ledger identifies excluded records, never the retained identity.
  for (const story of kept) hiddenIds.delete(story.id);
  return kept;
}

export const PROTECTED_EVOLUTION_ROLES = new Set<EvolutionRole>([
  "fact_update",
  "cause_claim",
  "cause_confirmed",
  "official_response",
  "market_reaction",
  "investigation",
  "legal_or_regulatory",
  "accountability",
]);

function isProtectedEvolutionStory(story: InsightStory): boolean {
  return Boolean(story.evolutionRole && PROTECTED_EVOLUTION_ROLES.has(story.evolutionRole));
}

function isLowDeltaRepeat(candidate: InsightStory, keptStory: InsightStory): boolean {
  if (isProtectedEvolutionStory(candidate)) return false;
  if (candidate.informationDeltaScore === undefined) return false;

  const sameRole = candidate.evolutionRole === keptStory.evolutionRole;
  const sameSourceGroup = canonicalPublisherFamily(candidate) === canonicalPublisherFamily(keptStory);
  const titleSim = titleSimilarity(candidate.title, keptStory.title);
  const embedSim = cosineSimilarity(candidate.embedding, keptStory.embedding);

  return candidate.informationDeltaScore < 0.10 &&
    sameRole &&
    (sameSourceGroup || titleSim >= 0.84 || embedSim >= 0.92);
}

/**
 * Removes post-cluster repeats only after temporal role and information-delta
 * fields are populated. Inputs are one event cluster and hidden-id state; output
 * is the kept cluster while protected evolution roles always survive.
 */
export function applyPostClusterDeltaDedup(
  stories: InsightStory[],
  hiddenIds: Set<string>,
  cfg: InsightConfig
): InsightStory[] {
  const sorted = [...stories]
    .sort((a, b) => {
      if (a.publishedAt !== b.publishedAt) return a.publishedAt - b.publishedAt;
      return b.sourceAuthority - a.sourceAuthority || String(a.id).localeCompare(String(b.id));
    });
  const kept: InsightStory[] = [];

  for (const story of sorted) {
    const repeated = kept.find(keptStory => isLowDeltaRepeat(story, keptStory));
    if (repeated) {
      hiddenIds.add(story.id);
      (story as any).postClusterDeltaDedup = {
        hidden: true,
        keptId: repeated.id,
        informationDeltaScore: story.informationDeltaScore,
        evolutionRole: story.evolutionRole,
      };
      continue;
    }

    kept.push(story);
  }

  return kept;
}

function pickWinner(a: InsightStory, b: InsightStory): InsightStory {
  if (a.sourceAuthority !== b.sourceAuthority)
    return a.sourceAuthority > b.sourceAuthority ? a : b;
  if (a.publishedAt !== b.publishedAt) return a.publishedAt < b.publishedAt ? a : b;
  const idOrder = String(a.id).localeCompare(String(b.id));
  if (idOrder) return idOrder < 0 ? a : b;
  const stableKey = (story: InsightStory) => JSON.stringify([story.canonicalUrl, story.canonicalTextHash, story.title, story.summary, story.sourceGroup]);
  return stableKey(a).localeCompare(stableKey(b)) <= 0 ? a : b;
}

// ── Layer B: Event Similarity (for clustering) ────────────────────────────────

/**
 * Composite event similarity score used for clustering decisions.
 * Returns a value 0..1.
 */
export function eventSimilarity(a: InsightStory, b: InsightStory): number {
  const embSim    = cosineSimilarity(a.embedding, b.embedding);
  const entSim    = entityOverlap(a, b);
  const verbSim   = verbMatch(a, b);
  const numSim    = numberFactMatch(a, b);
  const timeSim   = timeProximity(a, b);
  const placeSim  = jaccardOverlap(a.entities.places, b.entities.places);
  const catSim    = a.category && b.category && a.category === b.category ? 1 : 0;
  const topicSim  = topicTokenOverlap(a, b);

  return (
    0.24 * embSim  +
    0.17 * entSim  +
    0.12 * verbSim +
    0.09 * numSim  +
    0.09 * timeSim +
    0.08 * placeSim +
    0.05 * catSim +
    0.16 * topicSim
  );
}

function entityOverlap(a: InsightStory, b: InsightStory): number {
  const orgs    = jaccardOverlap(a.entities.orgs, b.entities.orgs);
  const people  = jaccardOverlap(a.entities.people, b.entities.people);
  const products = jaccardOverlap(a.entities.products, b.entities.products);
  // orgs carry most weight for event identity
  return 0.5 * orgs + 0.3 * people + 0.2 * products;
}

function verbMatch(a: InsightStory, b: InsightStory): number {
  if (!a.eventVerbs.length || !b.eventVerbs.length) return 0;
  return jaccardOverlap(a.eventVerbs, b.eventVerbs);
}

function numberFactMatch(a: InsightStory, b: InsightStory): number {
  if (!a.numbers.length || !b.numbers.length) return 0;
  return jaccardOverlap(a.numbers, b.numbers);
}

function timeProximity(a: InsightStory, b: InsightStory): number {
  const diffMs = Math.abs(a.publishedAt - b.publishedAt);
  const diffH  = diffMs / (60 * 60 * 1000);
  if (diffH <= 1)  return 1.0;
  if (diffH <= 4)  return 0.8;
  if (diffH <= 12) return 0.6;
  if (diffH <= 24) return 0.3;
  return 0.0;
}

/**
 * Rule-based overrides applied on top of the similarity score.
 */
export function applyClusterOverrides(
  a: InsightStory,
  b: InsightStory,
  rawSim: number,
  cfg: InsightConfig
): "SAME" | "DIFFERENT" | "USE_SCORE" {
  // An explicitly distinct occurrence is not the same event, even when
  // organization, location, action and syndicated topical language all match.
  if (hasConflictingEventIdentity(a, b)) return "DIFFERENT";

  // Force SAME
  const sameOrgs   = a.entities.orgs.some(o => b.entities.orgs.includes(o));
  const sameVerbs  = a.eventVerbs.some(v => b.eventVerbs.includes(v));
  const within24h  = Math.abs(a.publishedAt - b.publishedAt) < 24 * 60 * 60 * 1000;
  const sameRegion = jaccardOverlap(a.entities.places, b.entities.places) > 0.4;

  if (sameOrgs && sameVerbs && within24h && sameRegion) return "SAME";

  // topic cohesion cluster override
  const sharedTopic = hasSharedTopicSignature(a, b);
  const topicOverlapScore = topicTokenOverlap(a, b);
  const crossSource = canonicalPublisherFamily(a) !== canonicalPublisherFamily(b);
  const within36h = Math.abs(a.publishedAt - b.publishedAt) < 36 * 60 * 60 * 1000;
  const categoryCompatible = !a.category || !b.category || a.category === b.category || rawSim >= cfg.POSSIBLE_EVENT_THRESHOLD;

  // Recover sparse-vector reports of an explicitly named event, including
  // genuine follow-ups by the same publisher. This grants no extra publisher
  // independence and never bypasses the occurrence-conflict veto above.
  if (within36h && hasSharedNamedEventSignature(a, b)) return "SAME";

  if (
    sharedTopic &&
    crossSource &&
    within36h &&
    (categoryCompatible || topicOverlapScore >= 0.30) &&
    (rawSim >= cfg.POSSIBLE_EVENT_THRESHOLD - 0.12 || topicOverlapScore >= 0.30)
  ) {
    return "SAME";
  }

  // Force DIFFERENT
  if (
    sameOrgs &&
    a.eventVerbs.length > 0 &&
    b.eventVerbs.length > 0 &&
    jaccardOverlap(a.eventVerbs, b.eventVerbs) < 0.1 // clearly different actions
  ) return "DIFFERENT";

  // Same org, unrelated categories
  if (
    sameOrgs &&
    a.category && b.category &&
    a.category !== b.category &&
    rawSim < cfg.POSSIBLE_EVENT_THRESHOLD
  ) return "DIFFERENT";

  return "USE_SCORE";
}

// ── Layer C: Angle Deduplication ─────────────────────────────────────────────

const OFFICIAL_SIGNALS = [
  /spokesperson/i, /minister/i, /official statement/i, /company said/i,
  /regulator said/i, /police confirmed/i, /government said/i, /\bmea\b/i,
  /secretary/i, /chairman/i, /ceo said/i, /officially announced/i,
  /government announced/i, /ministry announced/i, /regulator announced/i,
  /officials? said/i, /authorities said/i, /court said/i, /rbi said/i,
  /sebi said/i, /central bank said/i, /white house said/i,
  /according to the ministry/i, /according to officials/i,
  /deputy pm/i, /prime minister/i, /\bpm\s+modi\b/i,
  /\bpm\s+(asks|urges|says|said)\b/i, /ministries/i,
  /govt departments/i, /cabinet colleagues/i,
];

const MARKET_SIGNALS = [
  /shares rose/i, /shares fell/i, /stock (up|down)/i, /yields moved/i,
  /futures (dropped|rose)/i, /crypto (rally|fell)/i, /market reaction/i,
  /\bnifty\b/i, /\bsensex\b/i, /\bbse\b/i, /\bnse\b/i, /\bintraday\b/i,
  /stocks? (rallied|slumped|gained|lost|jumped|dropped)/i,
  /investors? (cheered|sold|bought|reacted)/i,
  /bond yields?/i,
];

const FACT_UPDATE_SIGNALS = [
  /toll (rises?|climbs?) to/i, /revised estimate/i, /updated count/i,
  /latest figures/i, /now confirmed/i, /figures updated/i,
  /new data/i, /updated figures/i,
  /latest update/i, /new figures/i, /fresh data/i,
  /according to data/i, /data showed/i, /report showed/i,
  /confirmed cases/i, /death toll/i, /casualty count/i,
  /\b\d+\s+(children|people|persons|killed|dead|injured|missing)\b/i,
  /\b(children|people|persons)\s+among\s+\d+\s+(killed|dead|injured|missing)\b/i,
  // NOTE: "correction:" deliberately removed — it belongs in CORRECTION_SIGNALS only
];

const EXPERT_SIGNALS = [
  /analysts? (say|warn|note)/i, /experts? (warn|say)/i, /economists? (note|say)/i,
  /think tank/i, /commentary/i, /\bcrisil\b/i, /\bficci\b/i, /\bcii\b/i, /\bimf\b/i,
  /analysis/i, /explained by/i, /what experts say/i,
  /why it matters/i, /what it means/i, /implications/i,
  /strategists? said/i, /researchers? said/i,
];

const CORRECTION_SIGNALS = [
  /corrected/i, /clarified/i, /amended/i, /debunked/i, /false claim/i,
  /update:/i, /editor'?s? note/i,
];

const REGIONAL_SIGNALS = [
  /local impact/i, /state government of/i, /city council/i,
  /chennai/i, /trichy/i, /tamil nadu government/i,
  /muscat/i, /local authorities/i,
  /statewide/i, /in the state/i, /in the city/i,
  /chennai bureau/i, /trichy correspondent/i, /muscat desk/i,
  /district collector/i,
];

const INVESTIGATIVE_SIGNALS = [
  /investigation/i, /leaked/i, /exclusive/i, /document shows/i,
  /sources say/i, /whistleblower/i,
  /records show/i, /documents reveal/i, /internal memo/i,
  /probe/i, /inquiry/i, /audit found/i, /obtained by/i,
];

const PUBLIC_REACTION_SIGNALS = [
  /public reaction/i, /people reacted/i, /residents said/i,
  /citizens said/i, /users reacted/i, /social media/i,
  /went viral/i, /trending/i, /protesters/i, /protests erupted/i,
  /backlash/i, /criticism/i, /praised by/i, /condemned by/i,
  /families said/i, /locals said/i,
];

const BACKGROUND_CONTEXT_SIGNALS = [
  /background/i, /explainer/i, /timeline/i, /what happened/i,
  /how it started/i, /why this matters/i, /what led to/i,
  /history of/i, /context/i, /key points/i, /all you need to know/i,
  /five things to know/i, /things to know/i,
];
const OPINION_EDITORIAL_SIGNALS = [
  /\bopinion\b/i, /\beditorial\b/i, /\bcolumn\b/i, /\bview:\b/i, /\bop-ed\b/i,
];

function countSignalMatches(patterns: RegExp[], text: string): number {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

function normalizeAngleCandidateScore(score: number): number {
  return Math.max(0, Math.round(score * 1000) / 1000);
}

function getSourceAndCategoryText(story: InsightStory): string {
  return [
    story.source,
    story.sourceGroup,
    story.category,
    story.region,
    story.language,
  ].filter(Boolean).join(" ").toLowerCase();
}

function getAngleCandidateScores(story: InsightStory, text: string): Array<{
  angle: AngleLabel;
  score: number;
  reason: string;
}> {
  const sourceAndCategory = getSourceAndCategoryText(story);
  const lowerText = text.toLowerCase();
  const scores: Array<{ angle: AngleLabel; score: number; reason: string }> = [];

  const collectorAngleHints = Array.isArray((story as any).angleHints)
    ? (story as any).angleHints
    : Array.isArray((story as any).storySignals?.angleHints)
      ? (story as any).storySignals.angleHints
      : [];

  for (const hint of collectorAngleHints) {
    const angle = typeof hint === "string" ? hint : hint?.angle;
    if (!angle || angle === "unknown") continue;
    if (angle === "base_report") continue;

    const rawScore = typeof hint === "string" ? 0.5 : Number(hint?.score || 0.5);
    scores.push({
      angle: angle as AngleLabel,
      score: normalizeAngleCandidateScore(3.0 + Math.max(0, Math.min(1, rawScore)) * 2.2),
      reason: "collector JSON angle hint",
    });
  }

  const correctionScore = countSignalMatches(CORRECTION_SIGNALS, text);
  if (correctionScore > 0) {
    scores.push({
      angle: "correction",
      score: normalizeAngleCandidateScore(4 + correctionScore),
      reason: "correction/update language",
    });
  }

  const factScore = countSignalMatches(FACT_UPDATE_SIGNALS, text);
  const numberScore = Math.min(2, (story.numbers || []).length * 0.35);
  const casualtyNumberScore = /\b\d+\b.*\b(killed|dead|injured|missing)\b/i.test(text) ||
    /\b(killed|dead|injured|missing)\b.*\b\d+\b/i.test(text)
    ? 0.8
    : 0;
  if (factScore > 0 || numberScore >= 0.7 || casualtyNumberScore > 0) {
    scores.push({
      angle: "fact_update",
      score: normalizeAngleCandidateScore(2.2 + factScore + numberScore + casualtyNumberScore),
      reason: "new numbers or updated facts",
    });
  }

  const officialScore = countSignalMatches(OFFICIAL_SIGNALS, text);
  const officialSourceScore = /government|ministry|minister|regulator|police|court|rbi|sebi|official|authority|company|press/.test(sourceAndCategory) ? 0.9 : 0;
  const saidScore = /\b(said|says|announced|confirmed|statement|approved|rejected|clarified|warned|urged|urges|asked|asks)\b/i.test(text) ? 0.55 : 0;
  if (officialScore > 0 || officialSourceScore > 0 || saidScore > 0) {
    scores.push({
      angle: "official_response",
      score: normalizeAngleCandidateScore(1.5 + officialScore + officialSourceScore + saidScore),
      reason: "official or institutional response",
    });
  }

  const marketScore = countSignalMatches(MARKET_SIGNALS, text);
  const marketCategoryScore = story.sectionDomain === "business" ||
    /business|market|finance|stocks|economy|money|crypto/.test(String(story.category || "").toLowerCase())
    ? 0.75
    : 0;
  if (marketScore > 0 || marketCategoryScore > 0) {
    scores.push({
      angle: "market_reaction",
      score: normalizeAngleCandidateScore(1.6 + marketScore + marketCategoryScore),
      reason: "market/business reaction",
    });
  }

  const expertScore = countSignalMatches(EXPERT_SIGNALS, text);
  const expertTextScore = /\b(analysis|analyst|expert|economist|researcher|strategist|explains?|why it matters|implications)\b/i.test(text) ? 0.85 : 0;
  if (expertScore > 0 || expertTextScore > 0) {
    scores.push({
      angle: "expert_analysis",
      score: normalizeAngleCandidateScore(1.7 + expertScore + expertTextScore),
      reason: "expert analysis language",
    });
  }

  const investigativeScore = countSignalMatches(INVESTIGATIVE_SIGNALS, text);
  if (investigativeScore > 0) {
    scores.push({
      angle: "investigative_detail",
      score: normalizeAngleCandidateScore(1.8 + investigativeScore),
      reason: "investigative/source-detail language",
    });
  }

  const regionalScore = countSignalMatches(REGIONAL_SIGNALS, text);
  const regionalEntityScore = (story.entities?.places || []).length > 0 && /local|city|state|district|regional|chennai|trichy|tamil nadu|muscat|oman/i.test(text)
    ? 0.75
    : 0;
  if (regionalScore > 0 || regionalEntityScore > 0) {
    scores.push({
      angle: "regional_followup",
      score: normalizeAngleCandidateScore(1.5 + regionalScore + regionalEntityScore),
      reason: "regional/local follow-up",
    });
  }

  const reactionScore = countSignalMatches(PUBLIC_REACTION_SIGNALS, text);
  const socialScore = /\b(backlash|viral|trending|users|residents|families|locals|public|protest|criticism|praised|condemned)\b/i.test(text) ? 0.9 : 0;
  if (reactionScore > 0 || socialScore > 0) {
    scores.push({
      angle: "reaction_public",
      score: normalizeAngleCandidateScore(1.6 + reactionScore + socialScore),
      reason: "public/social reaction",
    });
  }

  const backgroundScore = countSignalMatches(BACKGROUND_CONTEXT_SIGNALS, text);
  const explainerScore = /\b(explainer|timeline|background|context|what happened|what led|key points|things to know|why this matters)\b/i.test(lowerText) ? 1 : 0;
  if (backgroundScore > 0 || explainerScore > 0) {
    scores.push({
      angle: "background_context",
      score: normalizeAngleCandidateScore(1.4 + backgroundScore + explainerScore),
      reason: "background/explainer context",
    });
  }
  const opinionScore = countSignalMatches(OPINION_EDITORIAL_SIGNALS, text);
  if (opinionScore > 0) {
    scores.push({
      angle: "opinion_editorial",
      score: normalizeAngleCandidateScore(1.4 + opinionScore),
      reason: "opinion/editorial labeling",
    });
  }

  return scores;
}

function getAngleSignalText(story: InsightStory): string {
  return `${story.title || ""} ${story.summary || ""}`.trim();
}

function deriveAngleFromEvolutionRole(role: EvolutionRole | undefined): AngleLabel | null {
  switch (role) {
    case "fact_update":
      return "fact_update";
    case "market_reaction":
      return "market_reaction";
    case "official_response":
      return "official_response";
    case "legal_or_regulatory":
    case "investigation":
    case "accountability":
      return "investigative_detail";
    case "background_context":
      return "background_context";
    case "public_reaction":
      return "reaction_public";
    default:
      return null;
  }
}

function getEvolutionRoleAngleFallback(story: InsightStory): AngleLabel | null {
  const fallbackAngle = deriveAngleFromEvolutionRole(story.evolutionRole);
  if (!fallbackAngle) return null;

  (story as any).angleReason = "evolution role fallback: " + story.evolutionRole;
  (story as any).angleConfidence = Math.max(
    0.55,
    Math.min(0.72, Number(story.evolutionRoleConfidence || 0.62))
  );

  return fallbackAngle;
}

/**
 * Classify a story's angle within a parent cluster.
 */
export function classifyAngle(story: InsightStory): AngleLabel {
  const text = getAngleSignalText(story);
  const candidates = getAngleCandidateScores(story, text)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.angle.localeCompare(b.angle);
    });

  const best = candidates[0];

  if (best && best.score >= 0.9) {
    (story as any).angleReason = best.reason;
    (story as any).angleConfidence = Math.min(1, best.score / 5);
    return best.angle;
  }

  // Secondary regex fallbacks. Weak signals (market, regional) require 2+ matches
  // to avoid mis-labelling stories that merely mention a market or place in passing.
  if (CORRECTION_SIGNALS.some(p => p.test(text)))           return "correction";
  if (FACT_UPDATE_SIGNALS.some(p => p.test(text)))          return "fact_update";
  if (OFFICIAL_SIGNALS.some(p => p.test(text)))             return "official_response";
  if (MARKET_SIGNALS.filter(p => p.test(text)).length >= 2) return "market_reaction";
  if (EXPERT_SIGNALS.some(p => p.test(text)))               return "expert_analysis";
  if (INVESTIGATIVE_SIGNALS.some(p => p.test(text)))        return "investigative_detail";
  if (REGIONAL_SIGNALS.filter(p => p.test(text)).length >= 2) return "regional_followup";
  if (PUBLIC_REACTION_SIGNALS.some(p => p.test(text)))      return "reaction_public";
  if (BACKGROUND_CONTEXT_SIGNALS.some(p => p.test(text)))   return "background_context";
  if (OPINION_EDITORIAL_SIGNALS.some(p => p.test(text)))    return "opinion_editorial";

  if (candidates.length >= 2) {
    const topTwo = candidates.slice(0, 2);
    const composite = topTwo[0].score + topTwo[1].score;
    if (topTwo[0].score < 0.9 && topTwo[1].score < 0.9 && composite >= 1.6) {
      return topTwo[0].angle;
    }
  }

  const roleFallback = getEvolutionRoleAngleFallback(story);
  if (roleFallback) return roleFallback;

  (story as any).angleReason = "base event report fallback";
  (story as any).angleConfidence = 0.35;
  return "base_report";
}

/**
 * Determine whether a story adds genuinely new information over stories
 * already selected into the tree (angle-level dedup).
 * Returns true if the story should be ELIGIBLE, false if it's an angle duplicate.
 */
export function isAngleVariant(
  candidate: InsightStory,
  selectedChildren: InsightStory[]
): boolean {
  return getAngleVariantDecision(candidate, selectedChildren).eligible;
}
