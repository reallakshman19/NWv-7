// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import fs from 'node:fs';
import { recoverLegacyPlannerSeed, quarantineLegacyRemotePlan, getPlannerSeedRecovery, restorePlannerSeedRecovery, exportPlannerSeedRecovery, __plannerSeedRecoveryForTest } from './plannerSeedRecovery.js';
import plannerStorage from './plannerStorage.js';

vi.mock('../runtime/runtimeCapabilities.js',()=>({getRuntimeCapabilities:()=>({isStaticHost:false})}));
const sample=JSON.parse(fs.readFileSync('src/utils/fixtures/legacyPlannerSeedSample.json','utf8'));
const {PLAN_KEY,ARCHIVE_KEY}=__plannerSeedRecoveryForTest;
const plan=()=>Object.fromEntries(sample.map(row=>[row.date,[structuredClone(row.item)]]));
const storage=()=>{const map=new Map();return {map,getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,String(value))};};
beforeEach(()=>vi.stubGlobal('crypto',webcrypto));
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();localStorage.clear();});

describe('recovering only exact unchanged bundled Planner records',()=>{
 it('recognises the actual March 1 screenshot item, archives originals and preserves unrelated old/manual/edited items',async()=>{
  const store=storage();const saved=plan();const edited={...sample[0].item,note:'My own travel note'};
  saved[sample[0].date].push(edited,{id:'manual-old',title:'Personal overdue task',note:'Keep this',planDate:sample[0].date});
  saved.undated=[{id:'manual-undated',title:'My own reminder',note:'No date is intentional'}];
  store.setItem(PLAN_KEY,JSON.stringify(saved));
  expect(await recoverLegacyPlannerSeed({storage:store})).toMatchObject({ok:true,moved:2});
  const kept=JSON.parse(store.getItem(PLAN_KEY));
  expect(kept[sample[0].date]).toEqual([edited,saved[sample[0].date][2]]);expect(kept.undated).toEqual(saved.undated);
  const archive=JSON.parse(store.getItem(ARCHIVE_KEY));expect(archive.entries).toHaveLength(2);
  expect(archive.entries.find(row=>row.date===sample[0].date).item).toEqual(sample[0].item);
  expect(getPlannerSeedRecovery({storage:store}).archivedCount).toBe(2);
  expect(JSON.parse(exportPlannerSeedRecovery({storage:store})).entries).toHaveLength(2);
 });
 it('keeps explicit saves, timestamped revisions and every changed field even when the title/id match',async()=>{
  const store=storage();const saved={[sample[0].date]:[
   {...sample[0].item,savedPlanId:'my-explicit-save'}, {...sample[0].item,planUpdatedAt:'2026-11-18T12:00:00Z'},
   {...sample[0].item,description:'My edited description'}, {...sample[0].item,title:'My edited title'},
  ]};const bytes=JSON.stringify(saved);store.setItem(PLAN_KEY,bytes);
  expect(await recoverLegacyPlannerSeed({storage:store})).toMatchObject({ok:true,moved:0});expect(store.getItem(PLAN_KEY)).toBe(bytes);
 });
 it('is idempotent and serialises simultaneous recovery requests',async()=>{
  const store=storage();store.setItem(PLAN_KEY,JSON.stringify(plan()));
  const result=await Promise.all([recoverLegacyPlannerSeed({storage:store}),recoverLegacyPlannerSeed({storage:store})]);
  expect(result.map(value=>value.moved)).toEqual([2,0]);expect(JSON.parse(store.getItem(ARCHIVE_KEY)).entries).toHaveLength(2);
 });
 it('does not touch the active plan when its recoverable backup cannot be stored',async()=>{
  const store=storage();const bytes=JSON.stringify(plan());store.setItem(PLAN_KEY,bytes);const write=store.setItem;
  store.setItem=(key,value)=>{if(key===ARCHIVE_KEY)throw Error('synthetic quota');return write(key,value);};
  expect((await recoverLegacyPlannerSeed({storage:store})).ok).toBe(false);
  expect(store.getItem(PLAN_KEY)).toBe(bytes);expect(store.getItem(ARCHIVE_KEY)).toBeNull();
 });
 it('keeps both the original plan and recovery copy if the active-plan write fails',async()=>{
  const store=storage();const bytes=JSON.stringify(plan());store.setItem(PLAN_KEY,bytes);const write=store.setItem;
  store.setItem=(key,value)=>{if(key===PLAN_KEY)throw Error('synthetic plan quota');return write(key,value);};
  expect((await recoverLegacyPlannerSeed({storage:store})).ok).toBe(false);
  expect(store.getItem(PLAN_KEY)).toBe(bytes);expect(JSON.parse(store.getItem(ARCHIVE_KEY)).entries).toHaveLength(2);
  expect(getPlannerSeedRecovery({storage:store}).archivedCount).toBe(0);
 });
 it('preserves an edit and new manual item committed while fingerprinting is in flight',async()=>{
  const store=storage();const saved=plan();store.setItem(PLAN_KEY,JSON.stringify(saved));
  let release;const gate=new Promise(resolve=>{release=resolve;});let entered;const waiting=new Promise(resolve=>{entered=resolve;});
  vi.stubGlobal('crypto',{subtle:{digest:async(...args)=>{entered();await gate;return webcrypto.subtle.digest(...args);}}});
  const pending=recoverLegacyPlannerSeed({storage:store});await waiting;
  saved[sample[0].date][0].note='New edit while cleanup runs';saved.undated=[{id:'new',title:'New personal item'}];
  store.setItem(PLAN_KEY,JSON.stringify(saved));release();
  expect(await pending).toMatchObject({ok:true,moved:1});
  const kept=JSON.parse(store.getItem(PLAN_KEY));expect(kept[sample[0].date][0].note).toContain('New edit');expect(kept.undated).toEqual(saved.undated);
 });
 it('refuses to overwrite a cross-tab change made while the backup is written',async()=>{
  const store=storage();const original=plan();store.setItem(PLAN_KEY,JSON.stringify(original));const write=store.setItem;
  const latest={...original,undated:[{id:'cross-tab',title:'New save from another tab'}]};
  store.setItem=(key,value)=>{write(key,value);if(key===ARCHIVE_KEY)write(PLAN_KEY,JSON.stringify(latest));};
  expect((await recoverLegacyPlannerSeed({storage:store})).ok).toBe(false);
  expect(JSON.parse(store.getItem(PLAN_KEY))).toEqual(latest);expect(store.getItem(ARCHIVE_KEY)).not.toBeNull();
 });
 it('fails safely on corrupt storage or missing crypto without disturbing ordinary manual-only plans',async()=>{
  const store=storage();store.setItem(PLAN_KEY,'broken JSON');expect((await recoverLegacyPlannerSeed({storage:store})).ok).toBe(false);
  expect(store.getItem(PLAN_KEY)).toBe('broken JSON');store.setItem(PLAN_KEY,JSON.stringify(plan()));store.setItem(ARCHIVE_KEY,'invalid archive');
  expect((await recoverLegacyPlannerSeed({storage:store})).ok).toBe(false);expect(JSON.parse(store.getItem(PLAN_KEY))).toEqual(plan());
  store.map.delete(ARCHIVE_KEY);vi.stubGlobal('crypto',{});expect((await recoverLegacyPlannerSeed({storage:store})).ok).toBe(false);
  const manual={undated:[{id:'own',title:'Personal task'}]};store.setItem(PLAN_KEY,JSON.stringify(manual));
  expect(await recoverLegacyPlannerSeed({storage:store})).toMatchObject({ok:true,moved:0});
 });
 it('restores duplicates exactly, keeps newer personal revisions, and never re-archives an explicit restore',async()=>{
  const store=storage();const saved=plan();saved[sample[0].date].push(structuredClone(sample[0].item));store.setItem(PLAN_KEY,JSON.stringify(saved));
  expect(await recoverLegacyPlannerSeed({storage:store})).toMatchObject({ok:true,moved:3});
  expect(await restorePlannerSeedRecovery({storage:store})).toMatchObject({ok:true,restored:3});
  expect(JSON.parse(store.getItem(PLAN_KEY))[sample[0].date]).toHaveLength(2);
  expect(await recoverLegacyPlannerSeed({storage:store})).toMatchObject({ok:true,moved:0});
  expect(await restorePlannerSeedRecovery({storage:store})).toMatchObject({ok:true,restored:0});
  expect(getPlannerSeedRecovery({storage:store}).archivedCount).toBe(0);
  const other=storage();other.setItem(PLAN_KEY,JSON.stringify(plan()));await recoverLegacyPlannerSeed({storage:other});
  const own={...sample[0].item,note:'My later personal revision'};other.setItem(PLAN_KEY,JSON.stringify({[sample[0].date]:[own]}));
  expect(await restorePlannerSeedRecovery({storage:other})).toMatchObject({ok:true,restored:1});expect(JSON.parse(other.getItem(PLAN_KEY))[sample[0].date]).toEqual([own]);
 });
 it('does not restore a damaged archive or retire a row into a mismatched recovery copy',async()=>{
  const store=storage();store.setItem(PLAN_KEY,JSON.stringify(plan()));await recoverLegacyPlannerSeed({storage:store});
  const archive=JSON.parse(store.getItem(ARCHIVE_KEY));archive.entries[0].item.title='Damaged recovery copy';store.setItem(ARCHIVE_KEY,JSON.stringify(archive));
  const before=store.getItem(PLAN_KEY);expect((await restorePlannerSeedRecovery({storage:store})).ok).toBe(false);expect(store.getItem(PLAN_KEY)).toBe(before);
  store.setItem(PLAN_KEY,JSON.stringify(plan()));expect((await recoverLegacyPlannerSeed({storage:store})).ok).toBe(false);expect(JSON.parse(store.getItem(PLAN_KEY))).toEqual(plan());
 });
 it('quarantines the same bundled rows from a private API replay without changing the remote input',async()=>{
  const store=storage();const remote=plan();remote.undated=[{id:'owned',title:'Private API task',note:'Preserve'}];
  const before=JSON.stringify(remote);const kept=await quarantineLegacyRemotePlan(remote,{storage:store});
  expect(kept).toEqual({undated:remote.undated});expect(JSON.stringify(remote)).toBe(before);
  expect(getPlannerSeedRecovery({storage:store}).archivedCount).toBe(2);
 });
 it('never reads bundled user_plan.json when the private API is absent, and keeps existing manual data',async()=>{
  const own={undated:[{id:'own',title:'Existing personal reminder'}]};localStorage.setItem(PLAN_KEY,JSON.stringify(own));
  const fetch=vi.fn().mockResolvedValue({ok:false,status:404});vi.stubGlobal('fetch',fetch);
  expect(await plannerStorage.loadPlanFromApi()).toEqual(own);
  expect(fetch).toHaveBeenCalledTimes(1);expect(fetch.mock.calls[0][0]).toBe('/api/user_plan');
 });
});
