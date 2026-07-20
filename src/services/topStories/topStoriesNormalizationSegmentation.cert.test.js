import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildTopStoriesVersionSegmentKey,
  normalizeTopStoriesNormalizationDigest,
  TOP_STORIES_NORMALIZATION_REASON_CODES,
  TOP_STORIES_NORMALIZATION_VERSION,
  TOP_STORIES_VERSION_SEGMENT_FIELDS,
  validateTopStoriesNormalizationEvidence,
} from './topStoriesVersionSegment.js';
import { buildTopStoriesObservationPairs } from './topStoriesObservationPairing.js';
import { analyzeTopStoriesSequence } from './topStoriesSequentialReplay.js';

const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'B'.repeat(64);
const BASE = Object.freeze({
  studyId: 'normalization-study',
  rankerVersion: 'ranker-v1',
  identityVersion: 'identity-v1',
  periodClassifierVersion: 'period-v1',
  normalizationVersion: TOP_STORIES_NORMALIZATION_VERSION,
  completenessState: 'COMPLETE',
  analyticalEligibility: 'ELIGIBLE',
  sourceHealth: { ok: true, complete: true, failedSourceCount: 0 },
});

function story() {
  return {
    id: 'row-stable',
    canonicalId: 'stable',
    title: 'Stable public update remains visible',
    sourceGroup: 'publisher',
    _topStoryRank: {
      eventType: 'unknown',
      eventQualified: false,
      slotBand: 'secondary',
      independentEvidenceCount: 0,
      sourceCount: 1,
      normalizedScore: 0.5,
    },
  };
}

function observation(index, extra = {}) {
  const time = Date.UTC(2026, 6, 20, 0, index * 15);
  const displayed = extra.displayed ?? [story()];
  return {
    ...BASE,
    observationId: `observation-${index}`,
    scheduledAt: new Date(time).toISOString(),
    runAt: time,
    workflowRunId: `run-${index}`,
    workflowRunAttempt: 1,
    normalizationDigest: index % 2 ? DIGEST_B : DIGEST_A,
    displayed,
    scoredCandidates: displayed,
    ...extra,
  };
}

function pairingConfig() {
  return {
    horizonMs: 15 * 60 * 1000,
    minIntervalMs: 8 * 60 * 1000,
    maxIntervalMs: 30 * 60 * 1000,
    expectedNormalizationVersion: TOP_STORIES_NORMALIZATION_VERSION,
  };
}

function source(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

describe('NW-RANK-012B shared normalization segment authority', () => {
  it('constructs the exact five-field segment in fixed order', () => {
    expect(TOP_STORIES_VERSION_SEGMENT_FIELDS).toEqual([
      'studyId', 'rankerVersion', 'identityVersion',
      'periodClassifierVersion', 'normalizationVersion',
    ]);
    expect(buildTopStoriesVersionSegmentKey(BASE)).toBe(
      'normalization-study|ranker-v1|identity-v1|period-v1|' +
      TOP_STORIES_NORMALIZATION_VERSION,
    );
  });

  it('normalizes digest case and rejects every malformed evidence class', () => {
    expect(normalizeTopStoriesNormalizationDigest(DIGEST_B)).toBe(DIGEST_B.toLowerCase());
    expect(validateTopStoriesNormalizationEvidence({
      ...BASE, normalizationDigest: DIGEST_A,
    }).eligible).toBe(true);
    const cases = [
      [{ ...BASE, normalizationVersion: '', normalizationDigest: DIGEST_A },
        TOP_STORIES_NORMALIZATION_REASON_CODES.versionMissing],
      [{ ...BASE, normalizationVersion: 'normalization-v2', normalizationDigest: DIGEST_A },
        TOP_STORIES_NORMALIZATION_REASON_CODES.versionUnsupported],
      [{ ...BASE, normalizationDigest: '' },
        TOP_STORIES_NORMALIZATION_REASON_CODES.digestMissing],
      [{ ...BASE, normalizationDigest: 'not-a-sha256' },
        TOP_STORIES_NORMALIZATION_REASON_CODES.digestInvalid],
    ];
    cases.forEach(([row, reason]) => {
      expect(validateTopStoriesNormalizationEvidence(row).reasonCodes).toContain(reason);
    });
  });
});

describe('NW-RANK-012B observation pairing', () => {
  it('pairs same-version observations with different valid digests deterministically', () => {
    const input = [observation(1), observation(0), observation(2)];
    const before = JSON.stringify(input);
    const first = buildTopStoriesObservationPairs(input, pairingConfig());
    const second = buildTopStoriesObservationPairs([...input].reverse(), pairingConfig());
    expect(first.pairs.map(row => [row.anchorId, row.currentId]))
      .toEqual(second.pairs.map(row => [row.anchorId, row.currentId]));
    expect(first.pairs[0].anchor.normalizationDigest)
      .not.toBe(first.pairs[0].current.normalizationDigest);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('rejects cross-version pairing even when digests match', () => {
    const result = buildTopStoriesObservationPairs([
      observation(0, { normalizationDigest: DIGEST_A }),
      observation(1, {
        normalizationVersion: 'nw-top-stories-normalization-v2',
        normalizationDigest: DIGEST_A,
      }),
    ], pairingConfig());
    expect(result.pairs).toHaveLength(0);
    expect(result.exclusions[0].reason).toBe('normalization_version_boundary');
  });

  it('retains precise missing and invalid normalization exclusions', () => {
    const missing = buildTopStoriesObservationPairs([
      observation(0, { normalizationVersion: undefined }),
      observation(1),
    ], pairingConfig());
    const invalid = buildTopStoriesObservationPairs([
      observation(0, { normalizationDigest: 'bad' }),
      observation(1),
    ], pairingConfig());
    expect(missing.exclusions[0].reason).toBe('normalization_version_missing');
    expect(invalid.exclusions[0].reason).toBe('normalization_digest_invalid');
  });
});

describe('NW-RANK-012B sequential replay boundaries', () => {
  it('closes residence across invalid normalization and starts a later episode', () => {
    const result = analyzeTopStoriesSequence([
      observation(0),
      observation(1),
      observation(2, { normalizationDigest: undefined }),
      observation(3),
      observation(4),
    ], { expectedNormalizationVersion: TOP_STORIES_NORMALIZATION_VERSION });
    const stable = result.residenceEpisodes.filter(row =>
      row.editorialIdentity?.includes('canonical_id'));
    expect(stable).toHaveLength(2);
    expect(stable.map(row => row.observationCount)).toEqual([2, 2]);
    expect(result.adjacentComparisons[1].eligibleForHeadlineKpi).toBe(false);
    expect(result.adjacentComparisons[1].comparisonEligibilityReasons)
      .toContain('normalization_digest_missing');
  });

  it('closes residence at a normalization-version boundary', () => {
    const result = analyzeTopStoriesSequence([
      observation(0),
      observation(1, { normalizationVersion: 'nw-top-stories-normalization-v2' }),
    ], { expectedNormalizationVersion: TOP_STORIES_NORMALIZATION_VERSION });
    expect(result.adjacentComparisons[0].comparisonEligibilityReasons)
      .toContain('normalization_version_boundary');
    expect(result.adjacentComparisons[0].eligibleForHeadlineKpi).toBe(false);
  });
});

describe('NW-RANK-012B static source guards', () => {
  it('keeps segment construction in the shared authority only', () => {
    const consumers = [
      './topStoriesObservationPairing.js',
      './topStoriesSequentialReplay.js',
      '../../../scripts/top-stories-shadow/dailyAggregation.mjs',
      '../../../scripts/top-stories-shadow/operationalValidation.mjs',
      '../../../scripts/top-stories-shadow/pilotDecision.mjs',
    ].map(source);
    consumers.forEach(text => {
      expect(text).toContain('topStoriesVersionSegment.js');
      expect(text).not.toMatch(/function\s+(get|expected)Segment(Key)?\s*\(/);
      expect(text).not.toMatch(/\[\s*[^\]]*studyId[^\]]*rankerVersion[^\]]*identityVersion/);
    });
  });

  it('has no digest-equality pairing requirement or CLI normalization override', () => {
    const pairing = source('./topStoriesObservationPairing.js');
    const cli = source('../../../scripts/aggregate_top_stories_shadow.mjs');
    const pilotCli = source('../../../scripts/build_top_stories_pilot_decision.mjs');
    expect(pairing).not.toMatch(/normalizationDigest\s*===|===\s*.*normalizationDigest/);
    const overridePattern = /normalization-version|normalization-digest|segment-key|study-id/;
    expect(cli).not.toMatch(overridePattern);
    expect(pilotCli).not.toMatch(overridePattern);
    expect(cli).toContain('validateTopStoriesStudyConfig');
  });
});
