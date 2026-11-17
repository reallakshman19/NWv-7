import { describe, expect, it } from 'vitest';
import { scoreAreaRelevance, applyAreaRelevance } from './areaRelevanceScorer.js';
import { scoreStoryForLocation, rankStoriesForLocation, applyTravelLocationPriority } from './storyLocationPriority.js';
import { resolveTravelLocationKey, getTravelLocationProfile } from './travelLocationProfile.js';
import { normalizeTravelNewsPayload, mergeTravelNewsIntoNewsData } from './travelNewsIngestion.js';
import { getLocationRelevanceSignal } from './topStories/topStoriesLocationSignals.js';
import { auditTravelLocalStories, getStoriesDisplayMode } from './travelLocalUiQuality.js';

const muscat = getTravelLocationProfile({ travelLocation: { city: 'muscat' } });
const chennai = getTravelLocationProfile({ travelLocation: { city: 'chennai' } });
const colombo = getTravelLocationProfile({ travelLocation: { city: 'colombo' } });

describe('A03 provenance-preserving location repair', () => {
  it('source-only Tokyo cannot be admitted to Muscat travelLocal', () => {
    const story = { id: 'tokyo', title: 'Global arts festival opens in Tokyo', source: 'Muscat Daily', section: 'local' };
    expect(scoreStoryForLocation(story, muscat)).toBe(0);
    expect(scoreAreaRelevance(story, 'muscat')).toMatchObject({ score: 0, label: 'weak' });
    expect(rankStoriesForLocation({ local: [story] }, muscat)).toHaveLength(0);
  });

  it.each(['woman', 'romanian'])('does not mistake %s for Oman', term => {
    expect(scoreStoryForLocation({ title: term + ' wins an architecture prize' }, muscat)).toBe(0);
  });

  it('never matches Sri Lanka country code inside Silk, nor milk to Colombo settings', () => {
    expect(scoreStoryForLocation({ title: 'Silk Road project opens in Japan' }, colombo)).toBe(0);
    expect(resolveTravelLocationKey('milk')).toBeNull();
    expect(resolveTravelLocationKey('Muscat, Oman')).toBe('muscat');
  });

  it('demotes explicit Dubai event even with a Muscat publisher', () => {
    const result = scoreAreaRelevance({ title: 'Dubai conference opens', source: 'Muscat Daily' }, 'muscat');
    expect(result.label).toBe('off-area');
    expect(result.sourceEvidence).toEqual([]);
  });

  it.each([
    'Airport shutdown in Tokyo',
    'GCC summit in Riyadh',
    'Oman announces OMR 500 fine',
  ])('does not classify ambiguous %s as exact Chennai locality', title => {
    expect(scoreAreaRelevance({ title }, 'chennai').label).not.toBe('exact-area');
  });

  it('keeps contextual Chennai transport and place positives', () => {
    const result = scoreAreaRelevance({ title: 'GCC and CMRL review Tambaram and OMR traffic plan' }, 'chennai');
    expect(result.label).toBe('exact-area');
    expect(result.matchedTerms).toEqual(expect.arrayContaining(['gcc', 'cmrl', 'omr', 'tambaram']));
    expect(scoreAreaRelevance({ title: 'Chennai airport delays' }, 'chennai').label).toBe('exact-area');
  });

  it('keeps Arabic and inflected Tamil place signals', () => {
    expect(scoreAreaRelevance({ title: 'إغلاق شارع في مسقط' }, 'muscat').label).toBe('city');
    expect(scoreAreaRelevance({ title: 'சென்னையில் சாலை மூடல்' }, 'chennai').label).toBe('city');
    expect(scoreStoryForLocation({ title: 'சென்னையில் சாலை மூடல்' }, chennai)).toBeGreaterThanOrEqual(18);
  });

  it('keeps exact source/section/URL changes geographically inert', () => {
    const story = { title: 'New York subway disruption', summary: 'New York commuters delayed' };
    const local = { ...story, source: 'Muscat Daily', section: 'muscat', sourceGroup: 'Oman Times', url: 'https://oman.test/story' };
    const world = { ...story, source: 'Reuters', section: 'world', sourceGroup: 'global', url: 'https://world.test/story' };
    expect(scoreStoryForLocation(local, muscat)).toBe(scoreStoryForLocation(world, muscat));
    expect(scoreAreaRelevance(local, 'muscat').score).toBe(scoreAreaRelevance(world, 'muscat').score);
  });

  it('does not invent destination event city while normalizing travel payload', () => {
    const payload = normalizeTravelNewsPayload({ stories: [{ id: 'ny', title: 'New York subway disruption', source: 'Muscat Daily' }] }, muscat);
    expect(payload.stories[0].city).toBeUndefined();
    expect(payload.stories[0].country).toBeUndefined();
    expect(payload.stories[0]._travelLocationScore).toBe(0);
    expect(mergeTravelNewsIntoNewsData({}, payload, muscat).travelLocal).toHaveLength(0);
  });

  it('passes active profile through merge and retains target city at a 12-item cap', () => {
    const chennaiFeed = Array.from({ length: 12 }, (_, i) => ({
      id: 'ch' + i, title: 'Chennai city transport update ' + i, city: 'Chennai', country: 'India',
    }));
    const muscatFeed = { id: 'muscat', title: 'Muscat Municipality announces Qurum road closure', city: 'Muscat', country: 'Oman' };
    const payload = normalizeTravelNewsPayload({ stories: [...chennaiFeed, muscatFeed] }, muscat);
    const merged = mergeTravelNewsIntoNewsData({}, payload, muscat);
    expect(merged.travelLocal.map(x => x.id)).toEqual(['muscat']);
    expect(applyTravelLocationPriority(merged, muscat).travelLocal.map(x => x.id)).toEqual(['muscat']);
  });

  it('ignores late payload with a different selected location', () => {
    const stale = normalizeTravelNewsPayload({ stories: [{ title: 'Chennai road closure' }] }, chennai);
    const original = { frontPage: [{ id: 'keep', title: 'Global markets' }] };
    expect(mergeTravelNewsIntoNewsData(original, stale, muscat)).toBe(original);
  });

  it('keeps displayed travel feed gated by actual matching evidence', () => {
    const sourceOnly = { id: 'foreign', title: 'Global arts festival opens in Tokyo', source: 'Muscat Daily' };
    const accepted = rankStoriesForLocation({ local: [sourceOnly] }, muscat);
    const audit = auditTravelLocalStories(accepted, muscat);
    expect(audit.pass).toBe(false);
    expect(getStoriesDisplayMode(audit, muscat)).toBe('empty');
  });

  it('ignores acquisition region in top-story geography, preserves event-local evidence', () => {
    const story = { title: 'Seattle bank outage' };
    for (const region of ['in', 'Oman', 'world']) {
      expect(getLocationRelevanceSignal({ ...story, region }).score).toBe(0.42);
    }
    expect(getLocationRelevanceSignal({ ...story, country: 'Oman' }).score).toBe(0.82);
  });

  it('preserves public-consequence sorting inside recognized regional coverage', () => {
    const list = applyAreaRelevance([
      { id: 'feature', title: 'Chennai Adyar artisans prepare festival lamps', _publicImpact: { priority: 0 } },
      { id: 'cyclone', title: 'Tamil Nadu cyclone warning issued across districts', _publicImpact: { priority: 3 } },
      { id: 'foreign', title: 'California declares emergency', _publicImpact: { priority: 3 } },
    ], 'chennai');
    expect(list.map(story => story.id)).toEqual(['cyclone', 'feature', 'foreign']);
  });
});
