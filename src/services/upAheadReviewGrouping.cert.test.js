import { describe, expect, it, vi } from 'vitest';
import { sanitizeUpAheadData } from './upAheadService.js';
import { groupReviewOnlyEventListings, reviewWorkshopTitle } from './upAheadReviewGrouping.js';

const base = {
  category: 'events',
  city: 'Chennai',
  venue: 'IIT Madras Research Park',
  eventStartAt: 1795235400000,
  sourceGroup: 'chennai-calendar',
  source: 'chennai2go',
};
const row = (id,title,changes={}) => ({
  ...base,id,title,link:`https://chennai2go.in/event/${id}`,...changes,
});
const workshop = [
  row('a','AI & Bioinformatics Workshop'),
  row('b','AI & Bioinformatics 2-Day Workshop'),
  row('c','AI & Bioinformatics – 2 Days Workshop'),
];

describe('Unverified UpAhead workshop display clustering', () => {
  it('normalizes only presentation variants and retains every source link', () => {
    expect(reviewWorkshopTitle(workshop[0].title)).toBe(reviewWorkshopTitle(workshop[1].title));
    expect(reviewWorkshopTitle(workshop[0].title)).toBe(reviewWorkshopTitle(workshop[2].title));
    const original = JSON.stringify(workshop);
    const shown = groupReviewOnlyEventListings(workshop);
    expect(shown).toHaveLength(1);
    expect(shown[0].reviewGroupCount).toBe(3);
    expect(shown[0].reviewGroupStatus).toBe('POSSIBLE_DUPLICATE_UNCONFIRMED');
    expect(shown[0].reviewAlternateListings.map(x=>x.id)).toEqual(['a','b','c']);
    expect(shown[0].reviewAlternateListings.map(x=>x.link)).toEqual(workshop.map(x=>x.link));
    expect(JSON.stringify(workshop)).toBe(original);
  });

  it('preserves grouping provenance through raw snapshot normalization', () => {
    const now = base.eventStartAt - 60_000;
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    try {
      const items = workshop.map(({ link, ...listing }) => ({
        ...listing, url: link, expiryAt: now + 86_400_000, publishedAt: now - 60_000,
      }));
      const data = sanitizeUpAheadData({ schemaVersion: 1, fetchedAt: now, items });
      const grouped = groupReviewOnlyEventListings(data.sections.events);
      expect(grouped).toHaveLength(1);
      expect(grouped[0].reviewAlternateListings.map(item => item.link).sort())
        .toEqual(workshop.map(item => item.link).sort());
      expect(data.timeline.flatMap(day => day.items).map(item => item.sourceGroup))
        .toEqual(workshop.map(item => item.sourceGroup));
    } finally {
      clock.mockRestore();
    }
  });

  it('never conceals conflicts in source, venue, day, city or sessions', () => {
    const conflicts = [
      row('different-city','AI & Bioinformatics 2-Day Workshop',{city:'Muscat'}),
      row('different-group','AI & Bioinformatics 2-Day Workshop',{sourceGroup:'other-source'}),
      row('different-venue','AI & Bioinformatics 2-Day Workshop',{venue:'Elsewhere'}),
      row('different-time','AI & Bioinformatics 2-Day Workshop',{eventStartAt:1795245400000}),
      row('different-title','Drone Technology Workshop'),
      row('different-domain','AI & Bioinformatics 2-Day Workshop',{link:'https://fakechennai2go.in/event/x'}),
    ];
    expect(groupReviewOnlyEventListings([workshop[0],...conflicts])).toHaveLength(conflicts.length+1);
    expect(groupReviewOnlyEventListings([
      row('first','Drone Technology Workshop',{sessionId:'day-1'}),
      row('second','Drone Technology 2-Day Workshop',{sessionId:'day-2'}),
    ])).toHaveLength(2);
    expect(groupReviewOnlyEventListings([
      row('first','Drone Technology Workshop',{occurrenceId:'physical-1'}),
      row('second','Drone Technology 2-Day Workshop',{occurrenceId:'physical-2'}),
    ])).toHaveLength(2);
  });

  it('does not infer an identity from conflicting or missing original URLs', () => {
    const repeated = [row('first','Drone Technology Workshop'),row('second','Drone Technology 2-Day Workshop')];
    expect(groupReviewOnlyEventListings([...repeated, {...repeated[0],id:'third'}])).toHaveLength(3);
    const withBadLink = groupReviewOnlyEventListings([...repeated, {...repeated[0],link:'ftp://bad'}]);
    expect(withBadLink).toHaveLength(2);
    expect(withBadLink[0].reviewAlternateListings.map(item=>item.id)).toEqual(['first','second']);
    expect(withBadLink[1].link).toBe('ftp://bad');
    expect(withBadLink[1].reviewGroupStatus).toBeUndefined();
    expect(groupReviewOnlyEventListings([row('a','Unrelated concert')])).toHaveLength(1);
  });
});
