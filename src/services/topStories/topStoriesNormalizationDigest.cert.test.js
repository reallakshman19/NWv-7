import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluateTopStories } from './topStoriesRanker.js';
import {
  createTopStoriesRunArtifacts,
} from '../../../scripts/top-stories-shadow/artifactBundle.mjs';
import {
  getRankingInputDigest,
} from '../../../scripts/top-stories-shadow/canonicalJson.mjs';
import {
  buildTopStoriesNormalizationDigestValue,
  getTopStoriesNormalizationDigest,
  TOP_STORIES_NORMALIZATION_VERSION,
} from '../../../scripts/top-stories-shadow/normalizationDigest.mjs';

const RUN_AT = '2026-07-18T12:22:00.000Z';
const RUN_MS = Date.parse(RUN_AT);
const CONFIG = JSON.parse(readFileSync(
  new URL('../../../config/top_stories_shadow_study.json', import.meta.url),
  'utf8',
));

function story(id, extra = {}) {
  return {
    id,
    canonicalId: `canonical-${id}`,
    title: `Explosion injures residents near railway station ${id}`,
    summary: `Public safety update ${id}`,
    source: `Trusted Source ${id}`,
    sourceGroup: `publisher-${id}`,
    section: 'world',
    publishedAt: RUN_MS - (30 * 60 * 1000),
    fetchedAt: RUN_MS - (25 * 60 * 1000),
    timestampConfidence: 'high',
    ...extra,
  };
}

function input(rows) {
  return {
    sectionItems: { world: rows },
    topFeedItems: [],
    settings: {},
    sourceHealth: { ok: true, complete: true, failedSourceCount: 0 },
    inputSource: 'repository-public-newsdata-sections',
    inputSnapshotGeneratedAt: '2026-07-18T12:15:00.000Z',
  };
}

function metadata() {
  return {
    repositorySha: 'normalization-digest-sha',
    workflowRunId: 'normalization-digest-run',
    workflowRunAttempt: 1,
    scheduledAt: '2026-07-18T12:07:00.000Z',
    runAt: RUN_AT,
  };
}

function evaluate(bundle) {
  return evaluateTopStories(
    { ...bundle, nowMs: RUN_MS },
    { nowMs: RUN_MS, limit: 25, displayDepth: 10 },
  );
}

describe('Top Stories normalization digest', () => {
  it('is deterministic and independent of source-row permutation', () => {
    const first = evaluate(input([story('a'), story('b'), story('c')]));
    const second = evaluate(input([story('c'), story('a'), story('b')]));

    expect(getTopStoriesNormalizationDigest(first))
      .toBe(getTopStoriesNormalizationDigest(second));
    expect(buildTopStoriesNormalizationDigestValue(first)).toMatchObject({
      normalizationVersion: TOP_STORIES_NORMALIZATION_VERSION,
      rawInputCount: 3,
      candidateCount: 3,
      candidateBuildDispositionCounts: {
        PROMOTED_TO_CANDIDATE: 3,
      },
      candidateBuildReasonCounts: {
        candidate_created: 3,
      },
    });
  });

  it('detects rank-relevant timestamp evidence hidden by the raw input digest', () => {
    const firstInput = input([story('a', {
      timestampConfidence: undefined,
      fetchedAt: RUN_MS - (29 * 60 * 1000),
    })]);
    const secondInput = input([story('a', {
      timestampConfidence: undefined,
      fetchedAt: RUN_MS - (10 * 60 * 1000),
    })]);
    const first = evaluate(firstInput);
    const second = evaluate(secondInput);

    expect(getRankingInputDigest(firstInput)).toBe(getRankingInputDigest(secondInput));
    expect(getTopStoriesNormalizationDigest(first))
      .not.toBe(getTopStoriesNormalizationDigest(second));
  });

  it('ignores licensed bodies, secrets and runtime-only candidate timestamps', () => {
    const first = evaluate(input([story('a', {
      body: 'licensed article body one',
      content: 'full article one',
      token: 'secret-one',
    })]));
    const second = evaluate(input([story('a', {
      body: 'licensed article body two',
      content: 'full article two',
      token: 'secret-two',
    })]));

    expect(getTopStoriesNormalizationDigest(first))
      .toBe(getTopStoriesNormalizationDigest(second));
  });

  it('records candidate-build normalization outcomes', () => {
    const single = evaluate(input([story('a')]));
    const duplicate = evaluate(input([
      story('a'),
      story('a', { source: 'Second Source' }),
    ]));
    const value = buildTopStoriesNormalizationDigestValue(duplicate);

    expect(getTopStoriesNormalizationDigest(single))
      .not.toBe(getTopStoriesNormalizationDigest(duplicate));
    expect(value).toMatchObject({
      rawInputCount: 2,
      candidateCount: 1,
      candidateBuildDispositionCounts: {
        COLLAPSED_AS_DUPLICATE: 1,
        PROMOTED_TO_CANDIDATE: 1,
      },
      candidateBuildReasonCounts: {
        candidate_created: 1,
        duplicate_identity: 1,
      },
    });
  });

  it('publishes the versioned digest in deterministic run snapshots', () => {
    const args = {
      studyConfig: CONFIG,
      inputBundle: input([story('a'), story('b')]),
      metadata: metadata(),
    };
    const first = createTopStoriesRunArtifacts(args);
    const second = createTopStoriesRunArtifacts(args);

    expect(first.ok).toBe(true);
    expect(first.snapshot.normalizationVersion)
      .toBe(TOP_STORIES_NORMALIZATION_VERSION);
    expect(first.snapshot.normalizationDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(first.snapshot.normalizationDigest)
      .toBe(second.snapshot.normalizationDigest);
    expect(first.files).toEqual(second.files);
    expect(first.files['snapshot.json']).not.toContain('licensed article body');
    expect(first.files['snapshot.json']).not.toContain('secret-one');
  });
});
