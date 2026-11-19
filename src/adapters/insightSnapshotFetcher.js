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

import { getSnapshotIntakeSummary, selectSnapshotStoriesForSlot, getSnapshotPoolHealth } from './insightSnapshotIntake.js';
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
    const intakeSummary = getSnapshotIntakeSummary(snapshot, {
      minStoriesPerSlot: 12, nowMs: referenceMs,
    });
    const selected = selectSnapshotStoriesForSlot(snapshot, slot, {
      minStoriesPerSlot: 12,
      nowMs: referenceMs,
    });

    return selected.map(story => ({
      ...story,
      _snapshotIntakeSummary: intakeSummary,
      _snapshotObservedAt: referenceMs,
    }));
  };
}
