import catalog from '../config/legacyPlannerSeed.json';
import { stableStringify } from '../data/dataEnvelope.js';
import { getSafeLocalStorage } from '../data/safeStorage.js';

const PLAN_KEY = 'upAhead_planner';
const ARCHIVE_KEY = 'nw_planner_seed_recovery_v1';
const retired = new Set(catalog.fingerprints);
const seedFields = new Set(['id','title','category','link','hiddenKey','description','sourceCount','allSources','clusteredItems','type']);
let recoveryQueue = Promise.resolve();

function readPlan(storage,bytes=storage.getItem(PLAN_KEY)) {
  const plan = JSON.parse(bytes || '{}');
  if (!plan || typeof plan !== 'object' || Array.isArray(plan) || Object.values(plan).some(rows => !Array.isArray(rows))) throw Error('Planner data is unreadable; no entries were moved.');
  return plan;
}
function archiveFor(storage) {
  const raw = storage.getItem(ARCHIVE_KEY);
  if (!raw) return { schemaVersion: 1, catalogSha256: catalog.sourceSha256, entries: [] };
  const archive = JSON.parse(raw);
  if (archive?.schemaVersion !== 1 || archive.catalogSha256 !== catalog.sourceSha256 || !Array.isArray(archive.entries)
      || archive.entries.length > retired.size || archive.entries.some(row => !retired.has(row.fingerprint) || !row.date || !row.item || !Number.isInteger(row.copies) || row.copies < 1)) throw Error('Recovery archive is unreadable; no entries were moved.');
  return archive;
}
function write(storage, key, value) {
  const bytes = JSON.stringify(value);
  storage.setItem(key, bytes);
  if (storage.getItem(key) !== bytes) throw Error('Planner storage could not be verified.');
}
function compatible(row) {
  return row && typeof row === 'object' && typeof row.id === 'string' && typeof row.hiddenKey === 'string'
    && ['title','category','link','description','sourceCount','allSources','clusteredItems'].every(key=>Object.hasOwn(row,key))
    && Object.keys(row).every(key => seedFields.has(key));
}
async function identify(plan) {
  const candidates = Object.entries(plan).flatMap(([date, rows]) => rows.filter(compatible).map(item => ({ date, item, canonical: stableStringify([date,item]) })));
  if (!candidates.length) return new Map();
  const crypto = globalThis.crypto;
  if (!crypto?.subtle) throw Error('Secure recovery is unavailable; existing Planner entries were kept.');
  if (candidates.length > 10000) throw Error('Planner recovery is too large; existing entries were kept.');
  const unique = [...new Map(candidates.map(row => [row.canonical,row])).values()];
  const known = new Map();
  await Promise.all(unique.map(async row => {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(row.canonical));
    const fingerprint = [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2,'0')).join('');
    if (retired.has(fingerprint)) known.set(row.canonical,{ ...row, fingerprint });
  }));
  return known;
}
function partition(plan, known) {
  const kept = {}; const moved = new Map();
  for (const [date,rows] of Object.entries(plan)) {
    const remaining = rows.filter(item => {
      const match = known.get(stableStringify([date,item]));
      if (!match) return true;
      const previous = moved.get(match.fingerprint);
      moved.set(match.fingerprint,{date,item,fingerprint:match.fingerprint,copies:(previous?.copies||0)+1});
      return false;
    });
    if (remaining.length) kept[date] = remaining;
  }
  return { kept, moved:[...moved.values()] };
}
function preserveRecovery(storage, moved, now) {
  const archive = archiveFor(storage);
  for (const row of moved) {
    const existing = archive.entries.find(value => value.fingerprint === row.fingerprint);
    if (existing) {
      if(stableStringify([existing.date,existing.item])!==stableStringify([row.date,row.item]))throw Error('The recovery copy has changed. Existing Planner entries were kept.');
      existing.copies = Math.max(existing.copies,row.copies);
    }
    else archive.entries.push({...row,archivedAt:now});
  }
  // The recoverable original rows must be durable before touching active data.
  write(storage,ARCHIVE_KEY,archive);
}
function serialized(operation) {
  const result = recoveryQueue.then(operation,operation);
  recoveryQueue = result.catch(()=>{});
  return result;
}

export function recoverLegacyPlannerSeed({storage=getSafeLocalStorage(),now=Date.now()}={}) {
  return serialized(async()=>{
    try {
      if (!storage) throw Error('Planner storage is unavailable.');
      const known = await identify(readPlan(storage));
      // Explicit edits/new saves made while hashing always win.
      const expectedBytes=storage.getItem(PLAN_KEY);
      const {kept,moved} = partition(readPlan(storage,expectedBytes),known);
      if (!moved.length) return {ok:true,moved:0};
      preserveRecovery(storage,moved,now);
      if(storage.getItem(PLAN_KEY)!==expectedBytes)throw Error('Planner changed during cleanup. Your changes were kept; retry cleanup.');
      write(storage,PLAN_KEY,kept);
      return {ok:true,moved:moved.reduce((sum,row)=>sum+row.copies,0)};
    } catch(error) { return {ok:false,error:error.message||'Planner cleanup failed; existing entries were kept.'}; }
  });
}

export function quarantineLegacyRemotePlan(plan,{storage=getSafeLocalStorage(),now=Date.now()}={}) {
  return serialized(async()=>{
    if (!storage) throw Error('Planner storage is unavailable.');
    const {kept,moved} = partition(plan,await identify(plan));
    if (moved.length) preserveRecovery(storage,moved,now);
    return kept;
  });
}

export function getPlannerSeedRecovery({storage=getSafeLocalStorage()}={}) {
  try {
    if (!storage) return {archivedCount:0};
    const archive = archiveFor(storage); const plan = readPlan(storage);
    const archivedCount = archive.entries.reduce((sum,row)=>{
      const active = (plan[row.date]||[]).filter(item=>stableStringify(item)===stableStringify(row.item)).length;
      const restored = (plan[row.date]||[]).some(item=>item.legacySeedRecovery?.fingerprint===row.fingerprint);
      return sum+(row.restoredAt||restored?0:Math.max(0,row.copies-active));
    },0);
    return {archivedCount,totalRecovered:archive.entries.reduce((sum,row)=>sum+row.copies,0)};
  } catch(error) { return {archivedCount:0,error:error.message}; }
}

export function restorePlannerSeedRecovery({storage=getSafeLocalStorage(),now=Date.now()}={}) {
  return serialized(async()=>{
  try {
    if (!storage) throw Error('Planner storage is unavailable.');
    const archive = archiveFor(storage);
    const original={};for(const row of archive.entries)(original[row.date]||=[]).push(row.item);
    const verified=await identify(original);
    for(const row of archive.entries)if(verified.get(stableStringify([row.date,row.item]))?.fingerprint!==row.fingerprint)throw Error('The recovery copy could not be verified. Existing Planner entries were kept.');
    const expectedBytes=storage.getItem(PLAN_KEY); const plan = readPlan(storage,expectedBytes); let restored=0;
    for (const entry of archive.entries.filter(row=>!row.restoredAt)) {
      const rows = plan[entry.date] ||= [];
      // A later personal revision is preserved instead of overwritten by recovery.
      const existing = rows.filter(row=>(row.savedPlanId||row.id||row.hiddenKey)===(entry.item.savedPlanId||entry.item.id||entry.item.hiddenKey)
        &&(!row.legacySeedRecovery||row.legacySeedRecovery.fingerprint===entry.fingerprint));
      if (!existing.length) for(let copy=0;copy<entry.copies;copy++) {
        rows.push({...entry.item,legacySeedRecovery:{fingerprint:entry.fingerprint,restoredAt:now}});restored++;
      }
      else for(const row of existing) if(stableStringify(row)===stableStringify(entry.item)) row.legacySeedRecovery={fingerprint:entry.fingerprint,restoredAt:now};
      entry.restoredAt=now;
    }
    if(storage.getItem(PLAN_KEY)!==expectedBytes)throw Error('Planner changed during recovery. Your changes were kept; retry restore.');
    write(storage,PLAN_KEY,plan);
    // Restored rows carry their own explicit marker even if this bookkeeping write fails.
    try { write(storage,ARCHIVE_KEY,archive); } catch { /* recovery copy remains available */ }
    return {ok:true,restored};
  } catch(error) { return {ok:false,error:error.message||'The recovery copy could not be restored.'}; }
  });
}

export function exportPlannerSeedRecovery({storage=getSafeLocalStorage()}={}) {
  if (!storage) throw Error('Planner storage is unavailable.');
  return JSON.stringify(archiveFor(storage),null,2);
}

export const __plannerSeedRecoveryForTest = {PLAN_KEY,ARCHIVE_KEY,identify};
