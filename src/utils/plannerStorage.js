import { getRuntimeCapabilities } from "../runtime/runtimeCapabilities.js";
import { toLocalDateKey } from './dateKey.js';
import { upAheadDateKey } from '../services/upAheadLifecycle.js';
import { recoverLegacyPlannerSeed, quarantineLegacyRemotePlan } from './plannerSeedRecovery.js';
import {
    makeStorageWriteFailure,
    safeGetJson,
    getSafeLocalStorage,
    safeSetJson,
} from '../data/safeStorage.js';

const PLANNER_KEY = 'upAhead_planner';
const BLACKLIST_KEY = 'upAhead_blacklist';
const REMOVED_KEY = 'upAhead_planner_removed_v1';
let planPostQueue = Promise.resolve();
let mutationVersion = 0;
const changedKeys = new Map();
const API_BASE = '/api';
const STATIC_BLACKLIST_URL = `${import.meta.env.BASE_URL || './'}data/blacklist.json`;

function isStaticHostRuntime() { return getRuntimeCapabilities().isStaticHost; }

function hash(value) {
    let h = 0;
    if (!value) return '0';
    for (let i = 0; i < value.length; i++) {
        h = (h << 5) - h + value.charCodeAt(i);
        h |= 0;
    }
    return h.toString();
}

function generateCanonicalId(title, dateStr) {
    const slug = String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return hash(`${slug}-${dateStr}`);
}

function normalizeDateKey(value) {
    if (!value) return 'nodate';
    return toLocalDateKey(value) || 'nodate';
}

function resolveOccurrenceDateKey(item, fallbackDate = null) {
    if (item && Object.hasOwn(item, 'eventDateKey') && item.eventDateKey === null) return 'nodate';
    const explicit = item?.eventDateKey ? upAheadDateKey(item) : null;
    return explicit || normalizeDateKey(item?.eventDate || item?.extractedDate || item?.date || item?.releaseDate || item?.planDate || fallbackDate);
}

// Saved-plan identity is not publisher/story identity. Explicit IDs win;
// legacy ambiguous records remain separate, including during read and sync.
function getItemKey(itemOrId) {
    if (typeof itemOrId === 'string') return itemOrId.trim();
    if (!itemOrId || typeof itemOrId !== 'object') return '';
    return String(itemOrId.savedPlanId || itemOrId.id || itemOrId.hiddenKey || itemOrId.canonicalId || '').trim();
}
function legacyKey(item, date) {
    return getItemKey(item) || `legacy:${generateCanonicalId(JSON.stringify(item), date)}`;
}
function occurrenceSlot(item, date) {
    return JSON.stringify([String(item.id || item.hiddenKey || item.canonicalId || legacyKey(item, date)), resolveOccurrenceDateKey(item, date), item.eventStartAt || '', item.locationCanonical || item.city || item.location || '']);
}
export function getSavedPlanIdentity(item, date) {
    return item?.savedPlanId || (item && `legacy:${occurrenceSlot(item, date)}`);
}
function durableKey(item, date) {
    return JSON.stringify([date, getSavedPlanIdentity(item, date)]);
}
function legacyDurableKey(item, date) { return JSON.stringify([date, `legacy:${occurrenceSlot(item,date)}`]); }
function markMutation(item,date) {
    const version = ++mutationVersion;
    changedKeys.set(durableKey(item,date),version);
    changedKeys.set(legacyDurableKey(item,date),version);
}
function normalizePlanItem(item, fallbackDate = null) {
    if (!item || typeof item !== 'object' || !item.title) return null;
    const eventDateKey = resolveOccurrenceDateKey(item, fallbackDate);
    const id = getItemKey(item) || globalThis.crypto?.randomUUID?.() || `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    // A scoped occurrence key can be used as durable ID for explicit feed saves;
    // independently created manual records keep their own supplied ID.
    const savedPlanId = item.savedPlanId || item.occurrenceKey || id;
    return {
        ...item,
        id: item.id || id,
        savedPlanId,
        hiddenKey: item.hiddenKey || id,
        canonicalId: item.canonicalId || id,
        category: item.category || 'events',
        type: item.type || 'event',
        eventDateKey: eventDateKey === 'nodate' ? null : eventDateKey,
        eventDate: item.eventDate || (eventDateKey !== 'nodate' ? eventDateKey : null),
        locationCanonical: item.locationCanonical || item.location || '',
        sourceMode: item.sourceMode || 'live',
        state: item.state || 'saved',
        planDate: item.planDate || fallbackDate || (eventDateKey !== 'nodate' ? eventDateKey : null)
    };
}
function hasSimilarPlanItem(items, candidate, date) {
    return (items || []).some(existing => existing && (durableKey(existing, date) === durableKey(candidate, date)
        || (!existing.savedPlanId && occurrenceSlot(existing, date) === occurrenceSlot(candidate, date))));
}
function normalizeBlacklistData(list) { return Array.isArray(list) ? [...new Set(list.map(entry => typeof entry === 'string' ? entry.trim() : String(entry?.occurrenceKey || entry?.hiddenKey || getItemKey(entry))).filter(Boolean))] : []; }
function normalizePlanData(planData) {
    if (!planData || typeof planData !== 'object' || Array.isArray(planData)) return {};
    // Never normalize/deduplicate/prune persisted rows on an unrelated write.
    return Object.fromEntries(Object.entries(planData).filter(([, items]) => Array.isArray(items)));
}
function readLocalPlan() {
    const storage = getSafeLocalStorage();
    if (!storage) throw Error('Planner storage unavailable');
    const bytes = storage.getItem(PLANNER_KEY);
    if (bytes === null) return {};
    const parsed = JSON.parse(bytes);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.values(parsed).some(rows => !Array.isArray(rows))) throw Error('Invalid stored planner data; refusing to overwrite');
    return parsed;
}
function writeLocalPlan(planData) {
    if (!safeSetJson(PLANNER_KEY, planData)) return makeStorageWriteFailure(PLANNER_KEY);
    return { ok: true, plan: planData };
}
function readRemoved() { return safeGetJson(REMOVED_KEY, {}) || {}; }
function timestamp(item) { const n = Date.parse(item?.planUpdatedAt || item?.updatedAt || ''); return Number.isFinite(n) ? n : 0; }
function rowEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function sameDurableRow(a, b, date) {
    return a && b && (durableKey(a,date) === durableKey(b,date) ||
        ((!a.savedPlanId || !b.savedPlanId) && occurrenceSlot(a,date) === occurrenceSlot(b,date)));
}
function removalFor(item,date) {
    const removed=readRemoved();
    return removed[durableKey(item,date)] || removed[legacyDurableKey(item,date)];
}
// A conditional full-plan write is permitted only if every remote row is
// represented without loss, or a uniquely identified older revision was
// explicitly changed/deleted locally. Ambiguous legacy conflicts fail closed.
function remoteRowsAccountedFor(remotePlan, outbound) {
    for (const [date, rows] of Object.entries(remotePlan)) {
        const available = [...(outbound[date] || [])];
        for (const row of rows) {
            const exact = available.findIndex(x => rowEqual(x,row));
            if (exact >= 0) { available.splice(exact,1); continue; }
            const matching = available.map((x,i)=>sameDurableRow(x,row,date)?i:-1).filter(i=>i>=0);
            if (matching.length === 1 && timestamp(row) && timestamp(available[matching[0]]) > timestamp(row)
                && rows.filter(x=>sameDurableRow(x,row,date)).length === 1) {
                available.splice(matching[0],1); continue;
            }
            const removal = removalFor(row,date);
            if (matching.length === 0 && removal?.priorTimestamp && timestamp(row) && timestamp(row) <= removal.priorTimestamp
                && rows.filter(x=>sameDurableRow(x,row,date)).length === 1) continue;
            return false;
        }
    }
    return true;
}
async function writableRemotePlan() {
    const response = await fetch(`${API_BASE}/user_plan`, {cache:'no-store'});
    if (!response.ok) return null;
    const etag = response.headers?.get('ETag');
    const plan = await response.json();
    if (!etag || !plan || typeof plan !== 'object' || Array.isArray(plan) || Object.values(plan).some(rows=>!Array.isArray(rows))) return null;
    return {plan,etag};
}
// Only an unambiguous, explicitly newer revision may replace an unchanged
// local record. Remote absence is never deletion authority. Local edits that
// occur while GET is in flight always win, even against a newer timestamp.
function mergePlans(localPlan, remotePlan, requestStart = localPlan, startVersion = mutationVersion) {
    const merged = Object.fromEntries(Object.entries(localPlan).map(([date, rows]) => [date, [...rows]]));
    const removed = readRemoved();
    for (const [date, rows] of Object.entries(normalizePlanData(remotePlan))) {
        const target = merged[date] ||= [];
        const imported = new Set();
        for (const remote of rows) {
            if (!remote || typeof remote !== 'object') continue;
            const key = durableKey(remote, date);
            if (removed[key] || removed[legacyDurableKey(remote, date)]) continue;
            const matching = row => sameDurableRow(row, remote, date);
            if (Math.max(changedKeys.get(key) || 0, changedKeys.get(legacyDurableKey(remote,date)) || 0) > startVersion) continue;
            const matches = target.map((row, i) => matching(row) && !imported.has(i) ? i : -1).filter(i => i >= 0);
            const started = (requestStart[date] || []).filter(matching);
            if (matches.length === 0) {
                if (!started.length) { imported.add(target.length); target.push(remote); }
                continue;
            }
            if (matches.length !== 1 || started.length !== 1) continue;
            const i = matches[0], current = target[i];
            if (rowEqual(current, started[0]) && timestamp(current) && timestamp(remote) > timestamp(current)) {
                target[i] = { ...current, ...remote, savedPlanId: current.savedPlanId || remote.savedPlanId || getItemKey(current), planUpdatedAt: remote.planUpdatedAt || remote.updatedAt };
            }
        }
        if (!target.length) delete merged[date];
    }
    return merged;
}
async function synchronizePlan() {
    const recovery = await recoverLegacyPlannerSeed();
    if (!recovery.ok) return recovery;
    const requestStart = readLocalPlan();
    const startVersion = mutationVersion;
    const remote = await quarantineLegacyRemotePlan(await fetchRemotePlan());
    const local = readLocalPlan();
    const merged = mergePlans(local, remote, requestStart, startVersion);
    if (rowEqual(local, merged)) return { ok: true, plan: local };
    return writeLocalPlan(merged);
}
function readLocalBlacklist() { return normalizeBlacklistData(safeGetJson(BLACKLIST_KEY, [])); }
function writeLocalBlacklist(list) {
    const normalized = normalizeBlacklistData(list);
    if (!safeSetJson(BLACKLIST_KEY, normalized)) {
        return makeStorageWriteFailure(BLACKLIST_KEY);
    }
    return { ok: true, list: normalized };
}
export function isPlannerStorageSuccess(result) {
    return result === true || result?.ok === true;
}

export function getPlannerStorageError(result, fallback = 'Planner storage operation failed') {
    return typeof result?.error === 'string' ? result.error : fallback;
}

async function fetchRemotePlan() {
    if (!isStaticHostRuntime()) {
        try {
            const apiResponse = await fetch(`${API_BASE}/user_plan`);
            if (apiResponse.ok) return normalizePlanData(await apiResponse.json());
        } catch (e) {
            console.warn('[PlannerStorage] API plan fetch unavailable', e);
        }
    }
    // Public app publications are not a personal Planner backup. Never import
    // bundled user_plan.json; the private API and explicit local saves own plans.
    return {};
}

async function fetchRemoteBlacklist() {
    if (!isStaticHostRuntime()) {
        try {
            const apiResponse = await fetch(`${API_BASE}/blacklist`);
            if (apiResponse.ok) return normalizeBlacklistData(await apiResponse.json());
        } catch (e) {
            console.warn('[PlannerStorage] API blacklist fetch unavailable', e);
        }
    }
    try {
        const staticResponse = await fetch(STATIC_BLACKLIST_URL);
        if (staticResponse.ok) return normalizeBlacklistData(await staticResponse.json());
    } catch (e) {
        console.warn('[PlannerStorage] Static blacklist fetch unavailable', e);
    }
    return [];
}

const plannerStorage = {
    sync: async () => {
        try {
            const remoteBlacklist = await fetchRemoteBlacklist();
            const localBlacklist = plannerStorage.getBlacklist();
            const mergedBlacklist = new Set([...localBlacklist, ...remoteBlacklist]);
            const blacklistWrite = writeLocalBlacklist([...mergedBlacklist]);
            if (!isPlannerStorageSuccess(blacklistWrite)) return blacklistWrite;
            return await synchronizePlan();
        } catch (e) {
            console.warn('[PlannerStorage] Sync failed', e);
            return { ok: false, reason: 'sync-failed', error: e?.message || String(e) };
        }
    },
    loadBlacklistFromApi: async () => {
        try {
            const remoteBlacklist = await fetchRemoteBlacklist();
            const mergedBlacklist = new Set([...readLocalBlacklist(), ...remoteBlacklist]);
            const result = writeLocalBlacklist([...mergedBlacklist]);
            if (!isPlannerStorageSuccess(result)) return result;
            return mergedBlacklist;
        } catch (e) {
            console.warn('[PlannerStorage] Blacklist load from API failed', e);
            return new Set(readLocalBlacklist());
        }
    },
    loadPlanFromApi: async () => {
        try {
            const result = await synchronizePlan();
            return isPlannerStorageSuccess(result) ? result.plan : result;
        } catch (e) {
            console.warn('[PlannerStorage] Plan load from API failed', e);
            return { ok: false, reason: 'sync-failed', error: e?.message || String(e) };
        }
    },
    getPlan: () => { try { return readLocalPlan(); } catch(e) { console.warn('[PlannerStorage] Plan unreadable; retaining stored bytes',e); return {}; } },
    getUpcomingDays: (days = 14) => {
        try {
            const parsed = readLocalPlan();
            const today = toLocalDateKey(new Date());
            return Object.entries(parsed).filter(([date]) => date >= today).sort((a, b) => a[0].localeCompare(b[0])).slice(0, days).map(([date, items]) => ({ date, items }));
        } catch (e) {
            console.error('Failed to read planner storage', e);
            return [];
        }
    },
    addItem: (date, item) => {
        try {
            const parsed = readLocalPlan();
            const normalizedItem = normalizePlanItem({ ...item, planDate: date, planUpdatedAt: new Date().toISOString() }, date);
            if (!normalizedItem) return { ok: false, reason: 'invalid-item', error: 'Planner item is invalid' };
            if (!parsed[date]) parsed[date] = [];
            if (!hasSimilarPlanItem(parsed[date], normalizedItem, date)) {
                parsed[date].push(normalizedItem);
                const result = writeLocalPlan(parsed);
                if (!isPlannerStorageSuccess(result)) return result;
                const removed = readRemoved();
                delete removed[durableKey(normalizedItem, date)];
                delete removed[legacyDurableKey(normalizedItem,date)];
                markMutation(normalizedItem,date);
                safeSetJson(REMOVED_KEY, removed);
                plannerStorage.savePlanToApi(parsed);
                return { ok: true, item: normalizedItem };
            } else if (import.meta.env.DEV) {
                console.debug('[Planner] dedupe_skip', {
                    date,
                    title: normalizedItem.title,
                    eventDateKey: normalizedItem.eventDateKey
                });
            }
            return { ok: false, reason: 'duplicate', error: 'Planner item is already saved' };
        } catch (e) { console.error('Failed to add item to planner', e); return { ok: false, reason: 'planner-add-failed', error: e?.message || String(e) }; }
    },
    removeItem: (date, itemId) => {
        try {
            const parsed = readLocalPlan();
            const itemKey = getItemKey(itemId);
            if (parsed[date]) {
                const exact = parsed[date].filter(i => getSavedPlanIdentity(i,date) === itemKey || getItemKey(i) === itemKey);
                const matches = exact.length ? exact : parsed[date].filter(i => i.hiddenKey === itemKey || i.canonicalId === itemKey);
                if (matches.length !== 1) return { ok: false, reason: matches.length ? 'ambiguous-id' : 'not-found', error: 'Planner item identity is not unique' };
                // Capture exact tombstone bytes before the first of two writes.
                // If the plan write fails, restore the tombstone so a rejected
                // removal cannot poison future synchronization/reopening.
                const removedStorage = getSafeLocalStorage();
                const removedBeforeBytes = removedStorage?.getItem(REMOVED_KEY) ?? null;
                const removed = readRemoved();
                const tombstone = { priorTimestamp: timestamp(matches[0]), removedAt: Date.now() };
                removed[durableKey(matches[0], date)] = tombstone;
                removed[legacyDurableKey(matches[0],date)] = tombstone;
                if (!safeSetJson(REMOVED_KEY, removed)) return makeStorageWriteFailure(REMOVED_KEY);
                parsed[date] = parsed[date].filter(i => i !== matches[0]);
                if (parsed[date].length === 0) delete parsed[date];
                const result = writeLocalPlan(parsed);
                if (!isPlannerStorageSuccess(result)) {
                    try {
                        if (removedBeforeBytes === null) removedStorage?.removeItem(REMOVED_KEY);
                        else removedStorage?.setItem(REMOVED_KEY, removedBeforeBytes);
                    } catch (rollbackError) {
                        return { ...result, rollbackFailed: true, error: `${result.error}; removal marker restoration failed: ${rollbackError?.message || rollbackError}` };
                    }
                    return result;
                }
                markMutation(matches[0],date);
                plannerStorage.savePlanToApi(parsed);
                return { ok: true };
            }
            return { ok: false, reason: 'not-found', error: 'Planner item was not found' };
        } catch (e) { console.error('Failed to remove item', e); return { ok: false, reason: 'planner-remove-failed', error: e?.message || String(e) }; }
    },
    merge: (dates, newItems) => {
        try {
            const parsed = readLocalPlan();
            let changed = false;
            dates.forEach(date => {
                if (!parsed[date]) parsed[date] = [];
                (newItems || []).forEach(rawItem => {
                    const item = normalizePlanItem({ ...rawItem, planUpdatedAt: new Date().toISOString() }, date);
                    if (item && !hasSimilarPlanItem(parsed[date], item, date)) { parsed[date].push(item); markMutation(item,date); changed = true; }
                });
            });
            if (changed) {
                const result = writeLocalPlan(parsed);
                if (!isPlannerStorageSuccess(result)) return result;
                plannerStorage.savePlanToApi(parsed);
            }
            return { ok: true, changed };
        } catch (e) { console.error('Merge failed', e); return { ok: false, reason: 'planner-merge-failed', error: e?.message || String(e) }; }
    },
    savePlanToApi: async () => {
        try {
            // Callers already committed the explicit local mutation. Do not
            // rewrite local storage from a delayed outbound synchronization.
            if (isStaticHostRuntime()) return true;
            // Serialize full-plan POSTs in this runtime; each dispatch reads
            // current committed state. An older in-flight write cannot finish
            // after a newer write from this same client.
            const send = async () => {
                for (let attempt=0; attempt<2; attempt++) {
                    const requestStart = readLocalPlan(), startVersion = mutationVersion;
                    const remote = await writableRemotePlan();
                    // Older servers without a revision token cannot safely
                    // accept a whole-plan replacement. Local saving remains durable.
                    if (!remote) return false;
                    const local = readLocalPlan();
                    const outbound = mergePlans(local,remote.plan,requestStart,startVersion);
                    if (!remoteRowsAccountedFor(remote.plan,outbound)) return false;
                    const response = await fetch(`${API_BASE}/user_plan`, {method:'POST',headers:{'Content-Type':'application/json','If-Match':remote.etag},body:JSON.stringify(outbound)});
                    if (response.ok) return true;
                    if (response.status !== 412) return false;
                }
                return false;
            };
            const operation = planPostQueue.then(send, send);
            planPostQueue = operation.catch(() => false);
            return await operation;
        } catch (e) { console.warn('API save plan error:', e); return false; }
    },
    addToBlacklist: (id) => {
        try {
            const key = normalizeBlacklistData([id])[0];
            if (!key) return;
            const list = readLocalBlacklist();
            if (!list.includes(key)) {
                list.push(key);
                const blacklistWrite = writeLocalBlacklist(list);
                if (!isPlannerStorageSuccess(blacklistWrite)) return blacklistWrite;
                plannerStorage.saveBlacklistToApi(list);
                return { ok: true };
            }
            return { ok: true, skipped: true };
        } catch (e) { console.error('Failed to blacklist', e); return { ok: false, reason: 'blacklist-failed', error: e?.message || String(e) }; }
    },
    getBlacklist: () => { try { return new Set(readLocalBlacklist()); } catch { return new Set(); } },
    saveBlacklistToApi: async (list) => {
        try {
            const normalizedList = normalizeBlacklistData(list);
            const result = writeLocalBlacklist(normalizedList);
            if (!isPlannerStorageSuccess(result)) return result;
            if (isStaticHostRuntime()) return true;
            await fetch(`${API_BASE}/blacklist`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(normalizedList) });
            return true;
        } catch (e) { console.warn('API save blacklist error:', e); return false; }
    }
};

export default plannerStorage;
