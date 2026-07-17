import { describe, expect, it } from 'vitest';
import { buildTopStoriesRailFunnelAnalytics } from '../../../scripts/top-stories-shadow/railFunnelAnalytics.mjs';

describe('Top Stories pilot identity evidence', () => {
  it('retains ordered resolved identities and counts unresolved displayed rows', () => {
    const result = buildTopStoriesRailFunnelAnalytics([{
      observationId: 'obs-1',
      scheduledAt: '2026-07-17T00:07:00Z',
      runAt: '2026-07-17T00:07:00Z',
      displayedCount: 3,
      rankedCount: 3,
      displayDepth: 10,
      displayed: [
        { _studyIdentity: { identityState: 'IDENTITY_RESOLVED', editorialIdentity: 'event:a' } },
        { _studyIdentity: { identityState: 'IDENTITY_UNAVAILABLE', editorialIdentity: null } },
        { _studyIdentity: { identityState: 'IDENTITY_RESOLVED', editorialIdentity: 'event:b' } },
      ],
      candidateBuildTrace: [],
      selectionTrace: [],
      funnel: [],
    }]);
    const row = result.observations[0];
    expect(row.displayedEditorialIdentities).toEqual(['event:a', 'event:b']);
    expect(row.displayedResolvedIdentityCount).toBe(2);
    expect(row.displayedUnresolvedIdentityCount).toBe(1);
    expect(row.displayedIdentityStateCounts.IDENTITY_UNAVAILABLE).toBe(1);
  });
});
