import { describe, expect, it } from 'vitest';
import {
  buildTopStoriesRankingSections,
  getTopFeedSnapshotRows,
  getTopStoriesAcquisitionSections,
  getTopStoriesCandidateLimit,
  getTopStoriesRankingCandidateRows,
  getTopStoriesEvidenceWarning,
  getVisibleSectionSummaries,
  summarizeSection,
} from './sectionsDataset.js';
import {
  shouldForceSectionsAuthorityRefresh,
  shouldUseSectionsAuthoritySnapshot,
} from '../../services/sectionsAuthorityRouting.js';
import { buildTopFeedSignalMap } from '../../services/topStories/topStoriesSignals.js';

function row(index) {
  return {
    id: `story-${index}`,
    title: `Story ${index}`,
    source: `Source ${index}`,
    sourceGroup: `source-${index}`,
    publishedAt: Date.UTC(2026, 9, 18, 12, 0, 0) - index * 60_000,
  };
}

describe('Sections dataset Top Stories candidate pool', () => {
  it('keeps static Live and Hybrid on the same Sections authority path while Live force-refreshes it', () => {
    const staticRuntime = { isStaticHost: true, allowWideFeedFetch: false };

    expect(shouldUseSectionsAuthoritySnapshot({
      liveMode: true,
      runtime: staticRuntime,
      usePrefetchedSections: true,
    })).toBe(true);
    expect(shouldForceSectionsAuthorityRefresh({
      liveMode: true,
      runtime: staticRuntime,
      force: false,
    })).toBe(true);

    expect(shouldUseSectionsAuthoritySnapshot({
      liveMode: false,
      runtime: staticRuntime,
      usePrefetchedSections: true,
    })).toBe(true);
    expect(shouldForceSectionsAuthorityRefresh({
      liveMode: false,
      runtime: staticRuntime,
      force: false,
    })).toBe(false);
  });

  it('requests a substantially wider ranking pool than the section display slice', () => {
    expect(getTopStoriesCandidateLimit(15)).toBe(45);
    expect(getTopStoriesCandidateLimit(5)).toBe(30);
  });

  it('acquires Top Stories as a hidden ranking lane without adding it to visible section summaries', () => {
    const visibleSections = ['world', 'india', 'chennai'];
    const acquisitionSections = getTopStoriesAcquisitionSections(visibleSections);

    expect(acquisitionSections).toEqual(['topStories', 'world', 'india', 'chennai']);

    const visibleSummaries = getVisibleSectionSummaries([
      { section: 'topStories', count: 0, staleReason: 'evidence_stale' },
      { section: 'world', count: 10 },
      { section: 'india', count: 10 },
      { section: 'chennai', count: 8 },
    ], visibleSections);

    expect(visibleSummaries.map(summary => summary.section))
      .toEqual(['world', 'india', 'chennai']);
  });

  it('never admits the hidden Top Stories evidence lane into ordinary ranker candidates', () => {
    const topEvidence = { id: 'hidden-evidence', title: 'Authority corroboration' };
    const worldCandidate = { id: 'world-candidate', title: 'World news' };
    const summaries = [
      { section: 'topStories', items: [topEvidence], candidateItems: [topEvidence] },
      { section: 'world', items: [worldCandidate], candidateItems: [worldCandidate] },
    ];

    const candidates = getTopStoriesRankingCandidateRows(summaries, ['world']);
    const evidence = getTopFeedSnapshotRows({}, summaries);

    expect(candidates.map(item => item.id)).toEqual(['world-candidate']);
    expect(evidence.map(item => item.id)).toEqual(['hidden-evidence']);
    // Explicitly listing topStories as visible must still not promote evidence to candidates.
    expect(getTopStoriesRankingCandidateRows(summaries, ['topStories', 'world']))
      .toEqual([worldCandidate]);
  });

  it('reports degraded hidden evidence without changing the visible section population', () => {
    expect(getTopStoriesEvidenceWarning({ section: 'topStories', ok: true, count: 8 }))
      .toBeNull();
    expect(getTopStoriesEvidenceWarning({ section: 'topStories', ok: true, count: 0 }))
      .toEqual({
        section: 'topStories',
        reason: 'top_stories_evidence_empty',
        severity: 'warn',
      });
    expect(getTopStoriesEvidenceWarning({ section: 'topStories', ok: false, count: 0 }))
      .toMatchObject({ reason: 'top_stories_evidence_fetch_failed' });
    expect(getTopStoriesEvidenceWarning({
      section: 'topStories',
      ok: true,
      count: 8,
      staleReason: 'section_items_stale',
    })).toMatchObject({ reason: 'section_items_stale' });
  });

  it('uses the dedicated authority Top Stories section as signal evidence by default', () => {
    const summaries = [{
      section: 'topStories',
      candidateItems: [
        {
          id: 'top-1',
          title: 'Court verdict announced',
          source: 'The Hindu',
          sourceGroup: 'the_hindu',
          publishedAt: Date.UTC(2026, 9, 18, 11, 0, 0),
        },
      ],
    }];

    const rows = getTopFeedSnapshotRows({}, summaries);

    expect(rows).toHaveLength(1);
    expect(rows[0].topFeedPresent).toBeUndefined();
    expect(rows[0].id).toBe('top-1');
    expect(buildTopFeedSignalMap(rows).get('top-1').topFeedPresent).toBe(true);
  });

  it('preserves publisher corroboration across the single Top Feed normalization boundary', () => {
    const rawRows = [
      { id: 'shared-event', title: 'Court verdict announced', source: 'BBC', sourceGroup: 'bbc' },
      { id: 'shared-event', title: 'Court verdict announced', source: 'Reuters', sourceGroup: 'reuters' },
    ];
    const rows = getTopFeedSnapshotRows({}, [{
      section: 'topStories', candidateItems: rawRows,
    }]);

    expect(rows).toHaveLength(2);
    expect(rows[0]).not.toHaveProperty('topFeedCorroborationHits');

    const evidence = buildTopFeedSignalMap(rows).get('shared-event');
    expect(evidence.topFeedCorroborationHits).toBe(1);
    expect(evidence.topFeedSourceCount).toBe(2);
  });

  it('feeds only cross-section cluster representatives into the final Top Stories ranker', () => {
    const clustered = [row(1), row(2)];
    const rankingSections = buildTopStoriesRankingSections(clustered);

    expect(Object.keys(rankingSections)).toEqual(['__all']);
    expect(rankingSections.__all).toHaveLength(2);
    expect(rankingSections.__all.map(item => item.id)).toEqual(['story-1', 'story-2']);
    expect(rankingSections.__all.every(item => item.clusterRepresentative)).toBe(true);
    expect(rankingSections.__all.every(item => item.impactScore === 0)).toBe(true);
    expect(clustered.every(item => item.impactScore === undefined)).toBe(true);
  });

  it('keeps the section display bounded while preserving the wider candidate population', () => {
    const result = Array.from({ length: 40 }, (_, index) => row(index));
    result.prefetchSourceSection = 'world';

    const summary = summarizeSection('world', result, 15);

    expect(summary.items).toHaveLength(15);
    expect(summary.candidateItems).toHaveLength(40);
    expect(summary.count).toBe(15);
    expect(summary.candidateCount).toBe(40);
    expect(summary.items[0].sourceSection).toBe('world');
    expect(summary.candidateItems[39].id).toBe('story-39');
  });
});
