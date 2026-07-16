import { describe, expect, it } from 'vitest';
import { compareTopStoryIdentitySnapshots } from './topStoriesIdentityTransitions.js';
import {
  attachTopStoryStudyIdentities,
  normalizeTopStoryCanonicalUrl,
  resolveTopStoryIdentitySet,
  resolveTopStoryStudyIdentity,
  TOP_STORIES_IDENTITY_STATES,
} from './topStoriesStudyIdentity.js';

describe('NW-RANK-011B editorial identity contract', () => {
  it('normalizes canonical URLs and removes tracking noise', () => {
    expect(normalizeTopStoryCanonicalUrl(
      'https://www.Example.com/news/item/amp/?utm_source=x&b=2&a=1#part',
    )).toBe('https://example.com/news/item?a=1&b=2');
  });

  it('uses deterministic identity precedence and confidence', () => {
    const identity = resolveTopStoryStudyIdentity({
      id: 'row-1',
      clusterId: 'cluster-42',
      canonicalId: 'canonical-9',
      url: 'https://example.com/story',
      title: 'Flood evacuation alert issued across the district',
      sourceGroup: 'publisher',
    });
    expect(identity).toMatchObject({
      identityMethod: 'cluster_id',
      identityConfidence: 'high',
      identityState: TOP_STORIES_IDENTITY_STATES.RESOLVED,
      sourceFamily: 'publisher',
    });
    expect(identity.editorialIdentity).toMatch(/^cluster_id:/);
    expect(identity.rowIdentity).toMatch(/^row:publisher:/);
  });

  it('marks title-only fallback identity as ambiguous', () => {
    const identity = resolveTopStoryStudyIdentity({
      title: 'Brief update',
      source: 'Example',
    });
    expect(identity.identityMethod).toBe('title_fingerprint_fallback');
    expect(identity.identityState).toBe(TOP_STORIES_IDENTITY_STATES.AMBIGUOUS);
    expect(identity.editorialIdentity).toBeTruthy();
  });

  it('fails closed when same-method identifiers conflict', () => {
    const identity = resolveTopStoryStudyIdentity({
      clusterId: 'cluster-a',
      cluster_id: 'cluster-b',
      title: 'Flood evacuation alert issued across the district',
    });
    expect(identity.identityState).toBe(TOP_STORIES_IDENTITY_STATES.CONFLICT);
    expect(identity.editorialIdentity).toBeNull();
    expect(identity.diagnostics).toContain('conflicting_same_method_identifiers');
  });

  it('detects cross-record strong identity conflicts', () => {
    const identities = resolveTopStoryIdentitySet([
      {
        clusterId: 'shared-cluster',
        canonicalId: 'canonical-a',
        title: 'Flood evacuation alert issued across the district',
      },
      {
        clusterId: 'shared-cluster',
        canonicalId: 'canonical-b',
        title: 'Flood evacuation alert issued across the district',
      },
    ]);
    expect(identities.every(identity =>
      identity.identityState === TOP_STORIES_IDENTITY_STATES.CONFLICT,
    )).toBe(true);
    expect(identities.every(identity => identity.editorialIdentity === null)).toBe(true);
  });

  it('detects representative substitution and headline mutation', () => {
    const prior = attachTopStoryStudyIdentities([{
      canonicalId: 'event-1',
      id: 'publisher-a-row',
      sourceGroup: 'publisher-a',
      title: 'Cyclone warning issued for coastal communities',
    }]);
    const current = attachTopStoryStudyIdentities([{
      canonicalId: 'event-1',
      id: 'publisher-b-row',
      sourceGroup: 'publisher-b',
      title: 'Cyclone warning expanded across coastal communities',
    }]);
    const result = compareTopStoryIdentitySnapshots(prior, current);
    expect(result.transitions.map(item => item.type)).toEqual(expect.arrayContaining([
      'representative_source_substitution',
      'representative_row_substitution',
      'headline_mutation',
    ]));
    expect(result.retainedIdentityIds).toHaveLength(1);
  });

  it('detects split and merge transitions from explicit members', () => {
    const prior = attachTopStoryStudyIdentities([{
      clusterId: 'combined',
      identityMembers: ['member-a', 'member-b'],
      title: 'Flood emergency affects two districts',
    }]);
    const split = attachTopStoryStudyIdentities([
      {
        clusterId: 'part-a',
        identityMembers: ['member-a'],
        title: 'Flood emergency affects district A',
      },
      {
        clusterId: 'part-b',
        identityMembers: ['member-b'],
        title: 'Flood emergency affects district B',
      },
    ]);
    const splitResult = compareTopStoryIdentitySnapshots(prior, split);
    expect(splitResult.transitions.some(item => item.type === 'cluster_split')).toBe(true);

    const mergeResult = compareTopStoryIdentitySnapshots(split, prior);
    expect(mergeResult.transitions.some(item => item.type === 'cluster_merge')).toBe(true);
  });

  it('creates a hard boundary when identity versions change', () => {
    const prior = attachTopStoryStudyIdentities(
      [{ canonicalId: 'event-1', title: 'Flood warning remains active' }],
      { identityVersion: 'identity-v1' },
    );
    const current = attachTopStoryStudyIdentities(
      [{ canonicalId: 'event-1', title: 'Flood warning remains active' }],
      { identityVersion: 'identity-v2' },
    );
    const result = compareTopStoryIdentitySnapshots(prior, current);
    expect(result.versionBoundary).toBe(true);
    expect(result.retainedIdentityIds).toEqual([]);
    expect(result.transitions[0].type).toBe('identity_version_boundary');
  });
});
