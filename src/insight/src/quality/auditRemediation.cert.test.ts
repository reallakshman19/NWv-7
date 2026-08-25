import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG, InsightStory, InsightParent } from "../types";
import { scoreAndRankParents } from "../ranking/ranking";
import { isWeakTree } from "../tree/treeBuilder";
import { computeEventAnchor } from "../pipeline/temporalTier";
import { cosineSimilarity } from "../dedup/dedup";
import { getEmbeddings } from "../../../adapters/embeddingsAdapter.js";
import { selectPrefetchedSectionItems } from "../../../adapters/sectionsSnapshotFetcher.js";

// Minimal InsightStory factory (mirrors existing cert fixtures).
function story(partial: Partial<InsightStory> & { id: string; angle?: any }): InsightStory {
  return {
    id: partial.id,
    title: partial.title || `Title ${partial.id}`,
    summary: partial.summary || `Summary ${partial.id}`,
    source: partial.source || `Source ${partial.id}`,
    sourceGroup: partial.sourceGroup || `group_${partial.id}`,
    url: `https://example.com/${partial.id}`,
    publishedAt: partial.publishedAt ?? Date.now(),
    category: "national",
    region: partial.region || "India",
    language: "en",
    capturedAtSnapshot: partial.capturedAtSnapshot || "now",
    canonicalUrl: `https://example.com/${partial.id}`,
    canonicalText: `text ${partial.id}`,
    canonicalTextHash: `hash-${partial.id}`,
    entities: { people: [], orgs: [], places: [], products: [], symbols: [] },
    keywords: ["alpha", "beta"],
    embedding: partial.embedding || new Array(269).fill(0).map((_, i) => (i % 7 === 0 ? 0.3 : 0)),
    eventVerbs: ["announces"],
    numbers: [],
    sourceTier: partial.sourceTier || "A",
    sourceDistributionType: partial.sourceDistributionType || "originator",
    sourceContentDomain: "general",
    correctionMarker: false,
    trustScore: 0.8,
    sourceAuthority: partial.sourceAuthority ?? 0.8,
    freshnessScore: partial.freshnessScore ?? 0.8,
    rawProminence: 0.7,
    sentiment: 0,
    factualDensity: 0.7,
    summaryQuality: 0.75,
    angle: partial.angle,
    ...partial,
  } as InsightStory;
}

describe("Audit remediation regression locks (I001, I002, I004, I007, I008, I010)", () => {
  // ── I010: OOV fallback — no all-zero embeddings, no collapse ──
  it("I010: out-of-vocabulary stories get distinct non-zero embeddings", async () => {
    const [oovA, oovB, oovAdup] = await getEmbeddings([
      "zzqq wvxk ploon grumbly snerk", // pure gibberish, no vocab term
      "blorptang fizzlewump quaxby",   // different gibberish
      "zzqq wvxk ploon grumbly snerk", // same as oovA
    ]);
    expect(oovA.some(v => v !== 0)).toBe(true);          // not invisible
    expect(cosineSimilarity(oovA, oovAdup)).toBeGreaterThan(0.99); // identical text → identical
    expect(cosineSimilarity(oovA, oovB)).toBeLessThan(0.9);        // different text → NOT collapsed
  });

  // ── I004: temporal-tier anchor clock is injectable & deterministic ──
  it("I004: computeEventAnchor honors an injected clock", () => {
    const parent = { firstSeenAt: 1_000 } as InsightParent; // very old → clamps to window
    const FIXED = 1_700_000_000_000;
    const a = computeEventAnchor(parent, 48, FIXED);
    const b = computeEventAnchor(parent, 48, FIXED);
    expect(a).toBe(b);                                   // deterministic for a fixed clock
    expect(a).toBe(FIXED - 48 * 60 * 60 * 1000);         // uses injected now, not Date.now()
    expect(computeEventAnchor(parent, 48, FIXED + 3_600_000)).not.toBe(a); // clock actually drives it
  });

  // ── I008: weak-tree flag is angle-aware ──
  it("I008: a single-angle tree is weak even with enough quality children", () => {
    const sameAngle = [
      story({ id: "a", angle: "base_report" }),
      story({ id: "b", angle: "base_report" }),
      story({ id: "c", angle: "base_report" }),
    ];
    const multiAngle = [
      story({ id: "d", angle: "base_report" }),
      story({ id: "e", angle: "official_response" }),
      story({ id: "f", angle: "market_reaction" }),
    ];
    expect(isWeakTree(sameAngle, DEFAULT_CONFIG)).toBe(true);   // single angle → weak (the fix)
    expect(isWeakTree(multiAngle, DEFAULT_CONFIG)).toBe(false); // diverse + quality → strong
  });

  // ── I007: ranking breakdown reconciles to the displayed score ──
  it("I007: rankingContributionBreakdown has 12 factors and sums to finalParentScore", () => {
    const storiesById = new Map<string, InsightStory>();
    ["s1", "s2", "s3"].forEach((id, i) =>
      storiesById.set(id, story({ id, sourceGroup: `grp${i}`, angle: i === 0 ? "base_report" : "official_response" }))
    );
    const parent = {
      parentId: "p1",
      clusterStoryIds: ["s1", "s2", "s3"],
      childStoryIds: ["s1", "s2"],
      hiddenDuplicateIds: [],
      keyEntities: [], keyPlaces: [], keyVerbs: [], keyNumbers: [],
      firstSeenAt: Date.now() - 3_600_000,
      latestSeenAt: Date.now(),
      snapshotPresence: { now: true, minus4h: false, minus12h: false, minus24h: false, minus36h: false, minus48h: false },
      debug: { clusterSize: 3, hiddenCount: 0, matchedSnapshots: [], scoreBreakdown: {}, replacements: [] },
    } as unknown as InsightParent;

    scoreAndRankParents([parent], storiesById, DEFAULT_CONFIG);

    const breakdown = (parent.debug as any).rankingContributionBreakdown as Array<{ weightedContribution: number }>;
    expect(Array.isArray(breakdown)).toBe(true);
    expect(breakdown.length).toBe(12); // all 12 factors exposed (was 8)
    const sum = breakdown.reduce((acc, x) => acc + Number(x.weightedContribution || 0), 0);
    expect(Math.abs(sum - parent.finalParentScore)).toBeLessThan(1e-3); // reconciles to the score
    const diag = (parent.debug as any).rankingFormulaDiagnostics;
    expect(Math.abs(diag.formulaDelta)).toBeLessThan(1e-3);
  });

  // ── I002: stale sections snapshot serves labelled rows, not a silent empty Main ──
  it("I002: an all-stale sections snapshot yields stale-flagged rows, not empty", () => {
    const old = Date.now() - 40 * 60 * 60 * 1000; // 40h old → snapshot stale AND item past the 36h item gate
    const snapshot = {
      schemaVersion: 2,
      fetchedAt: old,
      contentHash: "test",
      sections: { world: [{ id: "w1", title: "Stale story", url: "https://e/w1", source: "X", publishedAt: old }] },
    };
    const res = selectPrefetchedSectionItems(snapshot, "world", 5);
    expect(res.items.length).toBeGreaterThan(0); // not silently empty (the fix)
    expect(res.stale).toBe(true);                // surfaced as stale so UI labels it
    expect(res.staleFallback).toBe(true);        // served via stale fallback, not the fresh path
  });

  // ── I001: deploy publishes on data-workflow completion (GITHUB_TOKEN-safe) ──
  it.skipIf(!fs.existsSync(path.resolve(".github/workflows/deploy.yml")))("I001: deploy.yml triggers on workflow_run for the data workflows", () => {
    const yml = fs.readFileSync(path.resolve(".github/workflows/deploy.yml"), "utf8");
    expect(yml).toContain("workflow_run:");
    expect(yml).toContain("News Prefetch");
    expect(yml).toMatch(/conclusion == 'success'/); // only publish successful data runs
  });
});
