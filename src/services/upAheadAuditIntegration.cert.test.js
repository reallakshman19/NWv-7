import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mergeUpAheadItems, sameUpAheadOccurrence, upAheadDateKey, upAheadExpiryMs,
} from './upAheadLifecycle.js';
import { getUpAheadPlannerSuggestions } from './upAheadPlannerSuggestions.js';
import { buildExplicitPlannerSave } from '../utils/plannerIntelligenceBridge.js';
import plannerStorage from '../utils/plannerStorage.js';

vi.mock('../runtime/runtimeCapabilities.js', () => ({ getRuntimeCapabilities: () => ({isStaticHost:true}) }));
const now = Date.parse('2026-11-20T08:00:00Z');
const base = {
  id:'shared-article', title:'Chennai workshop', category:'events', city:'Chennai',
  link:'https://publisher.test/workshop', eventDateKey:'2026-11-20', datePrecision:'day',
  plannerEligible:true, displayEligible:true, dateConfidence:'exact', publicationOnlyId:true,
};
let bytes;
let failPlanWrite;

beforeEach(() => {
  vi.spyOn(Date,'now').mockReturnValue(now);
  bytes = new Map(); failPlanWrite = false;
  const storage = {
    getItem:key => bytes.get(key) ?? null,
    setItem:(key,value) => {
      if (failPlanWrite && key === 'upAhead_planner') throw new Error('synthetic quota');
      bytes.set(key,String(value));
    },
    removeItem:key => bytes.delete(key),
  };
  vi.stubGlobal('localStorage',storage);
  vi.stubGlobal('window',{localStorage:storage, location:{hostname:'reallakshman19.github.io'}});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('A09 integration with earlier date and provenance repairs', () => {
  it('keeps distinct date/session occurrences while merging an explicitly linked reschedule', () => {
    const tomorrow = {...base,eventDateKey:'2026-11-21'};
    expect(mergeUpAheadItems([base,tomorrow])).toHaveLength(2);
    expect(mergeUpAheadItems([{...base,sessionId:'morning'},{...base,sessionId:'evening'}])).toHaveLength(2);
    const old = {...base,occurrenceId:'official-event',observedAt:now-1000};
    const revised = {...tomorrow,occurrenceId:'official-event',observedAt:now};
    expect(sameUpAheadOccurrence(old,revised)).toBe(true);
    expect(mergeUpAheadItems([old,revised])).toMatchObject([{eventDateKey:'2026-11-21'}]);
  });

  it('treats an inclusive last-day sentinel as the end of the venue day while honoring explicit expiry', () => {
    const range = {...base,datePrecision:'range',eventDateEndKey:'2026-11-21',eventEndAt:'2026-11-21T00:00:00Z'};
    expect(upAheadExpiryMs(range)).toBe(Date.parse('2026-11-21T18:30:00Z'));
    const explicitExpiry = '2026-11-21T05:00:00Z';
    expect(upAheadExpiryMs({...range,expiryAt:explicitExpiry})).toBe(Date.parse(explicitExpiry));
    expect(upAheadDateKey({...base,eventDateKey:Date.parse('2026-11-20T00:00:00Z')})).toBe('2026-11-20');
  });

  it('creates one planner suggestion across category routes without hiding a sibling session', () => {
    const events = [{...base,sessionId:'morning'}, {...base,sessionId:'evening'}];
    const data = {timeline:[{date:base.eventDateKey,items:[...events,{...events[0],category:'alerts'}]}]};
    expect(getUpAheadPlannerSuggestions(data,{},new Set(),{locations:['Chennai']},now)).toHaveLength(2);
    expect(getUpAheadPlannerSuggestions({timeline:[{date:base.eventDateKey,items:events}]},{},new Set(),{locations:['Chennai'],categories:{events:false}},now)).toHaveLength(0);
  });

  it('keeps explicit undated intent separate from the chosen plan day through storage/reopen', () => {
    const payload = buildExplicitPlannerSave({id:'manual',title:'Research an offer',eventDateKey:null},'2026-11-21',now);
    expect(payload).toMatchObject({eventDateKey:null,planDate:'2026-11-21'});
    expect(plannerStorage.addItem(payload.planDate,payload).ok).toBe(true);
    expect(plannerStorage.getPlan()['2026-11-21'][0]).toMatchObject({eventDateKey:null,planDate:'2026-11-21'});
  });

  it('restores the deletion marker and keeps saved bytes when the durable removal write fails', () => {
    expect(plannerStorage.addItem('2026-11-20',base).ok).toBe(true);
    const before=bytes.get('upAhead_planner');
    const markerBefore=bytes.get('upAhead_planner_removed_v1');
    const item=plannerStorage.getPlan()['2026-11-20'][0];
    failPlanWrite=true;
    const result=plannerStorage.removeItem('2026-11-20',item.savedPlanId);
    expect(result.ok).toBe(false);
    expect(bytes.get('upAhead_planner')).toBe(before);
    expect(bytes.get('upAhead_planner_removed_v1')).toBe(markerBefore);
  });
});
