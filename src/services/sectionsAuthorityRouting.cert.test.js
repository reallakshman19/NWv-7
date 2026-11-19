import { describe, expect, it } from 'vitest';
import { shouldForceSectionsAuthorityRefresh, shouldUseSectionsAuthoritySnapshot } from './sectionsAuthorityRouting.js';

describe('Sections authority follows effective runtime capability', () => {
  it.each([
    {isStaticHost:false,allowWideFeedFetch:false,forceSnapshots:true},
    {isStaticHost:false,browserWideFeedFetchAllowed:false,allowWideFeedFetch:true},
    {isStaticHost:true},
  ])('prevents proxy acquisition in both modes when capability disallows it: %j', runtime => {
    for(const liveMode of [false,true]){
      expect(shouldUseSectionsAuthoritySnapshot({runtime,liveMode,usePrefetchedSections:false})).toBe(true);
      expect(shouldForceSectionsAuthorityRefresh({runtime,liveMode})).toBe(liveMode);
    }
  });
  it('preserves explicitly capable local Live acquisition and Hybrid preference', () => {
    const runtime={isStaticHost:false,browserWideFeedFetchAllowed:true,allowWideFeedFetch:true};
    expect(shouldUseSectionsAuthoritySnapshot({runtime,liveMode:true})).toBe(false);
    expect(shouldUseSectionsAuthoritySnapshot({runtime,liveMode:false,usePrefetchedSections:false})).toBe(false);
    expect(shouldUseSectionsAuthoritySnapshot({runtime,liveMode:false})).toBe(true);
    expect(shouldForceSectionsAuthorityRefresh({runtime,liveMode:true})).toBe(false);
  });
});
