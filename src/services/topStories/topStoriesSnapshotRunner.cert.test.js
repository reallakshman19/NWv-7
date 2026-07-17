import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { evaluateTopStories } from './topStoriesRanker.js';
import {
  TOP_STORY_TRACE_SCHEMA_VERSION,
  TOP_STORY_TRACE_STAGES,
} from './topStoriesTrace.js';
import {
  createTopStoriesRunArtifacts,
  MAX_RUN_SNAPSHOT_BYTES,
} from '../../../scripts/top-stories-shadow/artifactBundle.mjs';
import { sha256Text } from '../../../scripts/top-stories-shadow/canonicalJson.mjs';

const RUN_AT = '2026-07-16T17:22:00.000Z';
const RUN_MS = Date.parse(RUN_AT);
const COMPLETE_TRACE_STAGES = [
  TOP_STORY_TRACE_STAGES.TIMESTAMP_VALIDATION,
  TOP_STORY_TRACE_STAGES.AGE_WINDOW,
  TOP_STORY_TRACE_STAGES.EVENT_CLASSIFICATION,
  TOP_STORY_TRACE_STAGES.QUALIFICATION_EVIDENCE,
  TOP_STORY_TRACE_STAGES.THRESHOLD,
  TOP_STORY_TRACE_STAGES.FALLBACK_CORROBORATION,
  TOP_STORY_TRACE_STAGES.ADMISSION,
  TOP_STORY_TRACE_STAGES.SELECTION,
  TOP_STORY_TRACE_STAGES.DISPLAY,
];
const CONFIG = JSON.parse(readFileSync(
  new URL('../../../config/top_stories_shadow_study.json', import.meta.url),
  'utf8',
));

function story(index, extra = {}) {
  return {
    id: `story-${index}`,
    canonicalId: `canonical-${index}`,
    title: `Explosion injures residents near railway station ${index}`,
    source: `Trusted Source ${index}`,
    sourceGroup: `publisher-${index}`,
    section: `section-${index}`,
    country: `country-${index}`,
    publishedAt: RUN_MS - (30 * 60 * 1000),
    timestampConfidence: 'high',
    body: `licensed body ${index}`,
    token: `secret-${index}`,
    ...extra,
  };
}

function inputBundle(extra = {}) {
  return {
    sectionItems: Object.fromEntries(
      Array.from({ length: 12 }, (_, index) => [
        `section-${index}`,
        [story(index)],
      ]),
    ),
    topFeedItems: [],
    settings: {},
    sourceHealth: { ok: true, complete: true, failedSourceCount: 0 },
    inputSource: 'repository-public-newsdata-sections',
    inputSnapshotGeneratedAt: '2026-07-16T17:15:00.000Z',
    inputDiagnostics: {
      servedFrom: 'repository-snapshot',
      authorization: 'Bearer hidden',
    },
    ...extra,
  };
}

function metadata(extra = {}) {
  return {
    repositorySha: 'abc123def456',
    workflowRunId: 'manual-001',
    workflowRunAttempt: 1,
    scheduledAt: '2026-07-16T17:07:00.000Z',
    runAt: RUN_AT,
    ...extra,
  };
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

function collectKeys(value, result = new Set()) {
  if (Array.isArray(value)) {
    value.forEach(item => collectKeys(item, result));
    return result;
  }
  if (!value || typeof value !== 'object') return result;
  Object.entries(value).forEach(([key, nested]) => {
    result.add(key);
    collectKeys(nested, result);
  });
  return result;
}

describe('NW-RANK-011C stateless snapshot runner', () => {
  it('uses one frozen clock and preserves authoritative ranked output', () => {
    const input = deepFreeze(inputBundle());
    const config = deepFreeze({ ...CONFIG });
    const runMetadata = deepFreeze(metadata());
    const dateSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
      throw new Error('Date.now must not be called');
    });

    const result = createTopStoriesRunArtifacts({
      studyConfig: config,
      inputBundle: input,
      metadata: runMetadata,
    });
    dateSpy.mockRestore();

    expect(result.ok).toBe(true);
    expect(result.snapshot.nowMs).toBe(RUN_MS);
    const direct = evaluateTopStories(
      { ...input, nowMs: RUN_MS },
      {
        limit: CONFIG.rankerLimit,
        displayDepth: CONFIG.displayDepth,
        nowMs: RUN_MS,
      },
    );
    expect(result.snapshot.rankedIds).toEqual(direct.rankedIds);
    expect(result.snapshot.ranked[0]._topStoryRank)
      .toEqual(direct.selected[0]._topStoryRank);
    expect(result.snapshot.rankedCount).toBeGreaterThan(10);
    expect(result.snapshot.displayedCount).toBe(10);
  });

  it('records immutable observation facts without cross-run state', () => {
    const result = createTopStoriesRunArtifacts({
      studyConfig: CONFIG,
      inputBundle: inputBundle(),
      metadata: metadata(),
    });
    const snapshot = result.snapshot;
    const keys = collectKeys(snapshot);

    expect(snapshot).toMatchObject({
      observationMode: 'repository-snapshot-replay',
      completenessState: 'COMPLETE',
      analyticalEligibility: 'ELIGIBLE',
      scheduleDelaySeconds: 900,
      displayDepth: 10,
    });
    expect(snapshot.candidateEvidence.every(item => item._studyIdentity)).toBe(true);
    expect(snapshot.funnel.map(stage => stage.outputUnit)).toEqual([
      'SOURCE_ROW',
      'RANKING_CANDIDATE',
      'RANKING_CANDIDATE',
      'RANKED_ITEM',
      'DISPLAYED_ITEM',
    ]);
    expect(snapshot.selectionTrace.every(trace => (
      trace.schemaVersion === TOP_STORY_TRACE_SCHEMA_VERSION
    ))).toBe(true);
    expect(snapshot.selectionTrace.every(trace => (
      trace.terminalStage && trace.terminalReasonCode
    ))).toBe(true);
    expect(snapshot.selectionTrace[0].stages.map(stage => stage.stage))
      .toEqual(COMPLETE_TRACE_STAGES);
    [
      'firstSeen', 'previousRank', 'entrant', 'exit', 'residence',
      'incumbentRetention', 'jaccard',
    ].forEach(key => expect(keys.has(key)).toBe(false));
  });

  it('removes article bodies, secrets, authorization, and viewed state', () => {
    const input = inputBundle({
      sectionItems: {
        world: [{
          ...story(1),
          html: '<p>licensed</p>',
          content: 'full article',
          viewed: true,
        }],
      },
    });
    const result = createTopStoriesRunArtifacts({
      studyConfig: CONFIG,
      inputBundle: input,
      metadata: metadata(),
    });
    const text = result.files['snapshot.json'];

    expect(text).not.toContain('licensed body');
    expect(text).not.toContain('full article');
    expect(text).not.toContain('Bearer hidden');
    expect(text).not.toContain('secret-1');
    expect(text).not.toContain('"viewed"');
  });

  it('produces byte-stable artifacts with verifiable hashes and sizes', () => {
    const args = {
      studyConfig: CONFIG,
      inputBundle: inputBundle(),
      metadata: metadata(),
    };
    const first = createTopStoriesRunArtifacts(args);
    const second = createTopStoriesRunArtifacts(args);
    const snapshotText = first.files['snapshot.json'];
    const manifest = JSON.parse(first.files['manifest.json']);
    const file = manifest.files[0];

    expect(first.files).toEqual(second.files);
    expect(file.name).toBe('snapshot.json');
    expect(file.byteSize).toBe(Buffer.byteLength(snapshotText, 'utf8'));
    expect(file.byteSize).toBeLessThan(MAX_RUN_SNAPSHOT_BYTES);
    expect(file.sha256).toBe(sha256Text(snapshotText));
    expect(manifest.integrityScope)
      .toBe('accidental-corruption-and-transfer-completeness-only');
  });

  it('keeps completeness separate from analytical eligibility', () => {
    const partial = createTopStoriesRunArtifacts({
      studyConfig: CONFIG,
      inputBundle: inputBundle({
        sourceHealth: { ok: false, complete: false, failedSourceCount: 2 },
      }),
      metadata: metadata(),
    });
    const completeButUninterpretable = createTopStoriesRunArtifacts({
      studyConfig: CONFIG,
      inputBundle: inputBundle({
        sourceHealth: { ok: false, complete: true, failedSourceCount: 2 },
      }),
      metadata: metadata(),
    });

    expect(partial.snapshot.completenessState).toBe('PARTIAL_INPUT');
    expect(partial.snapshot.analyticalEligibility).toBe('INELIGIBLE');
    expect(completeButUninterpretable.snapshot.completenessState).toBe('COMPLETE');
    expect(completeButUninterpretable.snapshot.analyticalEligibility)
      .toBe('INPUT_CHANGED_UNINTERPRETABLE');
  });

  it('emits distinct failure artifacts for missing, malformed, and invalid inputs', () => {
    const badConfig = createTopStoriesRunArtifacts({
      studyConfig: { ...CONFIG, studyId: '' },
      inputBundle: inputBundle(),
      metadata: metadata(),
    });
    const missingInput = createTopStoriesRunArtifacts({
      studyConfig: CONFIG,
      metadata: metadata(),
    });
    const malformedInput = createTopStoriesRunArtifacts({
      studyConfig: CONFIG,
      inputBundle: {},
      metadata: metadata(),
    });
    const badTiming = createTopStoriesRunArtifacts({
      studyConfig: CONFIG,
      inputBundle: inputBundle(),
      metadata: metadata({
        scheduledAt: '2026-07-16T17:30:00.000Z',
      }),
    });

    expect(badConfig.ok).toBe(false);
    expect(badConfig.files['failure.json']).toContain('missing_study_configuration');
    expect(badConfig.files['snapshot.json']).toBeUndefined();
    expect(missingInput.ok).toBe(false);
    expect(missingInput.files['failure.json'])
      .toContain('missing_repository_snapshot_input');
    expect(malformedInput.ok).toBe(false);
    expect(malformedInput.files['failure.json'])
      .toContain('invalid_repository_snapshot_input');
    expect(badTiming.ok).toBe(false);
    expect(badTiming.files['failure.json'])
      .toContain('runAt cannot be earlier than scheduledAt');
  });
});
