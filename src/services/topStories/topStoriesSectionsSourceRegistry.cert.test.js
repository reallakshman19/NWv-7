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
  it('matches the verified current registry while preserving the original frozen authority', () => {
    const authority = buildSectionsSourceRegistryAuthority(readRegistry());
    const frozen = readFrozenAuthority();
    expect(frozen.frozenBeforeShadowObservation).toBe(true);
    expect(frozen.shadowOutputUsedToChooseExpected).toBe(false);
    expect(frozen.sourceRegistryVersion).toBe('section-source-policy-v1');
    expect(frozen.sourceRegistryDigest).toBe('d6e8c3d706c9848b7e63349ce08cd48c3670377f24c4163150cd368151e96716');
    const current = readJson('../../../scripts/top-stories-shadow/fixtures/sections-source-registry-v4-authority.json');
    expect(authority.sourceRegistryVersion).toBe(current.sourceRegistryVersion);
    expect(authority.sourceRegistryDigest).toBe(current.sourceRegistryDigest);
    expect(authority.sectionCount).toBe(frozen.sectionCount);
    expect(authority.laneCount).toBe(frozen.laneCount);
    expect(authority.minFeedsInSection).toBe(frozen.minFeedsInSection);
    expect(authority.sourceGroupCount).toBeGreaterThanOrEqual(frozen.sourceGroupCount);
    expect(authority.tierACount).toBeGreaterThanOrEqual(frozen.tierACount);
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

  it('uses the qualified city endpoint and direct publishers without relabelling duplicated Oman lanes', () => {
    const registry = readRegistry();
    const feeds = Object.values(registry.sections).flat();
    expect(feeds).toHaveLength(41);
    expect(feeds.every(feed => new URL(feed.url).protocol === 'https:')).toBe(true);
    expect(feeds.some(feed => new URL(feed.url).hostname === 'news.google.com')).toBe(false);
    expect(registry.sections.trichy).toContainEqual(expect.objectContaining({
      url: 'https://timesofindia.indiatimes.com/rssfeeds/22778270.cms', sourceGroup: 'times_of_india',
    }));
    const observer = registry.sections.muscat.filter(feed => new URL(feed.url).hostname === 'www.omanobserver.om');
    expect(observer).toHaveLength(3);
    expect(new Set(observer.map(feed => feed.sourceGroup))).toEqual(new Set(['oman_observer']));
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
