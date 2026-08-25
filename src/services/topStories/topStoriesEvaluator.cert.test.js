import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  evaluateTopStories,
  rankTopStories,
} from './topStoriesRanker.js';
import {
  TOP_STORY_TRACE_SCHEMA_VERSION,
  TOP_STORY_TRACE_STAGES,
} from './topStoriesTrace.js';

const NOW = Date.UTC(2026, 6, 16, 12, 0, 0);
const HOUR = 60 * 60 * 1000;
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

function stageOf(trace, stageName) {
  const result = trace.stages.find(stage => stage.stage === stageName);
  expect(result).toBeTruthy();
  return result;
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
    expect(traces.every(trace => trace.terminalStage)).toBe(true);
    expect(traces.every(trace => trace.terminalReasonCode)).toBe(true);
    expect(traces.find(trace => trace.candidateId === 'displayed'))
      .toMatchObject({
        finalDisposition: 'DISPLAYED',
        displayedRank: 1,
        terminalStage: 'display',
      });
    expect(traces.find(
      trace => trace.candidateId === 'ranked-not-displayed',
    )).toMatchObject({
      finalDisposition: 'RANKED_NOT_DISPLAYED',
      finalReasonCode: 'outside_display_limit',
      terminalStage: 'display',
    });
    expect(traces.find(trace => trace.candidateId === 'rejected'))
      .toMatchObject({
        finalDisposition: 'REJECTED_BY_ADMISSION',
        finalStage: 'admission',
        finalReasonCode: 'unqualified_without_independent_evidence',
        terminalStage: 'qualification_evidence',
        terminalReasonCode: 'unqualified_without_independent_evidence',
      });
  });

  it('records every evaluator gate and the precise rejecting stage', () => {
    const scenarios = [
      {
        candidate: story('low-timestamp', { timestampConfidence: 'low' }),
        options: {},
        reason: 'low_confidence_timestamp',
        terminalStage: TOP_STORY_TRACE_STAGES.TIMESTAMP_VALIDATION,
      },
      {
        candidate: story('expired', { publishedAt: NOW - (13 * HOUR) }),
        options: {},
        reason: 'outside_fallback_window',
        terminalStage: TOP_STORY_TRACE_STAGES.AGE_WINDOW,
      },
      {
        candidate: story('unqualified', { title: 'Community update' }),
        options: {},
        reason: 'unqualified_without_independent_evidence',
        terminalStage: TOP_STORY_TRACE_STAGES.QUALIFICATION_EVIDENCE,
      },
      {
        candidate: story('below-threshold'),
        options: { policy: { thresholds: { primary: 2 } } },
        reason: 'below_primary_threshold',
        terminalStage: TOP_STORY_TRACE_STAGES.THRESHOLD,
      },
      {
        candidate: story('fallback-aggregator', {
          title: 'Court verdict announced in public case',
          source: 'Google News',
          sourceGroup: 'google_news',
          publishedAt: NOW - (9 * HOUR),
        }),
        options: {},
        reason: 'fallback_aggregator_without_corroboration',
        terminalStage: TOP_STORY_TRACE_STAGES.FALLBACK_CORROBORATION,
      },
    ];

    for (const scenario of scenarios) {
      const evaluation = evaluateTopStories(
        makeInput([scenario.candidate]),
        scenario.options,
      );
      const trace = evaluation.selectionTrace[0];
      expect(trace.schemaVersion).toBe(TOP_STORY_TRACE_SCHEMA_VERSION);
      expect(trace.stages.map(stage => stage.stage)).toEqual(COMPLETE_TRACE_STAGES);
      expect(trace.finalDisposition).toBe('REJECTED_BY_ADMISSION');
      expect(trace.finalStage).toBe(TOP_STORY_TRACE_STAGES.ADMISSION);
      expect(trace.finalReasonCode).toBe(scenario.reason);
      expect(trace.terminalStage).toBe(scenario.terminalStage);
      expect(trace.terminalReasonCode).toBe(scenario.reason);
      expect(stageOf(trace, scenario.terminalStage)).toMatchObject({
        status: 'rejected',
        reasonCodes: [scenario.reason],
      });
    }
  });

  it('records complete passing stages without changing selected output', () => {
    const input = makeInput([story('complete-pass')]);
    const evaluation = evaluateTopStories(input, { limit: 1, displayDepth: 1 });
    const trace = evaluation.selectionTrace[0];

    expect(rankTopStories(input, { limit: 1, displayDepth: 1 }))
      .toEqual(evaluation.selected);
    expect(trace.stages.map(stage => stage.stage)).toEqual(COMPLETE_TRACE_STAGES);
    expect(stageOf(trace, TOP_STORY_TRACE_STAGES.TIMESTAMP_VALIDATION).status)
      .toBe('passed');
    expect(stageOf(trace, TOP_STORY_TRACE_STAGES.AGE_WINDOW).status)
      .toBe('passed');
    expect(stageOf(trace, TOP_STORY_TRACE_STAGES.EVENT_CLASSIFICATION).status)
      .toBe('classified');
    expect(stageOf(trace, TOP_STORY_TRACE_STAGES.QUALIFICATION_EVIDENCE).status)
      .toBe('not_required');
    expect(stageOf(trace, TOP_STORY_TRACE_STAGES.THRESHOLD).status)
      .toBe('passed');
    expect(stageOf(trace, TOP_STORY_TRACE_STAGES.FALLBACK_CORROBORATION).status)
      .toBe('not_required');
    expect(stageOf(trace, TOP_STORY_TRACE_STAGES.ADMISSION).status)
      .toBe('passed');
    expect(stageOf(trace, TOP_STORY_TRACE_STAGES.SELECTION).status)
      .toBe('selected');
    expect(stageOf(trace, TOP_STORY_TRACE_STAGES.DISPLAY).status)
      .toBe('displayed');
    expect(trace).toMatchObject({
      finalDisposition: 'DISPLAYED',
      terminalStage: 'display',
      terminalReasonCode: 'displayed',
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
