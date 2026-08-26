import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  evaluateTopStories,
  TOP_STORIES_RANKER_VERSION,
} from './topStoriesRanker.js';
import {
  TOP_STORIES_EVENT_CLASSIFIER_VERSION,
} from './topStoriesEventClassifier.js';
import { getTopStoriesPolicy } from './topStoriesPolicy.js';
import {
  buildTopFeedSignalMap,
  extractTopStorySignals,
} from './topStoriesSignals.js';
import {
  getStorySourceFamilies,
  TOP_STORIES_SOURCE_IDENTITY_VERSION,
} from './topStoriesSourceIdentity.js';
import {
  SECTIONS_SHADOW_EXECUTABLE_VERSIONS,
} from '../../../scripts/top-stories-shadow/sectionsShadowAuthorityVersions.mjs';
import {
  buildSectionsSourceRegistryAuthority,
} from '../../../scripts/top-stories-shadow/sectionsShadowSourceRegistry.mjs';
import {
  createSectionsShadowInputEpoch,
  validateSectionsShadowInputEpoch,
} from '../../../scripts/top-stories-shadow/sectionsShadowInputEpoch.mjs';
import {
  evaluateFrozenSectionsEpoch,
} from '../../../scripts/top-stories-shadow/sectionsShadowEvaluator.mjs';

function readJson(path) {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
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

const registry = readJson('../../../config/section_sources.json');
const benchmark = readJson(
  '../../../scripts/top-stories-shadow/fixtures/nw-cf-hybrid-001a-benchmark.json',
);
const registryAuthority = buildSectionsSourceRegistryAuthority(registry);

function buildEpoch(overrides = {}) {
  return createSectionsShadowInputEpoch({
    capturedAt: benchmark.capturedAt,
    nowMs: benchmark.nowMs,
    sourceRegistryVersion: registryAuthority.sourceRegistryVersion,
    sourceRegistryDigest: registryAuthority.sourceRegistryDigest,
    inputSource: benchmark.inputSource,
    sectionItems: benchmark.epochTemplate.sectionItems,
    topFeedItems: benchmark.epochTemplate.topFeedItems,
    settings: benchmark.epochTemplate.settings,
    sourceHealth: benchmark.epochTemplate.sourceHealth,
    frozenBeforeShadowObservation: benchmark.frozenBeforeShadowObservation,
    shadowOutputUsedToChooseExpected: benchmark.shadowOutputUsedToChooseExpected,
    ...overrides,
  }, { expectedRegistryAuthority: registryAuthority });
}

function byIdentity(evidence, identity) {
  return evidence.candidateEvidence.find(row => row.identity === identity);
}

function caseDStory() {
  return benchmark.epochTemplate.sectionItems.muscat.find(
    row => row.id === 'case-d-wrapper-original',
  );
}

describe('NW-CF-HYBRID-001A shared Sections replay authority', () => {
  it('conserves the exact current ten-section / 41-lane source registry', () => {
    expect(registryAuthority.sourceRegistryVersion).toBe('section-source-policy-v1');
    expect(registryAuthority.sectionCount).toBe(benchmark.expected.registrySectionCount);
    expect(registryAuthority.laneCount).toBe(benchmark.expected.registryLaneCount);
    expect(registryAuthority.sourceRegistryDigest).toMatch(/^[0-9a-f]{64}$/);

    const reordered = {
      requiredCoverage: registry.requiredCoverage,
      sections: registry.sections,
      policyVersion: registry.policyVersion,
      schemaVersion: registry.schemaVersion,
    };
    expect(buildSectionsSourceRegistryAuthority(reordered).sourceRegistryDigest)
      .toBe(registryAuthority.sourceRegistryDigest);

    const topicChanged = JSON.parse(JSON.stringify(registry));
    topicChanged.sections.topStories[0].topic = 'changed-topic';
    expect(buildSectionsSourceRegistryAuthority(topicChanged).sourceRegistryDigest)
      .not.toBe(registryAuthority.sourceRegistryDigest);
  });

  it('fails closed when the qualified registry section set is incomplete', () => {
    const broken = JSON.parse(JSON.stringify(registry));
    delete broken.sections.muscat;
    expectErrorCode(
      () => buildSectionsSourceRegistryAuthority(broken),
      'source_registry_section_set_mismatch',
    );
  });

  it('binds shadow provenance versions to the executable modules', () => {
    expect(SECTIONS_SHADOW_EXECUTABLE_VERSIONS.rankerVersion)
      .toBe(TOP_STORIES_RANKER_VERSION);
    expect(SECTIONS_SHADOW_EXECUTABLE_VERSIONS.eventClassifierVersion)
      .toBe(TOP_STORIES_EVENT_CLASSIFIER_VERSION);
    expect(SECTIONS_SHADOW_EXECUTABLE_VERSIONS.sourceIdentityVersion)
      .toBe(TOP_STORIES_SOURCE_IDENTITY_VERSION);
  });

  it('builds an immutable, digest-verified epoch with one explicit clock', () => {
    const epoch = buildEpoch();
    expect(Object.isFrozen(epoch)).toBe(true);
    expect(Object.isFrozen(epoch.sectionItems)).toBe(true);
    expect(epoch.inputEvidenceDigest).toBe(benchmark.expected.inputEvidenceDigest);
    expect(epoch.nowMs).toBe(benchmark.nowMs);

    const tampered = JSON.parse(JSON.stringify(epoch));
    tampered.sectionItems.world[0].title = 'mutated after digest';
    expectErrorCode(
      () => validateSectionsShadowInputEpoch(tampered, {
        expectedRegistryAuthority: registryAuthority,
      }),
      'input_epoch_evidence_digest_mismatch',
    );
  });

  it('makes evidence digest sensitive to source-row sequence', () => {
    const epoch = buildEpoch();
    const reversedSections = Object.fromEntries(
      Object.entries(benchmark.epochTemplate.sectionItems).reverse(),
    );
    const reordered = buildEpoch({ sectionItems: reversedSections });
    expect(reordered.inputEvidenceDigest).not.toBe(epoch.inputEvidenceDigest);
  });

  it('rejects invalid clocks, sensitive evidence, registry drift, and circular benchmark metadata', () => {
    expectErrorCode(() => buildEpoch({ nowMs: null }), 'input_epoch_clock_invalid');
    expectErrorCode(() => buildEpoch({ nowMs: String(benchmark.nowMs) }), 'input_epoch_clock_invalid');
    expectErrorCode(
      () => buildEpoch({ settings: { authorization: 'Bearer secret' } }),
      'input_epoch_sensitive_evidence',
    );
    expectErrorCode(
      () => buildEpoch({ sourceRegistryDigest: '0'.repeat(64) }),
      'input_epoch_registry_digest_mismatch',
    );
    expectErrorCode(
      () => buildEpoch({ shadowOutputUsedToChooseExpected: true }),
      'input_epoch_anti_circularity_invalid',
    );
  });

  it('honors an explicit zero clock instead of falling back to wall time', () => {
    const evaluation = evaluateTopStories({
      sectionItems: {},
      topFeedItems: [],
      nowMs: 0,
    }, { nowMs: 0 });
    expect(evaluation.nowMs).toBe(0);

    const frozen = evaluateFrozenSectionsEpoch(buildEpoch({ nowMs: 0 }), {
      expectedRegistryAuthority: registryAuthority,
    });
    expect(frozen.nowMs).toBe(0);
  });

  it('removes acquisition wrappers from independent publisher evidence', () => {
    const story = caseDStory();
    expect(getStorySourceFamilies(story)).toEqual(
      benchmark.expected.caseDSourceFamilies,
    );

    const wrapperPrimary = {
      ...story,
      source: 'Google News Oman',
      sourceGroup: 'google_news_oman',
    };
    expect(getStorySourceFamilies(wrapperPrimary)).toEqual(
      benchmark.expected.caseDSourceFamilies,
    );

    const aggregatorOnly = {
      source: 'Google News Oman',
      sourceGroup: 'google_news_oman',
      allSources: ['Google News', 'google_news_alt'],
    };
    expect(getStorySourceFamilies(aggregatorOnly)).toEqual(['google_news']);

    const signals = extractTopStorySignals(story, {
      policy: getTopStoriesPolicy(),
      nowMs: benchmark.nowMs,
      topFeedSignalMap: new Map(),
    });
    expect(signals.sourceCount).toBe(benchmark.expected.caseDSourceCountWithoutTopFeed);
    expect(signals.independentEvidenceCount)
      .toBe(benchmark.expected.caseDIndependentEvidenceWithoutTopFeed);
    expect(signals.consensusScore)
      .toBeCloseTo(benchmark.expected.caseDConsensusWithoutTopFeed, 12);
  });

  it('computes Appendix-A Top Feed corroboration without alias inflation', () => {
    const story = caseDStory();
    const topFeedSignalMap = buildTopFeedSignalMap([
      {
        ...story,
        source: 'Reuters',
        sourceGroup: 'google_news_oman',
        topFeedSource: 'top-feed-reuters',
        topFeedRank: 1,
      },
      {
        ...story,
        source: 'AP News',
        sourceGroup: 'ap_news',
        topFeedSource: 'top-feed-ap',
        topFeedRank: 2,
      },
    ]);
    const signals = extractTopStorySignals(story, {
      policy: getTopStoriesPolicy(),
      nowMs: benchmark.nowMs,
      topFeedSignalMap,
    });
    expect(signals.sourceCount).toBe(2);
    expect(signals.topFeedCorroborationHits).toBe(1);
    expect(signals.independentEvidenceCount)
      .toBe(benchmark.expected.caseATopFeedIndependentEvidenceCount);
    expect(signals.consensusScore)
      .toBeCloseTo(benchmark.expected.caseATopFeedConsensusWithOneIndependentHit, 12);
  });

  it('replays the frozen A-O epoch deterministically without mutating input', () => {
    const epoch = buildEpoch();
    const before = JSON.stringify(epoch);
    const first = evaluateFrozenSectionsEpoch(epoch, {
      expectedRegistryAuthority: registryAuthority,
      displayDepth: 10,
    });
    const second = evaluateFrozenSectionsEpoch(epoch, {
      expectedRegistryAuthority: registryAuthority,
      displayDepth: 10,
    });

    expect(JSON.stringify(epoch)).toBe(before);
    expect(second).toEqual(first);
    expect(first.rawInputCount).toBe(benchmark.expected.rawInputCount);
    expect(first.candidateCount).toBe(benchmark.expected.candidateCount);
    expect(first.normalizationDigest).toBe(benchmark.expected.normalizationDigest);
    expect(first.rankerPolicyDigest).toBe(benchmark.expected.rankerPolicyDigest);
    expect(first.decisionOutputDigest).toBe(benchmark.expected.decisionOutputDigest);
    expect(first.selectedIds).toEqual(benchmark.expected.selectedIds);
    expect(first.displayedIds).toEqual(benchmark.expected.displayedIds);

    console.info('NW_CF_HYBRID_001A_REFERENCE_DIGESTS', JSON.stringify({
      sourceRegistryDigest: registryAuthority.sourceRegistryDigest,
      inputEvidenceDigest: epoch.inputEvidenceDigest,
      normalizationDigest: first.normalizationDigest,
      rankerPolicyDigest: first.rankerPolicyDigest,
      decisionOutputDigest: first.decisionOutputDigest,
    }));
  });

  it('preserves frozen boundary and classification/admission expectations', () => {
    const evidence = evaluateFrozenSectionsEpoch(buildEpoch(), {
      expectedRegistryAuthority: registryAuthority,
    });
    expect(byIdentity(evidence, 'case-e-missing-ts').admissionReason)
      .toBe(benchmark.expected.caseEAdmissionReason);
    expect(byIdentity(evidence, 'case-f-malformed-ts').admissionReason)
      .toBe(benchmark.expected.caseFAdmissionReason);
    expect(byIdentity(evidence, 'case-g-exact-12h').ageBand)
      .toBe(benchmark.expected.caseGAgeBand);
    expect(byIdentity(evidence, 'case-g-exact-12h').admissionReason)
      .toBe(benchmark.expected.caseGAdmissionReason);
    expect(byIdentity(evidence, 'case-h-exact-36h').ageBand)
      .toBe(benchmark.expected.caseHAgeBand);
    expect(byIdentity(evidence, 'case-n-mature-nonlocal').admissionReason)
      .toBe(benchmark.expected.caseNAdmissionReason);
    expect(byIdentity(evidence, 'case-o-business').eventType)
      .toBe(benchmark.expected.caseOBusinessEventType);
    expect(byIdentity(evidence, 'case-o-sports').eventType)
      .toBe(benchmark.expected.caseOSportsEventType);
    expect(byIdentity(evidence, 'case-o-entertainment').eventType)
      .toBe(benchmark.expected.caseOEntertainmentEventType);
  });

  it('keeps shared ranking authority with GitHub-default, opt-in Preview serving', () => {
    const evaluatorSource = readFileSync(new URL(
      '../../../scripts/top-stories-shadow/sectionsShadowEvaluator.mjs',
      import.meta.url,
    ), 'utf8');
    const loaderSource = readFileSync(new URL(
      '../../adapters/sectionsSnapshotLoader.js',
      import.meta.url,
    ), 'utf8');
    expect(evaluatorSource).toContain("import { evaluateTopStories }");
    expect(evaluatorSource).not.toContain('freshness: 42');
    expect(evaluatorSource).not.toContain('primary: 0.5');
    expect(loaderSource).toContain("'/newsdata/sections_latest.json'");
    expect(loaderSource).toContain('SECTIONS_DATA_SOURCES.CLOUDFLARE_PREVIEW');
    expect(loaderSource).toContain('getCloudflareSectionsPreviewUrl');
    expect(loaderSource).toContain('fallbackReason');
  });
});
