// ─────────────────────────────────────────────
//  INSIGHT TAB — Story Normalization
// ─────────────────────────────────────────────

import {
  InsightConfig,
  InsightStory,
  RawStory,
  SnapshotSlot,
  SourceContentDomain,
  SourceDistributionType,
  SourceTier,
} from "../types";

import { canonicalPublisherFamily } from "./publisherIdentity";

// ── Source tier registry ──────────────────────────────────────────────────────

const TIER_MAP: Record<string, SourceTier> = {
  // Tier A - highest authority, including business sources that add domain perspective.
  reuters:             "A", ap:                "A", bbc:              "A",
  bloomberg:           "A", ft:                "A", "financial express": "A",
  "the hindu":         "A", hindu:             "A", the_hindu: "A",
  economic_times:      "A", business_line:     "A", ndtv_profit:      "A",
  financial_express:   "A", mint:              "A", indian_express: "A", dw: "A",

  // Tier B
  ndtv:                "B", toi:               "B", "times of india": "B", times_of_india: "B",
  moneycontrol:        "B", cnbc:              "B", "oman observer":  "B",
  hindustan_times:     "B", india_today:       "B", oman_observer: "B", al_jazeera: "B",
  ars_technica: "B", the_arabian_stories: "B",

  // Tier C — admitted only as fallback
  // (everything else defaults to C)
};

const CLICKBAIT_PATTERNS = [
  /you won'?t believe/i,
  /shocking(ly)?/i,
  /goes viral/i,
  /breaks the internet/i,
  /this changes everything/i,
  /\bOMG\b/,
  /^\d+ (things|reasons|ways) /i,
];

const TIER_AUTHORITY: Record<SourceTier, number> = {
  A: 1.0, B: 0.75, C: 0.45, D: 0.0,
};

const SOURCE_DISTRIBUTION_MAP: Record<string, SourceDistributionType> = {
  pti: "wire", ani: "wire", ap: "wire", reuters: "wire",
  economic_times: "publisher", business_line: "publisher", ndtv_profit: "publisher",
  financial_express: "publisher", mint: "publisher", bloomberg: "publisher",
  indian_express: "publisher", al_jazeera: "publisher",
  dw: "publisher", ars_technica: "publisher", the_arabian_stories: "publisher",
  moneycontrol: "publisher", ft: "publisher", the_hindu: "publisher",
  "the hindu": "publisher", hindu: "publisher", ndtv: "publisher",
  toi: "publisher", times_of_india: "publisher", "times of india": "publisher",
  hindustan_times: "publisher", bbc: "publisher", india_today: "publisher",
  gadgets360: "publisher", espn: "publisher", google_news: "aggregator",
};

const SOURCE_CONTENT_DOMAIN_MAP: Record<string, SourceContentDomain> = {
  economic_times: "business", business_line: "business",
  ndtv_profit: "business", financial_express: "business",
  "financial express": "business", mint: "business", bloomberg: "business",
  moneycontrol: "business", ft: "business", gadgets360: "tech",
  espn: "sports", the_hindu: "general", "the hindu": "general",
  hindu: "general", ndtv: "general", toi: "general",
  times_of_india: "general", "times of india": "general", bbc: "general",
  hindustan_times: "general", india_today: "general", reuters: "general",
  pti: "general", ani: "general", ap: "general",
  dw: "general", ars_technica: "tech", the_arabian_stories: "regional",
};

const SECTION_DOMAIN_MAP: Record<string, SourceContentDomain> = {
  business: "business", markets: "business", finance: "business",
  economy: "business", stocks: "business", investing: "business",
  tech: "tech", technology: "tech", science: "tech",
  sports: "sports", cricket: "sports", football: "sports",
  opinion: "opinion", editorial: "opinion", "op-ed": "opinion", oped: "opinion",
  legal: "legal", courts: "legal", law: "legal",
  cities: "regional", state: "regional", local: "regional", regional: "regional",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getSourceTier(sourceGroup: string): SourceTier {
  const key = canonicalPublisherFamily(sourceGroup);
  return TIER_MAP[key] ?? TIER_MAP[sourceGroup.toLowerCase().trim()] ?? "C";
}

export function getSourceDistributionType(sourceGroup: string): SourceDistributionType {
  return SOURCE_DISTRIBUTION_MAP[canonicalPublisherFamily(sourceGroup)] ?? "unknown";
}

export function getSourceContentDomain(
  sourceGroup: string,
  category?: string
): SourceContentDomain {
  if (category) {
    const rawCategory = category.toLowerCase().trim();
    const compactCategory = rawCategory.replace(/[^a-z]/g, "");
    const fromCategory = SECTION_DOMAIN_MAP[compactCategory] ?? SECTION_DOMAIN_MAP[rawCategory];
    if (fromCategory) return fromCategory;
  }

  const sourceKey = canonicalPublisherFamily(sourceGroup);
  const fromSource = SOURCE_CONTENT_DOMAIN_MAP[sourceKey];
  if (fromSource) return fromSource;

  const regional = /chennai|mumbai|delhi|bengaluru|kolkata|hyderabad|pune|tamil|kerala|andhra|telangana|rajasthan|gujarat|odisha|oman|muscat/i;
  if (regional.test(sourceGroup)) return "regional";

  return "general";
}

export function computeTrustScore(
  tier: SourceTier,
  distributionType: SourceDistributionType
): number {
  const base = TIER_AUTHORITY[tier];
  const wireBonus = distributionType === "wire" ? -0.1 : 0;
  return Math.max(0, Math.min(1, base + wireBonus));
}

export function isDiversityProtectedTierC(
  story: InsightStory,
  higherTierStories: InsightStory[]
): boolean {
  if (story.sourceTier !== "C") return false;
  // Another label for the same origin is not an independent angle.
  if (higherTierStories.some(item => canonicalPublisherFamily(item) === canonicalPublisherFamily(story))) return false;

  if (["business", "regional", "tech", "legal", "official"].includes(story.sourceContentDomain)) {
    return true;
  }

  const higherTierDomains = new Set(
    higherTierStories.map(item => item.sourceContentDomain).filter(Boolean)
  );
  return Boolean(story.sourceContentDomain && !higherTierDomains.has(story.sourceContentDomain));
}

export function isTierD(story: RawStory): boolean {
  // No byline signal (can be extended with actual byline field)
  const title = story.title ?? "";
  if (CLICKBAIT_PATTERNS.some(p => p.test(title))) return true;
  if (!story.source || story.source.trim() === "") return true;
  return false;
}

/**
 * Recency decay: smooth curve, not binary cutoff.
 */
export function computeFreshnessScore(publishedAt: number, referenceTime?: number): number {
  const refTime = referenceTime ?? Date.now();
  const ageHours = (refTime - publishedAt) / (60 * 60 * 1000);
  if (ageHours < 0) return 1.0;
  return Math.exp((-0.693 * ageHours) / 6); // 6h half-life
}

export function computeRawProminence(raw: RawStory): number {
  if (typeof raw.feedPosition !== "number" || typeof raw.feedLength !== "number" || raw.feedLength <= 0) {
    return 0.5;
  }
  const prominence = 1 - (raw.feedPosition / raw.feedLength);
  return Math.max(0, Math.min(1, prominence));
}

/**
 * Simple canonical URL: strip query params used for tracking.
 */
export function canonicalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    if (!["http:", "https:"].includes(u.protocol) || u.username || u.password) return "";
    if (u.hostname === "news.google.com" && u.searchParams.has("url")) {
      const target = new URL(u.searchParams.get("url")!);
      if (target.hostname !== "news.google.com" && ["http:", "https:"].includes(target.protocol)) return canonicalizeUrl(target.href);
    }
    u.hash = "";
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    const tracking = new Set(["utm", "at_campaign", "at_medium", "cmpid", "fbclid", "gclid", "mc_cid", "mc_eid", "msclkid", "_ga"]);
    for (const key of [...u.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_") || tracking.has(key.toLowerCase()) || (u.hostname === "news.google.com" && key === "oc")) u.searchParams.delete(key);
    }
    u.searchParams.sort();
    u.pathname = u.pathname.replace(/\/amp\/?$/i, "").replace(/\/amp\//g, "/").replace(/\/$/, "") || "/";
    return u.href;
  } catch {
    return "";
  }
}

/**
 * Fast 32-bit hash for dedup comparison.
 */
export function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16);
}

/**
 * Normalize title+summary into a canonical text for hashing/comparison.
 */
export function makeCanonicalText(title: string, summary: string): string {
  return (title + " " + summary)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Heuristic factual density: ratio of entity+number tokens to total words.
 */
export function computeFactualDensity(story: RawStory, numbers: string[], entities: string[]): number {
  const words = (story.title + " " + story.summary).split(/\s+/).length;
  const signals = numbers.length + entities.length;
  return Math.min(1, signals / Math.max(1, words / 5));
}

/**
 * Summary quality: penalize very short or very long summaries.
 */
export function computeSummaryQuality(summary: string): number {
  const words = summary.split(/\s+/).length;
  if (words < 10) return 0.3;
  if (words < 20) return 0.6;
  if (words <= 80) return 1.0;
  if (words <= 120) return 0.8;
  return 0.5;
}

// ── Main normalizer ───────────────────────────────────────────────────────────

/**
 * Converts a RawStory into a full InsightStory with all scoring fields.
 * Embedding must be injected externally (e.g. from an embeddings service).
 */
export function normalizeStory(
  raw: RawStory,
  slot: SnapshotSlot,
  cfg: InsightConfig,
  embedding: number[],
  extractedEntities: InsightStory["entities"],
  extractedKeywords: string[],
  extractedVerbs: string[],
  extractedNumbers: string[],
  referenceTime?: number,
): InsightStory | null {
  const refTime = referenceTime ?? Date.now();
  const ageHours = (refTime - raw.publishedAt) / (60 * 60 * 1000);
  if (!Number.isFinite(raw.publishedAt) || raw.publishedAt <= 0 || ageHours < 0 || ageHours > cfg.MAX_STORY_AGE_HOURS) return null;

  if (cfg.TIER_D_EXCLUDE && isTierD(raw)) return null;

  const tier = getSourceTier(raw.sourceGroup);
  if (cfg.TIER_D_EXCLUDE && tier === "D") return null;
  const sourceDistributionType = getSourceDistributionType(raw.sourceGroup);
  const sourceContentDomain = getSourceContentDomain(raw.sourceGroup, raw.category);
  const sectionDomain = raw.category
    ? getSourceContentDomain(raw.sourceGroup, raw.category)
    : undefined;
  const trustScore = computeTrustScore(tier, sourceDistributionType);
  const authorityAdjustment =
    sourceContentDomain === "business" ? 0.15 :
      sourceContentDomain === "regional" ? 0.10 :
        sourceDistributionType === "wire" ? -0.10 : 0;

  const canonicalText = makeCanonicalText(raw.title, raw.summary);
  const allEntities = [
    ...extractedEntities.people,
    ...extractedEntities.orgs,
    ...extractedEntities.places,
  ];

  return {
    ...raw,
    capturedAtSnapshot: slot,
    canonicalUrl: canonicalizeUrl(raw.url),
    canonicalText,
    canonicalTextHash: hashString(canonicalText),
    entities: extractedEntities,
    keywords: extractedKeywords,
    embedding,
    eventVerbs: extractedVerbs,
    numbers: extractedNumbers,
    sourceTier: tier,
    publisherFamily: canonicalPublisherFamily(raw.sourceGroup),
    sourceDistributionType,
    sourceContentDomain,
    sectionDomain,
    correctionMarker: /\b(corrects|correction|update|clarification|retraction)\b/i.test(raw.title),
    trustScore,
    sourceAuthority: Math.max(0, Math.min(1, TIER_AUTHORITY[tier] + authorityAdjustment)),
    freshnessScore: computeFreshnessScore(raw.publishedAt, refTime),
    rawProminence: computeRawProminence(raw),
    sentiment: 0,       // override from sentiment model if available
    factualDensity: computeFactualDensity(raw, extractedNumbers, allEntities),
    summaryQuality: computeSummaryQuality(raw.summary),
  };
}

/**
 * Tier C fallback filter:
 * If TIER_C_FALLBACK is true, remove Tier C stories for any event
 * cluster that already has at least one Tier A or B story.
 * Applied after clustering.
 */
export function applyTierCFallback(
  stories: InsightStory[],
  cfg: InsightConfig
): InsightStory[] {
  if (!cfg.TIER_C_FALLBACK) return stories;

  // Group by parentId
  const byParent = new Map<string, InsightStory[]>();
  for (const s of stories) {
    // An unclustered story is a separate event until evidence establishes
    // otherwise. Grouping all missing parentIds as __none__ falsely suppresses
    // unrelated Tier-C stories.
    const pid = s.parentId ?? `__unclustered__:${s.id}`;
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid)!.push(s);
  }

  const result: InsightStory[] = [];
  for (const [, group] of byParent) {
    const hasHighTier = group.some(s => s.sourceTier === "A" || s.sourceTier === "B");
    if (hasHighTier) {
      const higherTierStories = group.filter(s => s.sourceTier === "A" || s.sourceTier === "B");
      result.push(...group.filter(s => s.sourceTier !== "C" || isDiversityProtectedTierC(s, higherTierStories)));
    } else {
      result.push(...group);
    }
  }
  return result;
}
