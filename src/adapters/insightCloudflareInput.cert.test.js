import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  source: 'github_static',
  loadSectionsSnapshot: vi.fn(),
}));

vi.mock('../utils/sectionsDataSource.js', () => ({
  SECTIONS_DATA_SOURCES: {
    GITHUB: 'github_static',
    CLOUDFLARE_PREVIEW: 'cloudflare_preview',
  },
  getSectionsDataSource: () => state.source,
}));

vi.mock('./sectionsSnapshotLoader.js', () => ({
  loadSectionsSnapshot: (...args) => state.loadSectionsSnapshot(...args),
}));

vi.mock('./insightSectionsSnapshotAdapter.js', () => ({
  buildInsightSnapshotFromSectionsSnapshot: snapshot => snapshot?.projectedInsight || null,
}));

import { loadCloudflareInsightCandidate } from './insightCloudflareInput.js';

describe('NW-INSIGHT-CF-001 Cloudflare Insight authority selection', () => {
  beforeEach(() => {
    state.source = 'github_static';
    state.loadSectionsSnapshot.mockReset();
  });

  it('does not touch Cloudflare when GitHub is selected', async () => {
    const result = await loadCloudflareInsightCandidate();
    expect(result).toEqual({ attempted: false, snapshot: null, fallbackReason: null });
    expect(state.loadSectionsSnapshot).not.toHaveBeenCalled();
  });

  it('returns the verified projected snapshot when Cloudflare is selected', async () => {
    state.source = 'cloudflare_preview';
    const projectedInsight = { fetchedAt: 123, stories: [{ id: 'a' }] };
    state.loadSectionsSnapshot.mockResolvedValue({ projectedInsight });

    const result = await loadCloudflareInsightCandidate();
    expect(result.snapshot).toBe(projectedInsight);
    expect(result.attempted).toBe(true);
    expect(result.fallbackReason).toBeNull();
  });

  it('surfaces GitHub fallback reason instead of mislabeling it Cloudflare', async () => {
    state.source = 'cloudflare_preview';
    state.loadSectionsSnapshot.mockResolvedValue({
      runtimeDataSource: {
        effective: 'github_static',
        fallbackReason: 'preview_snapshot_unavailable',
      },
    });

    const result = await loadCloudflareInsightCandidate();
    expect(result.snapshot).toBeNull();
    expect(result.attempted).toBe(true);
    expect(result.fallbackReason).toBe('preview_snapshot_unavailable');
  });
});
