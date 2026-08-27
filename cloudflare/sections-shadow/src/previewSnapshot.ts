import { assembleLiveSections } from '../../../scripts/sections-live/sectionsLiveAuthority.mjs';
import { ShadowCustodyError } from './contracts';
import { readCurrentShadow, type CustodyEnv } from './custody';
import { readD1EvidenceObject } from './evidenceStore';
import { readLiveLaneResults } from './liveStore';

interface CommittedEvidenceProjection {
  sectionItems?: Record<string, Array<Record<string, unknown>>>;
  previewSectionItemsIncluded?: boolean;
}

function isSectionRecord(value: unknown): value is Record<string, Array<Record<string, unknown>>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every(items => Array.isArray(items));
}

function countBy(items: Array<Record<string, unknown>>, field: string): Array<{
  [key: string]: string | number;
  count: number;
}> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = String(item[field] || 'unknown');
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, count]) => ({ [field]: key, count }));
}

export function buildSectionQuality(
  sections: Record<string, Array<Record<string, unknown>>>,
): Record<string, Record<string, unknown>> {
  return Object.fromEntries(Object.entries(sections).map(([section, items]) => {
    const topSources = countBy(items, 'sourceGroup');
    const topCategories = countBy(items, 'category');
    return [section, {
      storyCount: items.length,
      sourceGroupCount: topSources.length,
      topSources,
      topCategories,
      thin: items.length < 10 || topSources.length < 2,
    }];
  }));
}

export async function readCommittedPreviewSnapshot(env: CustodyEnv): Promise<Record<string, unknown>> {
  const current = await readCurrentShadow(env.SHADOW_DB);
  if (!current) {
    throw new ShadowCustodyError('PREVIEW_CURRENT_MISSING', 'No committed shadow epoch is current');
  }
  const { epoch, pointer } = current;
  if (
    epoch.state !== 'SHADOW_COMMITTED' ||
    epoch.evidence_verified !== 1 ||
    epoch.acquisition_mode !== 'INDEPENDENT_LIVE' ||
    !epoch.evidence_object_key ||
    !epoch.decision_output_digest
  ) {
    throw new ShadowCustodyError(
      'PREVIEW_CURRENT_INELIGIBLE',
      'The current shadow epoch is not eligible for browser preview',
    );
  }

  const evidenceObject = await readD1EvidenceObject(env.SHADOW_DB, epoch.evidence_object_key);
  if (!evidenceObject || evidenceObject.object_digest !== epoch.evidence_object_digest) {
    throw new ShadowCustodyError(
      'PREVIEW_EVIDENCE_MISSING',
      'The committed preview evidence object is absent or does not match custody metadata',
    );
  }

  let evidence: CommittedEvidenceProjection;
  try {
    evidence = JSON.parse(evidenceObject.content_json) as CommittedEvidenceProjection;
  } catch {
    throw new ShadowCustodyError('PREVIEW_EVIDENCE_INVALID', 'Committed preview evidence is invalid JSON');
  }

  let sections = isSectionRecord(evidence.sectionItems) ? evidence.sectionItems : null;
  let projectionSource = 'committed_evidence';
  if (!sections) {
    const laneResults = await readLiveLaneResults(env.SHADOW_DB, epoch.epoch_id);
    if (laneResults.length !== epoch.expected_lane_count) {
      throw new ShadowCustodyError(
        'PREVIEW_LANE_CARDINALITY_MISMATCH',
        `Committed preview has ${laneResults.length}/${epoch.expected_lane_count} retained lane payloads`,
      );
    }
    sections = assembleLiveSections(laneResults, epoch.evaluation_now_ms).sectionItems;
    projectionSource = 'committed_lane_reconstruction';
  }

  return {
    schemaVersion: 2,
    fetchedAt: epoch.evaluation_now_ms,
    contentHash: epoch.decision_output_digest.slice(0, 12),
    sectionQuality: buildSectionQuality(sections),
    sections,
    preview: {
      dataSource: 'cloudflare_d1',
      mode: 'cloudflare_preview',
      servingAuthority: 'github_static',
      epochId: epoch.epoch_id,
      committedAt: epoch.committed_at_ms,
      pointerGeneration: pointer.generation,
      evidenceVerified: true,
      projectionSource,
      sourceRegistryVersion: epoch.source_registry_version,
      decisionOutputDigest: epoch.decision_output_digest,
    },
  };
}
