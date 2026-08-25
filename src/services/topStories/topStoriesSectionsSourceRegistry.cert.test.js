import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildSectionsSourceRegistryAuthority,
} from '../../../scripts/top-stories-shadow/sectionsShadowSourceRegistry.mjs';

function readRegistry() {
  return JSON.parse(readFileSync(new URL(
    '../../../config/section_sources.json',
    import.meta.url,
  ), 'utf8'));
}

function expectErrorCode(action, code) {
  let error = null;
  try {
    action();
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeTruthy();
  expect(error?.code).toBe(code);
}

describe('NW-CF-HYBRID-001A source registry coverage authority', () => {
  it('meets the registry-declared coverage without narrowing acquisition lanes', () => {
    const registry = readRegistry();
    const authority = buildSectionsSourceRegistryAuthority(registry);
    expect(authority.sectionCount).toBe(10);
    expect(authority.laneCount).toBe(41);
    expect(authority.minFeedsInSection)
      .toBeGreaterThanOrEqual(registry.requiredCoverage.minFeedsPerSection);
    expect(authority.sourceGroupCount)
      .toBeGreaterThanOrEqual(registry.requiredCoverage.minSourceGroups);
    expect(authority.tierACount)
      .toBeGreaterThanOrEqual(registry.requiredCoverage.minTierAFeeds);
  });

  it('fails closed when a section is silently narrowed below required coverage', () => {
    const registry = readRegistry();
    registry.sections.india = registry.sections.india.slice(0, 1);
    expectErrorCode(
      () => buildSectionsSourceRegistryAuthority(registry),
      'source_registry_coverage_failed',
    );
  });

  it('fails closed on invalid tier or missing topic semantics', () => {
    const badTier = readRegistry();
    badTier.sections.topStories[0].tier = 'Z';
    expectErrorCode(
      () => buildSectionsSourceRegistryAuthority(badTier),
      'source_registry_tier_invalid',
    );

    const missingTopic = readRegistry();
    delete missingTopic.sections.topStories[0].topic;
    expectErrorCode(
      () => buildSectionsSourceRegistryAuthority(missingTopic),
      'source_registry_field_missing',
    );
  });
});
