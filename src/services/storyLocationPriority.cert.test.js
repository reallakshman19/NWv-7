import { describe, expect, it } from 'vitest';
import {
  applyMainAreaRelevance,
  applyTravelLocationPriority,
  rankStoriesForLocation,
  scoreStoryForLocation,
} from './storyLocationPriority';
import { getTravelLocationProfile } from './travelLocationProfile';

const colomboProfile = getTravelLocationProfile({
  travelLocation: { city: 'columbo' },
});

describe('Story location priority certification', () => {
  it('scores Colombo and Sri Lanka stories highly', () => {
    const score = scoreStoryForLocation({
      title: 'Colombo airport issues new travel advisory for Sri Lanka visitors',
      sourceGroup: 'travel',
    }, colomboProfile);

    expect(score).toBeGreaterThanOrEqual(60);
  });

  it('ranks travel-local stories from mixed news data', () => {
    const ranked = rankStoriesForLocation({
      frontPage: [
        { id: '1', title: 'Global market update' },
        { id: '2', title: 'Sri Lanka updates Colombo tourism rules' },
      ],
      world: [
        { id: '3', title: 'Colombo weather disruption affects flights' },
      ],
    }, colomboProfile);

    // Story 2 has more location keywords (Sri Lanka + Colombo) so ranks first,
    // story 3 (Colombo only + world section bonus) ranks second, story 1 has no match
    expect(ranked.map(story => story.id)).toContain('2');
    expect(ranked.map(story => story.id)).toContain('3');
    expect(ranked.map(story => story.id)).not.toContain('1');
    expect(ranked[0].id).toBe('2');
  });

  it('applies location priority to arrays without dropping stories', () => {
    const newsData = {
      frontPage: [
        { id: '1', title: 'Global market update' },
        { id: '2', title: 'Colombo local transport update' },
      ],
    };

    const prioritized = applyTravelLocationPriority(newsData, colomboProfile);

    expect(prioritized.frontPage).toHaveLength(2);
    expect(prioritized.frontPage[0].id).toBe('2');
    expect(prioritized.travelLocal[0].id).toBe('2');
    expect(prioritized.travelLocationProfile.key).toBe('colombo');
  });

  it('enriches Chennai and Muscat main sections with area relevance evidence', () => {
    const newsData = {
      chennai: [
        { id: 'tn', title: 'Tamil Nadu statewide policy update' },
        { id: 'omr', title: 'OMR and CMRL traffic plan announced in Chennai' },
      ],
      local: [
        { id: 'oman', title: 'Oman tourism strategy published' },
        { id: 'ruwi', title: 'Ruwi road changes announced by Muscat Municipality' },
      ],
      world: [
        { id: 'world', title: 'Global markets update' },
      ],
    };

    const enriched = applyMainAreaRelevance(newsData);

    expect(enriched.chennai.map(story => story.id)).toEqual(['omr', 'tn']);
    expect(enriched.chennai[0]._areaRelevance.label).toBe('exact-area');
    expect(enriched.chennai[1]._areaRelevance.label).toBe('state-region');
    expect(enriched.local.map(story => story.id)).toEqual(['ruwi', 'oman']);
    expect(enriched.local[0]._areaRelevance.label).toBe('exact-area');
    expect(enriched.local[1]._areaRelevance.label).toBe('country');
    expect(enriched.world[0]._areaRelevance).toBeUndefined();
    expect(newsData.chennai[0]._areaRelevance).toBeUndefined();
  });

  it('keeps area relevance when travel priority is disabled', () => {
    const prioritized = applyTravelLocationPriority({
      local: [
        { id: 'weak', title: 'Global markets update' },
        { id: 'qurum', title: 'Qurum beach access update in Muscat' },
      ],
    }, {
      ...colomboProfile,
      prioritizeStories: false,
    });

    expect(prioritized.local[0].id).toBe('qurum');
    expect(prioritized.local[0]._areaRelevance.label).toBe('exact-area');
    expect(prioritized.travelLocal).toBeUndefined();
  });
});
