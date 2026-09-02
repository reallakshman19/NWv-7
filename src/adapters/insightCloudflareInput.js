import { loadSectionsSnapshot } from './sectionsSnapshotLoader.js';
import { buildInsightSnapshotFromSectionsSnapshot } from './insightSectionsSnapshotAdapter.js';
import {
  getSectionsDataSource,
  SECTIONS_DATA_SOURCES,
} from '../utils/sectionsDataSource.js';

export async function loadCloudflareInsightCandidate() {
  if (getSectionsDataSource() !== SECTIONS_DATA_SOURCES.CLOUDFLARE_PREVIEW) {
    return { attempted: false, snapshot: null, fallbackReason: null };
  }

  try {
    const sectionsSnapshot = await loadSectionsSnapshot();
    const snapshot = buildInsightSnapshotFromSectionsSnapshot(sectionsSnapshot);
    if (snapshot) return { attempted: true, snapshot, fallbackReason: null };

    return {
      attempted: true,
      snapshot: null,
      fallbackReason:
        sectionsSnapshot?.runtimeDataSource?.fallbackReason || 'cloudflare_sections_unusable',
    };
  } catch (error) {
    return {
      attempted: true,
      snapshot: null,
      fallbackReason: error?.code || error?.message || 'cloudflare_sections_unavailable',
    };
  }
}
