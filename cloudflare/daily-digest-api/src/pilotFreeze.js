import { discoverAkashvaniMorningNews } from './adapters/akashvaniMorningNews.js';
import { discoverIndianExpressDailyBriefing } from './adapters/indianExpressDailyBriefing.js';
import { discoverTheHinduMorningDigest } from './adapters/theHinduMorningDigest.js';
import { ACQUISITION_STATES, isDigestDate } from './contracts.js';
import { resolveGlobalV1Availability } from './globalV1Qualification.js';
import { applySelectionDecisions, evaluatePilotCandidate } from './pilotCandidatePolicy.js';
import { DAILY_DIGEST_REGISTRY_VERSION } from './registry.js';
import { selectDailyDigest } from './selector.js';
import { readSnapshot, writeSnapshot } from './snapshotStore.js';

export const PILOT_FREEZE_TIME = '10:15';
export const PILOT_TIMEZONE = 'Asia/Kolkata';
export const PILOT_POLICY_VERSION = 'daily-digest-policy/v0.3';

const INDIA_DISCOVERERS = Object.freeze([
  Object.freeze({ publisherFamily: 'AKASHVANI', discover: discoverAkashvaniMorningNews }),
  Object.freeze({ publisherFamily: 'INDIAN_EXPRESS', discover: discoverIndianExpressDailyBriefing }),
  Object.freeze({ publisherFamily: 'THE_HINDU', discover: discoverTheHinduMorningDigest }),
]);

const DEFAULT_STORE = Object.freeze({ readSnapshot, writeSnapshot });

function localClock(now, timeZone = PILOT_TIMEZONE) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).map(part => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minute: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function freezeMinute() {
  const [hour, minute] = PILOT_FREEZE_TIME.split(':').map(Number);
  return hour * 60 + minute;
}

export function resolvePilotFreezeState(digestDate, now = new Date()) {
  if (!isDigestDate(digestDate)) return { state: 'INVALID_DIGEST_DATE', clock: null };
  const clock = localClock(now);
  if (clock.date < digestDate) return { state: 'FUTURE_DIGEST_DATE', clock };
  if (clock.date > digestDate) return { state: 'DIGEST_DATE_CLOSED', clock };
  if (clock.minute < freezeMinute()) return { state: 'BEFORE_FREEZE', clock };
  return { state: 'READY_TO_FREEZE', clock };
}

export function digestDateForScheduledTime(now = new Date()) {
  return localClock(now).date;
}

async function discoverOne(source, options) {
  try {
    return { publisherFamily: source.publisherFamily, result: await source.discover(options) };
  } catch {
    return {
      publisherFamily: source.publisherFamily,
      result: {
        status: 'ADAPTER_ERROR', candidate: null, scheduleState: null,
        acquisitionState: ACQUISITION_STATES.CRITICAL,
      },
    };
  }
}

function sourceDecision(item) {
  const result = item.result || {};
  return {
    publisherFamily: item.publisherFamily,
    status: result.status || 'UNKNOWN',
    scheduleState: result.scheduleState || null,
    acquisitionState: result.acquisitionState || null,
    editionState: result.candidate?.editionState || null,
    qualityEvidenceState: result.qualityEvidence?.state || 'UNAVAILABLE',
  };
}

async function discoverIndia({ digestDate, fetchImpl, now }) {
  const options = { digestDate, fetchImpl, now };
  const results = await Promise.all(INDIA_DISCOVERERS.map(source => discoverOne(source, options)));
  return {
    sourceDecisions: results.map(sourceDecision),
    entries: results.filter(item => item.result?.candidate).map(item => ({
      candidate: item.result.candidate,
      qualityEvidence: item.result.qualityEvidence || null,
    })),
  };
}

function qualityOverridesFor(candidate, overrides) {
  return overrides?.[candidate.publisherFamily] || {};
}

function evaluateCandidates(entries, qualityOverrides) {
  return entries.map(entry => evaluatePilotCandidate(entry.candidate, {
    qualityEvidence: entry.qualityEvidence,
    overrides: qualityOverridesFor(entry.candidate, qualityOverrides),
  }));
}

function selectionRows(selection) {
  return Object.fromEntries(Object.entries(selection).map(([slot, candidate]) => [slot, {
    canonicalId: candidate.canonicalId,
    selectionReason: 'INITIAL_ROLE_SELECTION',
  }]));
}

function buildSnapshot({ digestDate, now, collectionStartedAt, selected, candidates, policyVersion }) {
  const frozenAt = now.toISOString();
  return {
    schemaVersion: 'daily-digest-snapshot/v1',
    snapshotId: `daily-digest:${digestDate}:v1`,
    digestDate,
    policyVersion,
    registryVersion: DAILY_DIGEST_REGISTRY_VERSION,
    decisionTimezone: PILOT_TIMEZONE,
    collectionStartedAt,
    frozenAt,
    snapshotRevision: 1,
    compositionState: selected.compositionState,
    selections: selectionRows(selected.selection),
    candidates: applySelectionDecisions(candidates, selected.selection),
    createdAt: frozenAt,
    updatedAt: frozenAt,
  };
}

async function existingSnapshot(store, db, digestDate) {
  if (!db) return null;
  return store.readSnapshot(db, digestDate);
}

async function persistOnce(store, db, snapshot) {
  try {
    const write = await store.writeSnapshot(db, snapshot);
    return { status: 'FROZEN', snapshotWritten: true, write };
  } catch (error) {
    const existing = await store.readSnapshot(db, snapshot.digestDate);
    if (existing) return { status: 'ALREADY_FROZEN', snapshotWritten: false, snapshot: existing };
    throw error;
  }
}

export async function freezeDailyDigestPilot(options) {
  const now = options.now || new Date();
  const freezeState = resolvePilotFreezeState(options.digestDate, now);
  if (freezeState.state === 'INVALID_DIGEST_DATE') return { ...freezeState, snapshotWritten: false };

  const store = options.store || DEFAULT_STORE;
  const existing = await existingSnapshot(store, options.db, options.digestDate);
  if (existing) return { status: 'ALREADY_FROZEN', snapshotWritten: false, snapshot: existing };
  if (freezeState.state !== 'READY_TO_FREEZE') return { ...freezeState, snapshotWritten: false };

  const globalDecision = resolveGlobalV1Availability();
  if (globalDecision.state !== 'GLOBAL_UNAVAILABLE') {
    return { status: 'GLOBAL_PIPELINE_NOT_AUTHORIZED', snapshotWritten: false, globalDecision };
  }

  const collectionStartedAt = now.toISOString();
  const discovery = await discoverIndia({ digestDate: options.digestDate, fetchImpl: options.fetchImpl, now });
  const candidates = evaluateCandidates(discovery.entries, options.qualityOverrides);
  const selected = selectDailyDigest(candidates);
  if (!Object.keys(selected.selection).length) {
    return {
      status: 'NO_ELIGIBLE_CANDIDATES', snapshotWritten: false,
      sourceDecisions: discovery.sourceDecisions, globalDecision,
    };
  }

  const snapshot = buildSnapshot({
    digestDate: options.digestDate, now, collectionStartedAt, selected, candidates,
    policyVersion: options.policyVersion || PILOT_POLICY_VERSION,
  });
  const context = { snapshot, sourceDecisions: discovery.sourceDecisions, globalDecision };
  if (!options.writeEnabled) return { status: 'DRY_RUN_READY', snapshotWritten: false, ...context };
  if (!options.db) return { status: 'STORE_UNAVAILABLE', snapshotWritten: false, ...context };
  return { ...context, ...(await persistOnce(store, options.db, snapshot)) };
}

export async function runScheduledPilot(controller, env = {}) {
  if (env.DAILY_DIGEST_PILOT_WRITE_ENABLED !== 'true') {
    return { status: 'PILOT_WRITE_DISABLED', snapshotWritten: false };
  }
  const now = new Date(controller?.scheduledTime || Date.now());
  return freezeDailyDigestPilot({
    digestDate: digestDateForScheduledTime(now), now, db: env.DB, fetchImpl: fetch,
    writeEnabled: true, policyVersion: env.DAILY_DIGEST_POLICY_VERSION || PILOT_POLICY_VERSION,
  });
}
