// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import plannerStorage, { __plannerStorageInternalsForTest } from './plannerStorage.js';
import { sameSourceBackedPlannerEvent } from './plannerSourceAlias.js';

vi.mock('../runtime/runtimeCapabilities.js',()=>({
  getRuntimeCapabilities:()=>({isStaticHost:true}),
}));

const date='2026-11-26';
const started=Date.parse('2026-11-26T09:00:00Z');
const event = (id, extra={}) => ({
  id, title:'AI & Bioinformatics Workshop',
  city:'Chennai', category:'events', sourceGroup:'chennai-calendar',
  venue:'IIT Madras Research Park',
  eventStartAt:started,
  link:'https://chennai2go.in/event/authentic-session-a',
  eventDateKey:date, planDate:date, ...extra,
});

beforeEach(()=>{
  localStorage.clear();
  vi.spyOn(plannerStorage,'savePlanToApi').mockResolvedValue(true);
});
afterEach(()=>{localStorage.clear();vi.restoreAllMocks();});

describe('fail-closed Planner source-ID compatibility',()=>{
  it('recognizes a publisher ID revision only with identical original URL and event slot',()=>{
    const old=event('legacy-id',{savedPlanId:'my-saved-slot'});
    const updated=event('new-publisher-id',{link:'https://chennai2go.in/event/authentic-session-a?utm_source=feed'});
    expect(sameSourceBackedPlannerEvent(old,updated,date)).toBe(true);
    expect(sameSourceBackedPlannerEvent(old,updated,'2026-11-27')).toBe(false);
    expect(sameSourceBackedPlannerEvent(old,event('other',{link:'https://chennai2go.in/event/other-session'}),date)).toBe(false);
  });

  it('does not change saved Planner bytes or lose notes when a new publisher ID appears',()=>{
    const saved=event('old-publisher-id',{note:'My personal note',savedPlanId:'my-explicit-save'});
    expect(plannerStorage.addItem(date,saved).ok).toBe(true);
    const before=localStorage.getItem('upAhead_planner');
    const duplicate=plannerStorage.addItem(date,event('new-publisher-id'));
    expect(duplicate).toMatchObject({ok:false,reason:'duplicate'});
    expect(localStorage.getItem('upAhead_planner')).toBe(before);
    expect(plannerStorage.getPlan()[date]).toHaveLength(1);
    expect(plannerStorage.getPlan()[date][0]).toMatchObject({
      savedPlanId:'my-explicit-save',id:'old-publisher-id',note:'My personal note',
    });
  });

  it('keeps separate sessions, URLs, dates, cities and unverified titles independent',()=>{
    const a=event('original');
    for(const separate of [
      event('other-url',{link:'https://chennai2go.in/event/another-session'}),
      event('other-start',{eventStartAt:started+3600000}),
      event('other-city',{city:'Muscat',locationCanonical:'Muscat'}),
      event('other-session',{sessionId:'different-session'}),
      event('other-venue',{venue:'Another venue'}),
      event('other-category',{category:'sports'}),
      event('untrusted-publisher-home',{link:undefined,sourceUrl:'https://chennai2go.in/'}),
    ]) expect(sameSourceBackedPlannerEvent(a,separate,date)).toBe(false);
    expect(sameSourceBackedPlannerEvent(
      {id:'a',title:'Identical title',category:'events'},
      {id:'b',title:'Identical title',category:'events'},date,
    )).toBe(false);
  });

  it('preserves two independently saved explicit Planner IDs during remote reconciliation',()=>{
    const first=event('old-publisher-id',{savedPlanId:'save-one',note:'my note 1'});
    const second=event('new-publisher-id',{savedPlanId:'save-two',note:'my note 2'});
    expect(sameSourceBackedPlannerEvent(first,second,date)).toBe(true);
    // Publisher equivalence NEVER authorizes destroying a second explicit
    // user-owned save or rewriting its notes during remote plan merging.
    expect(__plannerStorageInternalsForTest.sameDurableRow(first,second,date)).toBe(false);
    expect(__plannerStorageInternalsForTest.sameDurableRow(first,{...second,savedPlanId:null},date)).toBe(true);
    expect(__plannerStorageInternalsForTest.sameDurableRow(first,first,date)).toBe(true);
  });

  it('keeps distinct original session IDs even if the listing URL is reused',()=>{
    expect(sameSourceBackedPlannerEvent(event('a',{sessionId:'s1'}),event('b',{sessionId:'s2'}),date)).toBe(false);
    expect(sameSourceBackedPlannerEvent(event('a',{occurrenceId:'o1'}),event('b',{occurrenceId:'o2'}),date)).toBe(false);
    expect(sameSourceBackedPlannerEvent(event('a',{sessionId:'s1'}),event('b',{sessionId:null}),date)).toBe(false);
  });
});
