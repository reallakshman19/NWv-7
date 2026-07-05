// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __clearDatasetCacheForTest,
  loadDataset,
  useDataset,
} from './useDataset.js';
import * as datasetsIndex from '../datasets/index.js';

function envelope(id) {
  return {
    ok: true,
    datasetId: id,
    data: { id },
    payloadHash: id,
    source: 'cert',
    freshness: 'fresh',
    generatedAt: 1,
    fetchedAt: 1,
    validation: { passed: true, errors: [], warnings: [] },
    slo: { passed: true, score: 100, reasons: [] },
    diagnostics: [],
    error: null,
  };
}

function loaderWithSequence(delay = 0) {
  let count = 0;
  return {
    load: vi.fn(async () => {
      count += 1;
      if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
      return envelope(`env-${count}`);
    }),
  };
}

function expectLastOptions(loader, expected) {
  const calls = loader.load.mock.calls;
  const last = calls[calls.length - 1]?.[0];
  expect(last).toMatchObject(expected);
}

describe('NW-DP-001 dataset policy propagation', () => {
  beforeEach(() => {
    __clearDatasetCacheForTest();
    vi.restoreAllMocks();
  });

  it('normalizes legacy boolean force refresh', async () => {
    const loader = loaderWithSequence();
    vi.spyOn(datasetsIndex, 'getDatasetLoader').mockReturnValue(loader);

    await loadDataset('market', true);

    expectLastOptions(loader, { forceRefresh: true, policy: 'legacy' });
  });

  it('forceRefresh object bypasses memory cache', async () => {
    const loader = loaderWithSequence();
    vi.spyOn(datasetsIndex, 'getDatasetLoader').mockReturnValue(loader);

    await loadDataset('market');
    await loadDataset('market', { forceRefresh: true });

    expect(loader.load).toHaveBeenCalledTimes(2);
    expectLastOptions(loader, { forceRefresh: true });
  });

  it('passes liveOnly to the loader', async () => {
    const loader = loaderWithSequence();
    vi.spyOn(datasetsIndex, 'getDatasetLoader').mockReturnValue(loader);

    await loadDataset('market', { liveOnly: true });

    expectLastOptions(loader, { liveOnly: true });
  });

  it('separates main cache entries by includeInsight', async () => {
    const loader = loaderWithSequence();
    vi.spyOn(datasetsIndex, 'getDatasetLoader').mockReturnValue(loader);

    const withoutInsight = await loadDataset('main');
    const withInsight = await loadDataset('main', { includeInsight: true });

    expect(loader.load).toHaveBeenCalledTimes(2);
    expect(withoutInsight).not.toBe(withInsight);
    expect(loader.load.mock.calls[1][0]).toMatchObject({ includeInsight: true });
  });

  it('does not share default and includeInsight cached envelopes', async () => {
    const loader = loaderWithSequence();
    vi.spyOn(datasetsIndex, 'getDatasetLoader').mockReturnValue(loader);

    const firstDefault = await loadDataset('main');
    const firstInsight = await loadDataset('main', { includeInsight: true });
    const secondDefault = await loadDataset('main');
    const secondInsight = await loadDataset('main', { includeInsight: true });

    expect(loader.load).toHaveBeenCalledTimes(2);
    expect(secondDefault).toBe(firstDefault);
    expect(secondInsight).toBe(firstInsight);
  });

  it('uses asOfDate in cache identity', async () => {
    const loader = loaderWithSequence();
    vi.spyOn(datasetsIndex, 'getDatasetLoader').mockReturnValue(loader);

    const first = await loadDataset('main', { asOfDate: '2026-07-05T00:00:00.000Z' });
    const second = await loadDataset('main', { asOfDate: '2026-07-06T00:00:00.000Z' });
    const firstAgain = await loadDataset('main', { asOfDate: '2026-07-05T00:00:00.000Z' });

    expect(loader.load).toHaveBeenCalledTimes(2);
    expect(firstAgain).toBe(first);
    expect(second).not.toBe(first);
  });

  it('reuses in-flight work for identical policy keys', async () => {
    const loader = loaderWithSequence(10);
    vi.spyOn(datasetsIndex, 'getDatasetLoader').mockReturnValue(loader);

    const [a, b] = await Promise.all([
      loadDataset('main', { includeInsight: true }),
      loadDataset('main', { includeInsight: true }),
    ]);

    expect(loader.load).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it('does not reuse in-flight work across incompatible keys', async () => {
    const loader = loaderWithSequence(10);
    vi.spyOn(datasetsIndex, 'getDatasetLoader').mockReturnValue(loader);

    const [a, b] = await Promise.all([
      loadDataset('main'),
      loadDataset('main', { includeInsight: true }),
    ]);

    expect(loader.load).toHaveBeenCalledTimes(2);
    expect(a).not.toBe(b);
  });

  it('keeps legacy useDataset reload(true) force behavior', async () => {
    const loader = loaderWithSequence();
    vi.spyOn(datasetsIndex, 'getDatasetLoader').mockReturnValue(loader);

    const { result } = renderHook(() => useDataset('market', { auto: false }));

    await act(async () => {
      await result.current.reload(true);
    });

    expect(loader.load).toHaveBeenCalledTimes(1);
    expectLastOptions(loader, { forceRefresh: true, policy: 'legacy' });
  });
});
