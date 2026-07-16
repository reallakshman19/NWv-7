import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  evaluateTopStories,
  rankTopStories,
} from './topStoriesRanker.js';

const NOW = Date.UTC(2026, 6, 16, 12, 0, 0);
const HOUR = 60 * 60 * 1000;

function story(id, extra = {}) {
  return {
    id,
    title: `Flood evacuation alert issued for residents ${id}`,
    section: extra.section || `section-${id}`,
    source: extra.source || `Source ${id}`,
    sourceGroup: extra.sourceGroup || `source-${id}`,
    publishedAt: NOW - HOUR,
    timestampConfidence: 'high',
    ...extra,
  };
}

function makeInput(items, topFeedItems = []) {
  return {
    sectionItems: { world: items },
    topFeedItems,
    nowMs: NOW,
  };
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

describe('NW-RANK-011A Top Stories evaluator trace', () => {
  it('delegates rankTopStories to a deeply equivalent selected output', () => {
    const input = makeInput(
      Array.from({ length: 12 }, (_, index) => story(`s${index}`)),
    );
    const options = { limit: 12, displayDepth: 10 };
    const evaluation = evaluateTopStories(input, options);

    expect(rankTopStories(input, options)).toEqual(evaluation.selected);
    expect(evaluation.rankedCount).toBe(12);
    expect(evaluation.displayDepth).toBe(10);
    expect(evaluation.displayedCount).toBe(10);
    expect(evaluation.rankedIds).toEqual(
      evaluation.selected.map(item => item.id),
    );
    expect(evaluation.displayedTopNIds).toEqual(
      evaluation.selected.slice(0, 10).map(item => item.id),
    );
  });

  it('records one terminal selection disposition per candidate', () => {
    const items = [
      story('displayed'),
      story('ranked-not-displayed'),
      story('rejected', {
        title: 'Community update',
      }),
    ];
    const evaluation = evaluateTopStories(
      makeInput(items),
      { limit: 2, displayDepth: 1 },
    );
    const traces = evaluation.selectionTrace;

    expect(traces).toHaveLength(evaluation.scoredCandidates.length);
    expect(traces.every(trace => trace.finalDisposition)).toBe(true);
    expect(traces.every(trace => trace.finalStage)).toBe(true);
    expect(traces.every(trace => trace.finalReasonCode)).toBe(true);
    expect(traces.find(trace => trace.candidateId === 'displayed'))
      .toMatchObject({
        finalDisposition: 'DISPLAYED',
        displayedRank: 1,
      });
    expect(traces.find(
      trace => trace.candidateId === 'ranked-not-displayed',
    )).toMatchObject({
      finalDisposition: 'RANKED_NOT_DISPLAYED',
      finalReasonCode: 'outside_display_limit',
    });
    expect(traces.find(trace => trace.candidateId === 'rejected'))
      .toMatchObject({
        finalDisposition: 'REJECTED_BY_ADMISSION',
        finalStage: 'admission',
        finalReasonCode: 'unqualified_without_independent_evidence',
      });
  });

  it('conserves source-row accounting through candidate creation', () => {
    const first = story('same', { source: 'Source A' });
    const duplicate = story('same', { source: 'Source B' });
    const input = makeInput([first, duplicate, null, {}]);
    const evaluation = evaluateTopStories(input);
    const counts = evaluation.candidateBuildTrace.reduce(
      (result, row) => ({
        ...result,
        [row.buildDisposition]:
          (result[row.buildDisposition] || 0) + 1,
      }),
      {},
    );

    expect(evaluation.rawInputCount).toBe(4);
    expect(counts).toEqual({
      PROMOTED_TO_CANDIDATE: 1,
      COLLAPSED_AS_DUPLICATE: 1,
      INVALID_INPUT: 2,
    });
    expect(counts.PROMOTED_TO_CANDIDATE)
      .toBe(evaluation.candidates.length);
    expect(Object.values(counts).reduce((sum, value) => sum + value, 0))
      .toBe(evaluation.rawInputCount);
  });

  it('exposes deterministic rank-limit and display-limit reasons', () => {
    const dominant = Array.from(
      { length: 6 },
      (_, index) => story(`dominant-${index}`, {
        source: 'Same Source',
        sourceGroup: 'same-source',
      }),
    );
    const evaluation = evaluateTopStories(
      makeInput(dominant),
      { limit: 3, displayDepth: 2 },
    );
    const traces = evaluation.selectionTrace;

    expect(evaluation.selected).toHaveLength(3);
    expect(traces.filter(
      trace => trace.finalReasonCode === 'outside_display_limit',
    )).toHaveLength(1);
    expect(traces.filter(
      trace => trace.finalReasonCode === 'outside_ranker_limit',
    ).length).toBeGreaterThan(0);
  });

  it('reports max-per-source when diversity blocks capacity', () => {
    const dominant = Array.from(
      { length: 6 },
      (_, index) => story(`same-${index}`, {
        source: 'Same Source',
        sourceGroup: 'same-source',
      }),
    );
    const evaluation = evaluateTopStories(
      makeInput(dominant),
      { limit: 10, displayDepth: 10 },
    );

    expect(evaluation.selected).toHaveLength(4);
    expect(evaluation.selectionTrace.filter(
      trace => trace.finalReasonCode === 'max_per_source',
    )).toHaveLength(2);
  });

  it('uses the supplied frozen clock throughout evaluation', () => {
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
      throw new Error('Date.now must not be called');
    });

    try {
      const evaluation = evaluateTopStories(makeInput([story('clock')]));
      expect(evaluation.nowMs).toBe(NOW);
      expect(evaluation.candidates[0]._candidateSeenAt).toBe(NOW);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('does not mutate frozen input objects', () => {
    const input = deepFreeze(makeInput([
      story('frozen-a'),
      story('frozen-b'),
    ]));

    expect(() => evaluateTopStories(input)).not.toThrow();
    expect(input.sectionItems.world[0]._candidateSeenAt).toBeUndefined();
    expect(input.sectionItems.world[0]._topStoryRank).toBeUndefined();
  });

  it('keeps stable output under source input permutation', () => {
    const items = [
      story('c'),
      story('a'),
      story('b'),
    ];
    const forward = evaluateTopStories(makeInput(items));
    const reverse = evaluateTopStories(makeInput([...items].reverse()));

    expect(reverse.selected).toEqual(forward.selected);
    expect(reverse.selectionTrace).toEqual(forward.selectionTrace);
  });

  it('certifies the current Main initial-display contract', () => {
    const mainPage = readFileSync(
      new URL('../../pages/MainPage.jsx', import.meta.url),
      'utf8',
    );
    const newsSection = readFileSync(
      new URL('../../components/NewsSection.jsx', import.meta.url),
      'utf8',
    );
    const viewModel = readFileSync(
      new URL('../../viewModels/useMainTabViewModel.js', import.meta.url),
      'utf8',
    );

    expect(mainPage).toMatch(/news=\{latestStories\}/);
    expect(mainPage).toMatch(/maxDisplay=\{10\}/);
    expect(newsSection).toMatch(
      /displayNews\s*=\s*news\.slice\(0,\s*displayCount\)/,
    );
    expect(viewModel).toMatch(
      /filterLatestStories\(sourceFrontPage,\s*safeSettings\.customSortTopStories\)/,
    );
  });
});
