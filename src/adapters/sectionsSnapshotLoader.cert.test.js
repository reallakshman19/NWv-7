import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearSectionsSnapshotLoadCache,
  loadSectionsSnapshot,
} from './sectionsSnapshotLoader.js';
import { getSectionsDataSourceRuntimeStatus, publishSectionsDataSourceStatus } from '../utils/sectionsDataSource.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, reject, resolve };
}

function response(snapshot) {
  return {
    ok: true,
    status: 200,
    json: async () => snapshot,
  };
}

function snapshot(id) {
  return {
    schemaVersion: 2,
    fetchedAt: Date.now(),
    contentHash: id,
    sections: { topStories: [{ id, title: id, url: 'https://publisher.example/'+id, publishedAt: Date.now() }] },
  };
}

afterEach(() => {
  clearSectionsSnapshotLoadCache();
  publishSectionsDataSourceStatus(null);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('sections snapshot shared load certification', () => {
  it('reads current repository data on the official Pages deployment', async () => {
    vi.stubGlobal('window', {
      location: { origin: 'https://reallakshman19.github.io', pathname: '/NWv-7/' },
      dispatchEvent: vi.fn(),
    });
    const fetchMock = vi.fn().mockResolvedValue(response(snapshot('current-repository')));
    vi.stubGlobal('fetch', fetchMock);

    const loaded = await loadSectionsSnapshot({ budgetMs: 5000 });

    expect(loaded.contentHash).toBe('current-repository');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/reallakshman19/NWv-7/main/public/newsdata/sections_latest.json',
      expect.objectContaining({ cache: 'no-store', headers: undefined }),
    );
  });

  it('coalesces concurrent cold-cache callers into one fetch', async () => {
    const gate = deferred();
    const fetchMock = vi.fn(() => gate.promise);
    vi.stubGlobal('fetch', fetchMock);

    const first = loadSectionsSnapshot({ budgetMs: 5000 });
    const second = loadSectionsSnapshot({ budgetMs: 5000 });
    const third = loadSectionsSnapshot({ budgetMs: 5000 });

    expect(first).toBe(second);
    expect(second).toBe(third);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    gate.resolve(response(snapshot('shared')));
    const values = await Promise.all([first, second, third]);

    expect(values[0]).toBe(values[1]);
    expect(values[1]).toBe(values[2]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('clears a rejected shared load so the next call retries', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ schemaVersion: 99 }))
      .mockResolvedValueOnce(response(snapshot('recovered')));
    vi.stubGlobal('fetch', fetchMock);

    const first = loadSectionsSnapshot({ budgetMs: 5000 });
    const second = loadSectionsSnapshot({ budgetMs: 5000 });

    expect(first).toBe(second);
    await expect(first).rejects.toThrow('unsupported sections snapshot schema');

    const recovered = await loadSectionsSnapshot({ budgetMs: 5000 });

    expect(recovered.contentHash).toBe('recovered');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('bypasses resolved memory on force while sharing the refresh', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(snapshot('initial')))
      .mockResolvedValueOnce(response(snapshot('forced')));
    vi.stubGlobal('fetch', fetchMock);

    const initial = await loadSectionsSnapshot({ budgetMs: 5000 });
    const cached = await loadSectionsSnapshot({ budgetMs: 5000 });
    const forced = loadSectionsSnapshot({ force: true, budgetMs: 5000 });
    const joined = loadSectionsSnapshot({ budgetMs: 5000 });

    expect(cached).toBe(initial);
    expect(forced).toBe(joined);
    expect((await forced).contentHash).toBe('forced');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not let a cleared pending request repopulate memory', async () => {
    const oldGate = deferred();
    const newGate = deferred();
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => oldGate.promise)
      .mockImplementationOnce(() => newGate.promise);
    vi.stubGlobal('fetch', fetchMock);

    const oldLoad = loadSectionsSnapshot({ budgetMs: 5000 });
    clearSectionsSnapshotLoadCache();
    const newLoad = loadSectionsSnapshot({ budgetMs: 5000 });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    newGate.resolve(response(snapshot('new')));
    await expect(newLoad).resolves.toMatchObject({ contentHash: 'new' });
    oldGate.resolve(response(snapshot('old')));
    await expect(oldLoad).resolves.toMatchObject({ contentHash: 'old' });

    const cached = await loadSectionsSnapshot({ budgetMs: 5000 });
    expect(cached.contentHash).toBe('new');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('loads the independently acquired Cloudflare snapshot when Preview is selected', async () => {
    vi.stubEnv('VITE_SECTIONS_AUTHORITY', 'cloudflare');
    vi.stubEnv('VITE_SECTIONS_AUTHORITY_URL', 'https://preview.example/preview/sections/latest');
    const fetchMock = vi.fn().mockResolvedValue(response(snapshot('cloudflare')));
    vi.stubGlobal('fetch', fetchMock);

    const loaded = await loadSectionsSnapshot({ budgetMs: 5000 });

    expect(loaded.contentHash).toBe('cloudflare');
    expect(loaded.runtimeDataSource).toEqual({
      requested: 'cloudflare_preview',
      effective: 'cloudflare_preview',
      fallback: false,
      fallbackReason: null,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://preview.example/preview/sections/latest',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('falls back to GitHub when the selected Preview snapshot is stale', async () => {
    vi.stubEnv('VITE_SECTIONS_AUTHORITY', 'cloudflare');
    vi.stubEnv('VITE_SECTIONS_AUTHORITY_URL', 'https://preview.example/preview/sections/latest');
    const stalePreview = {
      ...snapshot('stale-cloudflare'),
      fetchedAt: Date.now() - 13 * 60 * 60 * 1000,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(stalePreview))
      .mockResolvedValueOnce(response(snapshot('github-fallback')));
    vi.stubGlobal('fetch', fetchMock);

    const loaded = await loadSectionsSnapshot({ budgetMs: 5000 });

    expect(loaded.contentHash).toBe('github-fallback');
    expect(loaded.runtimeDataSource).toMatchObject({
      requested: 'cloudflare_preview',
      effective: 'github_static',
      fallback: true,
      fallbackReason: 'preview_snapshot_unusable',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('rejects fresh-but-empty Cloudflare data and selects the available GitHub snapshot', async () => {
    vi.stubEnv('VITE_SECTIONS_AUTHORITY', 'cloudflare');
    vi.stubEnv('VITE_SECTIONS_AUTHORITY_URL', 'https://preview.example/preview/sections/latest');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ ...snapshot('cf-empty'), sections: {} }))
      .mockResolvedValueOnce(response(snapshot('gh-winner')));
    vi.stubGlobal('fetch', fetchMock);
    const result = await loadSectionsSnapshot({ budgetMs: 5000 });
    expect(result.contentHash).toBe('gh-winner');
    expect(result.runtimeDataSource).toMatchObject({
      requested: 'cloudflare_preview',
      effective: 'github_static',
      fallback: true,
      fallbackReason: 'preview_snapshot_unusable',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not publish GitHub success when both provider snapshots are empty', async () => {
    vi.stubEnv('VITE_SECTIONS_AUTHORITY', 'cloudflare');
    vi.stubEnv('VITE_SECTIONS_AUTHORITY_URL', 'https://preview.example/preview/sections/latest');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ ...snapshot('CF_EMPTY'), sections: {} }))
      .mockResolvedValueOnce(response({ ...snapshot('GH_EMPTY'), sections: {} }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(loadSectionsSnapshot({ budgetMs: 5000 })).rejects.toThrow(/GitHub sections snapshot invalid/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getSectionsDataSourceRuntimeStatus()).toMatchObject({
      requested: 'cloudflare_preview', effective: 'unavailable',
      failed: true, fallbackReason: 'github_snapshot_unusable',
      failureDetail: 'snapshot_content_unusable',
      primaryFailure: 'preview_snapshot_unusable',
    });
  });

  it('rejects future and invalid Cloudflare rows and selects valid GitHub', async () => {
    vi.stubEnv('VITE_SECTIONS_AUTHORITY', 'cloudflare');
    vi.stubEnv('VITE_SECTIONS_AUTHORITY_URL', 'https://preview.example/preview/sections/latest');
    const cases = [
      [{ ...snapshot('CF_FUTURE'), fetchedAt: Date.now() + 365 * 86400_000 }, 'snapshot_future_timestamp'],
      [{ ...snapshot('CF_BAD'), sections: { topStories: [{}] } }, 'snapshot_content_unusable'],
    ];
    for (const [bad, detail] of cases) {
      clearSectionsSnapshotLoadCache();
      const fetchMock = vi.fn().mockResolvedValueOnce(response(bad))
        .mockResolvedValueOnce(response(snapshot('GH_GOOD')));
      vi.stubGlobal('fetch', fetchMock);
      const result = await loadSectionsSnapshot({ budgetMs: 5000 });
      expect(result.contentHash).toBe('GH_GOOD');
      expect(result.runtimeDataSource).toMatchObject({
        requested: 'cloudflare_preview', effective: 'github_static',
        fallbackReason: 'preview_snapshot_unusable', fallbackDetail: detail,
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    }
  });

  it('rejects stale GitHub snapshots even when Cloudflare is not selected', async () => {
    vi.stubEnv('VITE_SECTIONS_AUTHORITY', 'github');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      ...snapshot('GH_OLD'), fetchedAt: Date.now() - 14 * 3600_000,
    })));
    await expect(loadSectionsSnapshot({ budgetMs: 5000 })).rejects.toThrow(/snapshot_stale/);
    expect(getSectionsDataSourceRuntimeStatus()).toMatchObject({
      requested: 'github_static', effective: 'unavailable', failed: true,
      failureDetail: 'snapshot_stale',
    });
  });

  it('reports failure after success, preserves last-good separately, and restores authority on recovery', async () => {
    vi.stubEnv('VITE_SECTIONS_AUTHORITY', 'cloudflare');
    vi.stubEnv('VITE_SECTIONS_AUTHORITY_URL', 'https://preview.example/preview/sections/latest');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(snapshot('CF_INITIAL')))
      .mockResolvedValueOnce(response({ ...snapshot('CF_EMPTY'), sections: {} }))
      .mockResolvedValueOnce(response({ ...snapshot('GH_EMPTY'), sections: {} }))
      .mockResolvedValueOnce(response({ ...snapshot('CF_EMPTY'), sections: {} }))
      .mockResolvedValueOnce(response(snapshot('GH_RECOVERED')));
    vi.stubGlobal('fetch', fetchMock);
    const initial = await loadSectionsSnapshot({ budgetMs: 5000 });
    expect(initial.contentHash).toBe('CF_INITIAL');
    const initialStatus = getSectionsDataSourceRuntimeStatus();
    expect(initialStatus).toMatchObject({ effective: 'cloudflare_preview', failed: false });
    await expect(loadSectionsSnapshot({ force: true, budgetMs: 5000 })).rejects.toThrow();
    expect(getSectionsDataSourceRuntimeStatus()).toMatchObject({
      effective: 'unavailable', failed: true,
      lastSuccessfulAt: initialStatus.lastSuccessfulAt,
      lastSuccessfulEffective: 'cloudflare_preview',
    });
    const recovered = await loadSectionsSnapshot({ force: true, budgetMs: 5000 });
    expect(recovered.contentHash).toBe('GH_RECOVERED');
    expect(getSectionsDataSourceRuntimeStatus()).toMatchObject({
      effective: 'github_static', failed: false, fallback: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('ignores an obsolete request when reporting the current authority', async () => {
    const older = deferred();
    const newer = deferred();
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => older.promise)
      .mockImplementationOnce(() => newer.promise);
    vi.stubGlobal('fetch', fetchMock);
    const oldLoad = loadSectionsSnapshot({ budgetMs: 5000 });
    clearSectionsSnapshotLoadCache();
    const newLoad = loadSectionsSnapshot({ budgetMs: 5000 });
    newer.resolve(response(snapshot('NEWER')));
    await expect(newLoad).resolves.toMatchObject({ contentHash: 'NEWER' });
    const current = getSectionsDataSourceRuntimeStatus();
    older.resolve(response(snapshot('OLDER')));
    await expect(oldLoad).resolves.toMatchObject({ contentHash: 'OLDER' });
    expect(getSectionsDataSourceRuntimeStatus()).toEqual(current);
  });

});
