// @vitest-environment jsdom
import React, { useEffect } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import NewsSection from '../components/NewsSection.jsx';
import { NewsProvider, useNews } from './NewsContext.jsx';

const mocks = vi.hoisted(() => ({ record: vi.fn(), load: vi.fn() }));
vi.mock('../data/datasets/sectionsDataset.js', () => ({ load: mocks.load }));
vi.mock('../utils/storage.js', async original => ({
  ...await original(),
  getSettings: () => ({}),
  incrementViewCount: mocks.record,
}));
vi.mock('./SettingsContext.jsx', () => ({ useSettings: () => ({ settingsVersion: 1 }) }));
vi.mock('../adapters/breakingSnapshotFetcher.js', () => ({ loadFreshBreakingItems: async () => [] }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('records one actual card impression across repeated refreshes and visibility callbacks', async () => {
  let receiveIntersections;
  const observe = vi.fn();
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback) { receiveIntersections = callback; }
    observe = observe;
    disconnect() {}
  });
  mocks.load.mockResolvedValue({
    ok: true,
    freshness: 'fresh',
    data: { sections: {}, frontPage: [{ id: 'story-1', title: 'Flood alert' }] },
  });

  let refresh;
  function Page({ showCards }) {
    const { newsData, refreshNews } = useNews();
    useEffect(() => {
      refresh = refreshNews;
    }, [refreshNews]);
    return showCards ? <NewsSection id="top-stories" title="Top Stories" news={newsData.frontPage || []} /> : null;
  }
  const { rerender } = render(<NewsProvider><Page showCards={false} /></NewsProvider>);
  await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1));
  for (let i = 0; i < 3; i++) {
    await act(async () => { await refresh(); });
  }
  expect(mocks.load).toHaveBeenCalledTimes(4);
  expect(screen.queryByRole('article')).toBeNull();
  expect(mocks.record).not.toHaveBeenCalled();

  rerender(<NewsProvider><Page showCards /></NewsProvider>);
  const card = screen.getByRole('article');
  expect(observe).toHaveBeenCalledWith(card);
  receiveIntersections([{ target: card, isIntersecting: true, intersectionRatio: 0.05 }]);
  expect(mocks.record).not.toHaveBeenCalled();
  const visible = { target: card, isIntersecting: true, intersectionRatio: 0.75 };
  receiveIntersections([visible]);
  receiveIntersections([visible]);
  await act(async () => { await refresh(); });
  receiveIntersections([visible]);
  expect(mocks.record).toHaveBeenCalledExactlyOnceWith([expect.objectContaining({ id: 'story-1' })]);
});
