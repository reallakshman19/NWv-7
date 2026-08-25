import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildSectionsSourceRegistryAuthority,
} from '../../../scripts/top-stories-shadow/sectionsShadowSourceRegistry.mjs';

function readJson(path) {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
}

function readRegistry() {
  return readJson('../../../config/section_sources.json');
}

function readFrozenAuthority() {
  return readJson(
    '../../../scripts/top-stories-shadow/fixtures/nw-cf-hybrid-001a-source-registry-authority.json',
  );
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
  it('matches the pre-shadow frozen registry authority exactly', () => {
    const authority = buildSectionsSourceRegistryAuthority(readRegistry());
    const frozen = readFrozenAuthority();
    expect(frozen.frozenBeforeShadowObservation).toBe(true);
    expect(frozen.shadowOutputUsedToChooseExpected).toBe(false);
    expect(authority.sourceRegistryVersion).toBe(frozen.sourceRegistryVersion);
    expect(authority.sourceRegistryDigest).toBe(frozen.sourceRegistryDigest);
    expect(authority.sectionCount).toBe(frozen.sectionCount);
    expect(authority.laneCount).toBe(frozen.laneCount);
    expect(authority.minFeedsInSection).toBe(frozen.minFeedsInSection);
    expect(authority.sourceGroupCount).toBe(frozen.sourceGroupCount);
    expect(authority.tierACount).toBe(frozen.tierACount);
  });

  it('meets the registry-declared coverage without narrowing acquisition lanes', () => {
    const registry = readRegistry();
    const authority = buildSectionsSourceRegistryAuthority(registry);
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

  it('fails closed on missing coverage, invalid tier, or missing topic semantics', () => {
    const missingCoverage = readRegistry();
    delete missingCoverage.requiredCoverage.minTierAFeeds;
    expectErrorCode(
      () => buildSectionsSourceRegistryAuthority(missingCoverage),
      'source_registry_coverage_missing',
    );

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
