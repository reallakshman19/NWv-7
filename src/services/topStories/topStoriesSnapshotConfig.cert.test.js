import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  digestCanonicalJson,
  getRankingInputDigest,
} from '../../../scripts/top-stories-shadow/canonicalJson.mjs';
import {
  sanitizeObservationEvidence,
  sanitizeStoryEvidence,
  validateRepositoryReplayInput,
} from '../../../scripts/top-stories-shadow/inputContract.mjs';
import {
  StudyConfigurationError,
  validateTopStoriesStudyConfig,
} from '../../../scripts/top-stories-shadow/studyConfig.mjs';

const RUN_AT = Date.UTC(2026, 6, 16, 17, 22);
const CONFIG = JSON.parse(readFileSync(
  new URL('../../../config/top_stories_shadow_study.json', import.meta.url),
  'utf8',
));

function inputBundle(extra = {}) {
  return {
    sectionItems: {
      world: [{
        id: 'story-1',
        title: 'Flood evacuation alert issued for residents',
        source: 'Trusted Source',
        fetchedAt: '2026-07-16T17:00:00Z',
        sectionFetchDurationMs: 120,
      }],
    },
    topFeedItems: [],
    settings: {},
    sourceHealth: { ok: true, complete: true },
    inputSource: 'repository-public-newsdata-sections',
    inputSnapshotGeneratedAt: '2026-07-16T17:00:00Z',
    ...extra,
  };
}

describe('NW-RANK-011C fixed study configuration', () => {
  it('validates the committed immutable study configuration', () => {
    const result = validateTopStoriesStudyConfig(CONFIG, { nowMs: RUN_AT });

    expect(result.studyId).toBe('nw-rank-011-shadow-pilot-2026-07');
    expect(result.observationMode).toBe('repository-snapshot-replay');
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('fails closed without a study ID instead of defaulting', () => {
    const invalid = { ...CONFIG, studyId: '' };

    expect(() => validateTopStoriesStudyConfig(invalid, { nowMs: RUN_AT }))
      .toThrowError(StudyConfigurationError);
    try {
      validateTopStoriesStudyConfig(invalid, { nowMs: RUN_AT });
    } catch (error) {
      expect(error.code).toBe('missing_study_configuration');
    }
  });

  it('rejects unsupported modes, version drift, and expired studies', () => {
    expect(() => validateTopStoriesStudyConfig(
      { ...CONFIG, observationMode: 'user-visible-snapshot' },
      { nowMs: RUN_AT },
    )).toThrow(/repository-snapshot-replay/);
    expect(() => validateTopStoriesStudyConfig(
      { ...CONFIG, identityVersion: 'identity-v-next' },
      { nowMs: RUN_AT },
    )).toThrow(/identityVersion/);
    expect(() => validateTopStoriesStudyConfig(
      CONFIG,
      { nowMs: Date.UTC(2026, 8, 1) },
    )).toThrow(/expired/);
  });
});

describe('NW-RANK-011C canonical input digests', () => {
  it('is stable under object-key and source-row ordering', () => {
    const first = inputBundle({
      sectionItems: {
        world: [
          { id: 'b', title: 'Flood alert B', source: 'B' },
          { id: 'a', title: 'Flood alert A', source: 'A' },
        ],
      },
    });
    const second = inputBundle({
      sectionItems: {
        world: [
          { source: 'A', title: 'Flood alert A', id: 'a' },
          { source: 'B', id: 'b', title: 'Flood alert B' },
        ],
      },
    });

    expect(getRankingInputDigest(first)).toBe(getRankingInputDigest(second));
    expect(digestCanonicalJson({ b: 2, a: 1 }))
      .toBe(digestCanonicalJson({ a: 1, b: 2 }));
  });

  it('ignores declared volatile diagnostics but detects story changes', () => {
    const first = inputBundle();
    const volatileChange = inputBundle({
      sectionItems: {
        world: [{
          ...first.sectionItems.world[0],
          fetchedAt: '2026-07-16T17:15:00Z',
          sectionFetchDurationMs: 999,
        }],
      },
    });
    const meaningfulChange = inputBundle({
      sectionItems: {
        world: [{
          ...first.sectionItems.world[0],
          title: 'Flood evacuation order expanded to more residents',
        }],
      },
    });

    expect(getRankingInputDigest(first)).toBe(getRankingInputDigest(volatileChange));
    expect(getRankingInputDigest(first)).not.toBe(getRankingInputDigest(meaningfulChange));
  });
});

describe('NW-RANK-011C repository input and minimization', () => {
  it('requires an explicit repository replay envelope', () => {
    expect(validateRepositoryReplayInput(inputBundle()).inputSource)
      .toBe('repository-public-newsdata-sections');
    expect(() => validateRepositoryReplayInput({})).toThrow(/sectionItems/);
  });

  it('keeps ranking evidence while removing bodies, secrets, and read state', () => {
    const story = sanitizeStoryEvidence({
      id: 's1',
      title: 'Public alert',
      country: 'Oman',
      body: 'licensed body',
      content: 'full article',
      html: '<p>article</p>',
      token: 'secret-token',
      viewed: true,
      _topStoryRank: { normalizedScore: 0.8, token: 'nested-secret' },
    });
    const diagnostics = sanitizeObservationEvidence({
      ok: true,
      authorization: 'Bearer secret',
      nested: { password: 'hidden', count: 3 },
    });

    expect(story).toMatchObject({
      id: 's1',
      title: 'Public alert',
      country: 'Oman',
      _topStoryRank: { normalizedScore: 0.8 },
    });
    expect(JSON.stringify(story)).not.toContain('licensed body');
    expect(JSON.stringify(story)).not.toContain('secret-token');
    expect(diagnostics).toEqual({ nested: { count: 3 }, ok: true });
  });
});
