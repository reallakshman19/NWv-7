import { describe, expect, it } from 'vitest';
import { validateRepositoryReplayInput } from '../../../scripts/top-stories-shadow/inputContract.mjs';
import {
  buildRepositoryReplayInput,
  REPOSITORY_ITEM_MAX_AGE_MS,
  REPOSITORY_REPLAY_PRIORITY_SECTIONS,
  REPOSITORY_SECTION_LIMIT,
} from '../../../scripts/top-stories-shadow/repositoryReplayAdapter.mjs';

const NOW_MS = Date.UTC(2026, 6, 16, 18, 7);

function story(section, index, extra = {}) {
  return {
    id: `${section}-${index}`,
    title: `Explosion alert ${section} ${index}`,
    summary: `Summary ${index}`,
    source: `Source ${index}`,
    sourceGroup: `publisher-${index}`,
    url: `https://example.com/${section}/${index}`,
    publishedAt: NOW_MS - ((index + 1) * 60 * 1000),
    timestampConfidence: 'high',
    ...extra,
  };
}

function sectionsSnapshot(extra = {}) {
  const sections = Object.fromEntries(
    [...new Set(Object.values(REPOSITORY_REPLAY_PRIORITY_SECTIONS))]
      .map(section => [
        section,
        Array.from({ length: 14 }, (_, index) => story(section, index)),
      ]),
  );
  return {
    schemaVersion: 2,
    fetchedAt: NOW_MS - (5 * 60 * 1000),
    contentHash: 'fixture-hash',
    sections,
    ...extra,
  };
}

function sourceHealth(extra = {}) {
  return {
    lastChecked: NOW_MS - (5 * 60 * 1000),
    sources: {
      trusted: { ok: true, status: 'ok', items: 20 },
      failed: { ok: false, status: 'fail', items: 0 },
      warning: { ok: true, status: 'warn', items: 0 },
    },
    ...extra,
  };
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

describe('NW-RANK-011D repository replay adapter', () => {
  it('maps Main priority aliases and limits every section to ten rows', () => {
    const input = buildRepositoryReplayInput({
      sectionsSnapshot: sectionsSnapshot(),
      sourceHealthSnapshot: sourceHealth(),
      nowMs: NOW_MS,
    });

    expect(Object.keys(input.sectionItems)).toEqual([
      'world',
      'india',
      'chennai',
      'trichy',
      'local',
    ]);
    expect(input.sectionItems.chennai[0]).toMatchObject({
      section: 'chennai',
      sourceSection: 'tn',
    });
    expect(input.sectionItems.local[0]).toMatchObject({
      section: 'local',
      sourceSection: 'muscat',
    });
    Object.values(input.sectionItems).forEach(rows => {
      expect(rows).toHaveLength(REPOSITORY_SECTION_LIMIT);
    });
  });

  it('uses frozen time for freshness and reports stale fallback', () => {
    const stalePublishedAt = NOW_MS - REPOSITORY_ITEM_MAX_AGE_MS - 1;
    const snapshot = sectionsSnapshot({
      sections: {
        world: [story('world', 1, { publishedAt: stalePublishedAt })],
        india: [story('india', 1, { publishedAt: stalePublishedAt })],
        tn: [story('tn', 1, { publishedAt: stalePublishedAt })],
        trichy: [story('trichy', 1, { publishedAt: stalePublishedAt })],
        muscat: [story('muscat', 1, { publishedAt: stalePublishedAt })],
      },
    });
    const input = buildRepositoryReplayInput({
      sectionsSnapshot: snapshot,
      sourceHealthSnapshot: sourceHealth(),
      nowMs: NOW_MS,
    });

    expect(input.sectionItems.world).toHaveLength(1);
    expect(input.inputDiagnostics.sectionDiagnostics.world.staleFallback)
      .toBe(true);
    expect(input.inputDiagnostics.sectionDiagnostics.world.freshCount)
      .toBe(0);
  });

  it('marks stale and partial repository input without inventing Top Feed rows', () => {
    const snapshot = sectionsSnapshot({
      fetchedAt: NOW_MS - (13 * 60 * 60 * 1000),
    });
    delete snapshot.sections.muscat;
    const input = buildRepositoryReplayInput({
      sectionsSnapshot: snapshot,
      sourceHealthSnapshot: sourceHealth(),
      nowMs: NOW_MS,
    });

    expect(input.topFeedItems).toEqual([]);
    expect(input.settings).toEqual({});
    expect(input.sourceHealth).toMatchObject({
      ok: false,
      complete: false,
      snapshotStale: true,
      failedSourceCount: 1,
      warningSourceCount: 1,
      missingSections: ['muscat'],
    });
    expect(input.inputDiagnostics.topFeedMode)
      .toBe('explicit-empty-current-main-runtime-contract');
  });

  it('passes the 011C input contract and does not mutate deep-frozen input', () => {
    const sections = deepFreeze(sectionsSnapshot());
    const health = deepFreeze(sourceHealth());
    const input = buildRepositoryReplayInput({
      sectionsSnapshot: sections,
      sourceHealthSnapshot: health,
      nowMs: NOW_MS,
    });

    expect(validateRepositoryReplayInput(input)).toBe(input);
    expect(sections.sections.tn).toHaveLength(14);
    expect(health.sources.failed.status).toBe('fail');
  });
});
