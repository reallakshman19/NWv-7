import { describe, expect, it } from 'vitest';
import {
  classifyTopStoryEvent,
  TOP_STORY_EVENT_TYPES,
} from './topStoriesEventClassifier.js';
import { evaluateTopStories, scoreTopStoryCandidate } from './topStoriesRanker.js';
import { getTopStoriesPolicy } from './topStoriesPolicy.js';

const NOW = Date.UTC(2026, 10, 14, 17, 1);
const HOUR = 60 * 60 * 1000;

// Publication text from the 2026-11-14 snapshot. These regressions assert
// real event evidence rather than a requested card count or weaker thresholds.
const MISSED_EVENTS = [
  {
    id: 'leaders-summit',
    title: 'Quad Summit likely to be held in Manila on November 17, sources say',
    summary: 'The Summit between leaders of India, U.S., Australia, and Japan is being held in a non-Quad country for the first time.',
    source: 'The Hindu International', sourceGroup: 'the_hindu',
    expected: TOP_STORY_EVENT_TYPES.GOVERNANCE,
  },
  {
    id: 'fatal-collision',
    title: 'Assam CM says minibus driver may have suffered heart attack before collision; toll rises to 26',
    source: 'The Hindu', sourceGroup: 'the_hindu',
    expected: TOP_STORY_EVENT_TYPES.PUBLIC_SAFETY,
  },
  {
    id: 'ground-stop',
    title: "What we know about the ground stop and what to do if you're affected",
    summary: 'US officials say the disruption was caused by old equipment overloading and not a cyber-attack.',
    source: 'BBC World', sourceGroup: 'bbc',
    expected: TOP_STORY_EVENT_TYPES.CIVIC_ALERT,
  },
  {
    id: 'air-quality',
    title: 'Delhi’s air quality remains ‘very poor’; rain may bring relief',
    source: 'The Hindu', sourceGroup: 'the_hindu',
    expected: TOP_STORY_EVENT_TYPES.CIVIC_ALERT,
  },
  {
    id: 'diplomatic-visit',
    title: 'Pakistani Minister to visit India for the first time in three years, as SCO meets',
    summary: 'The last such high-level visit to India was by then Foreign Minister Bilawal Bhutto Zardari, who travelled to Goa for a meeting of SCO Foreign Ministers.',
    source: 'The Hindu International', sourceGroup: 'the_hindu',
    expected: TOP_STORY_EVENT_TYPES.GOVERNANCE,
  },
  {
    id: 'devolution',
    title: "Burnham suggests Welsh Labour lost sight of devolution as review criticises ex-first minister's strategy",
    summary: 'The prime minister said it was hard to accept the party was no longer in power after 27 years of running the Welsh government.',
    source: 'BBC', sourceGroup: 'bbc',
    expected: TOP_STORY_EVENT_TYPES.GOVERNANCE,
  },
  {
    id: 'arms-talks',
    title: 'President to raise nuclear-arms cuts at Thursday talks, White House says',
    source: 'Business Line', sourceGroup: 'business_line',
    expected: TOP_STORY_EVENT_TYPES.GOVERNANCE,
  },
];

function freshStory(row, extra = {}) {
  return {
    ...row,
    publishedAt: NOW - HOUR,
    timestampConfidence: 'high',
    section: 'world',
    ...extra,
  };
}

describe('Top Stories grounded event coverage', () => {
  it.each(MISSED_EVENTS)('recognizes $id from event and context evidence', row => {
    const event = classifyTopStoryEvent(row);
    expect(event.eventType).toBe(row.expected);
    expect(event.qualified).toBe(true);
    const scored = scoreTopStoryCandidate(freshStory(row), { nowMs: NOW });
    expect(scored._topStoryRank.slotBand).toBe('primary');
    expect(scored._topStoryRank.admissionThreshold).toBe(0.5);
    expect(scored._topStoryRank.sourceCount).toBe(1);
    expect(scored._topStoryRank.hasIndependentEvidence).toBe(false);
  });

  it.each([
    'Collision update',
    'Foreign minister update',
    'Air quality map',
    "Oman's airport passenger traffic declines 6.7% to 10.4 million by September",
    'Nuclear-arms update',
  ])('keeps non-event and bare keyword text unqualified: %s', title => {
    const event = classifyTopStoryEvent({ title });
    expect(event.eventType).toBe(TOP_STORY_EVENT_TYPES.UNKNOWN);
    expect(event.qualified).toBe(false);
  });

  it('does not classify condolences as governance merely because ministers and leaders are named', () => {
    const event = classifyTopStoryEvent({
      title: 'Political leaders mourn veteran Telugu actor Giribabu',
      summary: 'Governor, Chief Minister, Deputy Chief Minister and YSRCP president recall his contribution to Telugu cinema spanning over five decades and more than 600 films',
    });
    expect(event.eventType).toBe(TOP_STORY_EVENT_TYPES.UNKNOWN);
    expect(event.qualified).toBe(false);
  });

  it('retains municipal traffic notices as concrete public-service evidence', () => {
    expect(classifyTopStoryEvent({ title: 'Trichy municipal traffic notice' }).eventType)
      .toBe(TOP_STORY_EVENT_TYPES.CIVIC_ALERT);
  });

  it('retains freshness, source diversity, identity and thresholds while admitting coverage gaps', () => {
    const rows = MISSED_EVENTS.map(row => freshStory(row));
    const evidence = evaluateTopStories({
      nowMs: NOW,
      sectionItems: { world: [
        ...rows,
        rows[1],
        freshStory(rows[0], { id: 'expired-collision', publishedAt: NOW - 13 * HOUR }),
        freshStory(rows[1], { id: 'fallback-time', timestampConfidence: 'low' }),
      ] },
    });
    expect(evidence.selected.map(row => row.id)).toEqual(expect.arrayContaining(rows.map(row => row.id)));
    expect(new Set(evidence.selected.map(row => row.id)).size).toBe(evidence.selected.length);
    expect(evidence.selected.some(row => row.id === 'expired-collision')).toBe(false);
    expect(evidence.selected.some(row => row.id === 'fallback-time')).toBe(false);
    expect(evidence.selected.filter(row => row.sourceGroup === 'the_hindu').length).toBeLessThanOrEqual(4);
    expect(evidence.policySnapshot.thresholds).toEqual(getTopStoriesPolicy().thresholds);
    expect(evidence.policySnapshot.diversity).toEqual(getTopStoriesPolicy().diversity);
  });
});
