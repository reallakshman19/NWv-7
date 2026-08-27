import sourceRegistry from '../../../config/section_sources.json';
import { buildLiveLaneDefinitions } from '../../../scripts/sections-live/sectionsLiveAuthority.mjs';
import { buildSectionsSourceRegistryAuthority } from '../../../scripts/top-stories-shadow/sectionsShadowSourceRegistry.mjs';
import { EXPECTED_SECTIONS_LANE_COUNT, ShadowCustodyError } from './contracts';

interface RegistryFeed {
  url: string;
  source: string;
  sourceGroup: string;
  tier: string;
  topic: string;
}

interface RegistryAuthority {
  sourceRegistryVersion: string;
  sourceRegistryDigest: string;
  laneCount: number;
  canonicalRegistry: {
    sections: Readonly<Record<string, readonly RegistryFeed[]>>;
  };
}

export interface ShadowLaneDefinition {
  laneId: string;
  sectionKey: string;
  sourceGroup: string;
  sourceName: string;
  feedUrl: string;
  feedUrlDigest: string;
  tier: string;
  topic: string;
}

const authority = buildSectionsSourceRegistryAuthority(sourceRegistry) as unknown as RegistryAuthority;

if (authority.laneCount !== EXPECTED_SECTIONS_LANE_COUNT) {
  throw new ShadowCustodyError(
    'SOURCE_REGISTRY_LANE_COUNT_MISMATCH',
    `Sections shadow requires ${EXPECTED_SECTIONS_LANE_COUNT} source lanes; authority has ${authority.laneCount}`,
  );
}

export const sectionsRegistryAuthority = Object.freeze(authority);

export async function buildShadowLaneDefinitions(): Promise<ShadowLaneDefinition[]> {
  return buildLiveLaneDefinitions(authority) as ShadowLaneDefinition[];
}
