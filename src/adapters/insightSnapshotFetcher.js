/**
 * insightSnapshotFetcher.js
 *
 * Loads the pre-fetched Insight snapshot from public/newsdata/insight_latest.json
 * and produces a SlotFetcher-compatible function that filters stories by current age
 * (Date.now() - publishedAt) rather than the Python fetch slot — so a story
 * fetched at 6 am naturally becomes a "minus4h" story at 10 am without any
 * re-fetch.
 *
 * Golden rules enforced here:
 *  - slotMeta is NEVER used for display; only stories[] is consumed.
 *  - minus24h upper bound: 24 h ≤ age < 36 h  (not unlimited).
 *  - Stale snapshot is used as-is (no live fallback on static host).
 */

import { getSnapshotStorySlot, getSnapshotPoolHealth } from './insightSnapshotIntake.js';
import {
  enrichRawStoryWithSnapshotSignals,
  getInsightSnapshotRuntimeSummary,
  isSupportedInsightSnapshotSchema,
} from './insightSnapshotSignalAdapter.js';
import INSIGHT_POLICY from '../../config/insight_policy.json';

const H = 3_600_000;
// INS-3 fix: freshness driven by policy file, not hardcoded constant
const FRESH_MAX_AGE_MS = (INSIGHT_POLICY.freshMaxAgeHours || 8) * H;

const SNAPSHOT_URL = (() => {
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
  return `${base}/newsdata/insight_latest.json`;
})();

/**
 * Fetch and validate the snapshot file.
 * @param {object} [options]
 * @param {boolean} [options.allowStale=false]  If false, returns null when file age > 3h.
 * @returns {Promise<object|null>}
 */
export async function loadInsightSnapshot({ allowStale = false } = {}) {
  try {
    const res = await fetch(SNAPSHOT_URL, { cache: 'no-cache' });
    if (!res.ok) return null;
    const snapshot = await res.json();
    if (!isSupportedInsightSnapshotSchema(snapshot)) return null;
    if (!Array.isArray(snapshot?.stories)) return null;
    // Transport age is not editorial age. Reject malformed/future artifacts and
    // calculate editorial freshness from usable publication evidence only.
    const nowMs = Date.now();
    const fetchedAt = Number(snapshot.fetchedAt);
    if (!Number.isFinite(fetchedAt) || fetchedAt <= 0 || fetchedAt > nowMs + 5 * 60_000) return null;
    const fileAge = Math.max(0, nowMs - fetchedAt);
    const health = getSnapshotPoolHealth(snapshot, nowMs);
    const eligible = Object.entries(health.bySlot).filter(([slot]) => slot !== 'future').flatMap(([, rows]) => rows);
    const newestStoryTs = eligible.reduce((latest, row) => Math.max(latest, row.publishedAt), 0);
    if (!newestStoryTs) return null;
    const storyAge = nowMs - newestStoryTs;
    const staleLimit = (INSIGHT_POLICY.staleMaxAgeHours || 48) * H;
    if (fileAge > staleLimit || storyAge > staleLimit) return null;
    if (!allowStale && storyAge > FRESH_MAX_AGE_MS) return null;
    snapshot.freshnessMs = storyAge;
    snapshot.artifactAgeMs = fileAge;
    snapshot.heartbeatStale = fileAge > (INSIGHT_POLICY.heartbeatMaxAgeHours || 3) * H;
    const pool = (snapshot?.stories ?? []).map((story, index) => (
      enrichRawStoryWithSnapshotSignals({
        ...story,
        id: story?.id || story?.url || `snapshot-story-${index}`,
      }, snapshot)
    ));
    snapshot.stories = pool;

    return {
      ...snapshot,
      runtimeSummary: getInsightSnapshotRuntimeSummary(snapshot),
    };
  } catch {
    return null;
  }
}

/**
 * Build a SlotFetcher from a snapshot.
 * The fetcher filters the flat stories[] pool by current story age at call time,
 * so the same snapshot remains useful for many hours.
 *
 * @param {object} snapshot  A valid schemaVersion-2 snapshot object.
 * @returns {(slot: string) => Promise<object[]>}
 */
export function createSnapshotRawFetcher(snapshot) {
  return async (slot) => {
    const referenceMs = Date.now();
    const { pool, health } = buildInsightSnapshotPool(snapshot, referenceMs);
    const selected = pool.filter(story => getSnapshotStorySlot(story, referenceMs) === slot);
    const intakeSummary = {
      totalStories: health.totalStories, sourceGroupCount: health.sourceGroupCount,
      categoryCount: health.categoryCount, directSlots: health.slots,
      selectedBySlot: Object.fromEntries(Object.keys(health.slots).map(key => [key,
        pool.filter(story => getSnapshotStorySlot(story, referenceMs) === key).length])),
      maxTotalStories: MAX_INSIGHT_SNAPSHOT_STORIES,
      crossSlotFallback: false,
    };

    return selected.map(story => ({
      ...story,
      _snapshotIntake: { requestedSlot: slot, selectedFromSlot: slot, fallback: false },
      _snapshotIntakeSummary: intakeSummary,
      _snapshotObservedAt: referenceMs,
    }));
  };
}

// Match the bounded publisher contract. A second 300-row cap discarded related
// reports before clustering: the same genuine 552-row capture fell from nine
// multi-angle parents to one. Quality thresholds and publication-age slots stay
// independent of this acquisition budget.
export const MAX_INSIGHT_SNAPSHOT_STORIES = 1000;

export function buildInsightSnapshotPool(snapshot, nowMs = Date.now()) {
  // The publisher already limits output to 1,000 stories / 3 MB. Keep all usable
  // reports within that bound rather than trimming away event corroboration.
  const health = getSnapshotPoolHealth({ ...snapshot,
    stories: Array.isArray(snapshot?.stories) ? snapshot.stories.slice(0, MAX_INSIGHT_SNAPSHOT_STORIES) : [] }, nowMs);
  const slots = ['now', 'minus4h', 'minus12h', 'minus24h', 'minus36h'];
  const buckets = slots.map(slot => {
    const bySource = new Map();
    for (const story of (health.bySlot[slot] || [])
      .sort((a, b) => b.publishedAt - a.publishedAt || String(a.id).localeCompare(String(b.id)))) {
      const group = story.sourceGroup || 'unknown_source';
      if (!bySource.has(group)) bySource.set(group, []);
      bySource.get(group).push(story);
    }
    // Several large business feeds must not crowd out smaller independent
    // publishers before the event pipeline can inspect their evidence.
    const sources = [...bySource.values()], balanced = [];
    for (let index = 0; sources.some(rows => rows[index]); index++) {
      for (const rows of sources) if (rows[index]) balanced.push(rows[index]);
    }
    return balanced;
  });
  const pool = [], seen = new Set();
  for (let index = 0; pool.length < MAX_INSIGHT_SNAPSHOT_STORIES; index++) {
    let available = false;
    for (const bucket of buckets) {
      const story = bucket[index];
      if (!story) continue;
      available = true;
      const key = String(story.url || story.id);
      if (seen.has(key) || pool.length >= MAX_INSIGHT_SNAPSHOT_STORIES) continue;
      seen.add(key);
      pool.push(story);
    }
    if (!available) break;
  }
  return { pool, health };
}
