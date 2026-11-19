import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildInsightSnapshotPool, createSnapshotRawFetcher } from './insightSnapshotFetcher.js';
const NOW = Date.parse('2026-11-19T06:00:00Z'), HOUR = 3_600_000;
const story = (id, age) => ({ id, title: `Report ${id}`, url: `https://publisher.example/${id}`,
  source: 'Publisher', sourceGroup: 'publisher', publishedAt: NOW - age * HOUR });
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => vi.useRealTimers());

it('admits more than forty distinct reports in one populated temporal window', async () => {
  const snapshot = { stories: Array.from({ length: 80 }, (_, i) => story(`new-${i}`, 2)) };
  expect(await createSnapshotRawFetcher(snapshot)('now')).toHaveLength(80);
});

it('keeps publication slots honest rather than borrowing reports into empty older windows', async () => {
  const fetcher = createSnapshotRawFetcher({ stories: [story('one', 2)] });
  expect(await fetcher('now')).toHaveLength(1);
  expect(await fetcher('minus4h')).toEqual([]);
  expect(await fetcher('minus24h')).toEqual([]);
  expect(await fetcher('minus48h')).toEqual([]);
});

it('keeps every valid report below the publisher bound, including a sparse older source window', () => {
  const snapshot = { stories: [...Array.from({ length: 600 }, (_, i) => story(`new-${i}`, 2)), story('older', 30),
    story('future', -1), story('expired', 50)] };
  const { pool } = buildInsightSnapshotPool(snapshot, NOW);
  expect(pool).toHaveLength(601);
  expect(pool.some(row => row.id === 'older')).toBe(true);
  expect(pool.some(row => ['future', 'expired'].includes(row.id))).toBe(false);
});

it('bounds scanning and admission to the publisher maximum of one thousand stories', () => {
  const snapshot = { stories: Array.from({ length: 1200 }, (_, i) => story(`bounded-${i}`, 2)) };
  const { pool } = buildInsightSnapshotPool(snapshot, NOW);
  expect(pool).toHaveLength(1000);
  expect(pool.some(row => row.id === 'bounded-1000')).toBe(false);
});

it('deduplicates canonical URLs across slots and rejects weak publication evidence', () => {
  const same = story('same', 2);
  const { pool } = buildInsightSnapshotPool({ stories: [same, { ...same, publishedAt: NOW - 6 * HOUR },
    { ...story('guessed', 1), publishedAtSource: 'fetch_time_fallback' }] }, NOW);
  expect(pool).toHaveLength(1);
  expect(pool[0].id).toBe('same');
});

it('preserves a sparse independent publisher behind a high-volume source', () => {
  const snapshot = { stories: [...Array.from({ length: 600 }, (_, i) => story(`flood-${i}`, 2)),
    { ...story('independent-follow-up', 2), sourceGroup: 'other_publisher' }] };
  expect(buildInsightSnapshotPool(snapshot, NOW).pool.some(row => row.id === 'independent-follow-up')).toBe(true);
});
