import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearSectionsSnapshotLoadCache,
  loadSectionsSnapshot,
} from './sectionsSnapshotLoader.js';

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
    sections: {},
  };
}

afterEach(() => {
  clearSectionsSnapshotLoadCache();
  vi.unstubAllGlobals();
});

describe('sections snapshot shared load certification', () => {
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
});

