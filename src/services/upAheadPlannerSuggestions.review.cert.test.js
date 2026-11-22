import { afterEach, describe, expect, it, vi } from 'vitest';
import { getVisibleUpAheadProjection } from './upAheadProjection.js';
import { getUpAheadPlannerSuggestions } from './upAheadPlannerSuggestions.js';

const now=Date.parse('2026-11-22T09:00:00+05:30');
const start=Date.parse('2026-11-23T09:00:00+05:30');
const expiry=Date.parse('2026-11-24T18:00:00+05:30');
const day='2026-11-23';
const base={category:'events',sourceGroup:'chennai-calendar',
  source:'Chennai calendar',city:'Chennai',venue:'IIT Madras Research Park',
  eventStartAt:start,eventDateKey:day,dateConfidence:'exact',plannerEligible:true,
  expiryAt:expiry,observedAt:now,publishedAt:now};
const workshop=(id,title,extra={})=>({
  ...base,id,title,url:`https://chennai2go.in/event/${id}-20261123`,...extra,
});
const rows=[
  workshop('bio-1','AI & Bioinformatics Workshop'),
  workshop('bio-2','AI & Bioinformatics 2-Day Workshop'),
  workshop('bio-3','AI & Bioinformatics – 2 Days Workshop'),
];
const settings={upAhead:{locations:['Chennai'],categories:{events:true,alerts:true}}};

afterEach(()=>vi.useRealTimers());
describe('F03 real-route workshop and Planner parity',()=>{
  it('retains three source URLs behind one review card in Events AND Suggested',()=>{
    vi.useFakeTimers().setSystemTime(now);
    const data={fetchedAt:now,sections:{events:rows}};
    const projected=getVisibleUpAheadProjection({data,settings});
    expect(projected.eventItems).toHaveLength(1);
    expect(projected.suggestedItems.filter(x=>x._suggestKind==='event')).toHaveLength(1);
    for(const card of [projected.eventItems[0],projected.suggestedItems.find(x=>x._suggestKind==='event')]){
      expect(card.reviewGroupStatus).toBe('POSSIBLE_DUPLICATE_UNCONFIRMED');
      expect(card.reviewGroupCount).toBe(3);
      expect(card.reviewAlternateListings.map(x=>x.url)).toEqual(rows.map(x=>x.url));
      expect(card.reviewAlternateListings.map(x=>x.id)).toEqual(rows.map(x=>x.id));
    }
    // User source selection is retained; original publication must not mutate.
    expect(data.sections.events).toEqual(rows);
  });

  it('never auto-promotes unverified workshop variants to the separate Planner recommendation route',()=>{
    vi.useFakeTimers().setSystemTime(now);
    const unrelated=workshop('music-show','Chennai Jazz Concert',{sourceGroup:'other',venue:'Music Hall'});
    const data={timeline:[{date:day,items:[...rows,unrelated]}]};
    const suggestions=getUpAheadPlannerSuggestions(data,{},new Set(),settings.upAhead,now);
    expect(suggestions.map(x=>x.id)).toEqual(['music-show']);
    expect(suggestions.find(x=>rows.some(row=>row.id===x.id))).toBeUndefined();
    expect(data.timeline[0].items).toHaveLength(4);
  });

  it('retains distinct verified session IDs and unlike source-group events',()=>{
    vi.useFakeTimers().setSystemTime(now);
    const a=workshop('drone-a','Drone Technology Workshop',{sessionId:'session-1'});
    const b=workshop('drone-b','Drone Technology 2-Day Workshop',{sessionId:'session-2'});
    const data={timeline:[{date:day,items:[a,b]}]};
    const results=getUpAheadPlannerSuggestions(data,{},new Set(),settings.upAhead,now);
    expect(results.map(x=>x.id).sort()).toEqual(['drone-a','drone-b']);
  });

  it('F02: public-health advisory survives Planner eligibility, rescue news does not',()=>{
    vi.useFakeTimers().setSystemTime(now);
    const alertBase={...base,category:'alerts',sourceGroup:'times_of_oman',city:'Muscat',
      venue:'Muscat',eventStartAt:start};
    const health={...alertBase,id:'water-safety',title:'Muscat boil-water advisory for tap water',
      url:'https://timesofoman.com/article/boil-water-advisory'};
    const rescue={...alertBase,id:'patient-airlift',title:'Muscat medical evacuation of a sailor',
      url:'https://timesofoman.com/article/medical-evacuation'};
    const results=getUpAheadPlannerSuggestions({timeline:[{date:day,items:[health,rescue]}]},
      {},new Set(),{locations:['Muscat'],categories:{alerts:true}},now);
    expect(results.map(x=>x.id)).toEqual(['water-safety']);
  });
});
