import {
  ENVELOPE_FRESHNESS,
  ENVELOPE_SOURCES,
  makeEnvelope,
} from '../dataEnvelope.js';
import { getRuntimeCapabilities } from '../../runtime/runtimeCapabilities.js';
import { fetchDailyDigestDatasetApi } from './dailyDigestDatasetApiClient.js';
import { isLiveMode } from '../../utils/fetchMode.js';
import { loadDailyDigestLiveFallback } from '../dailyDigestLiveFallback.js';

const IST_TIMEZONE = 'Asia/Kolkata';
const SNAPSHOT_SCHEMA = 'daily-digest-snapshot/v1';
const FREEZE_MINUTE_IST = (10 * 60) + 15;
const ALLOWED_HOSTS = Object.freeze({
  AKASHVANI: Object.freeze(['newsonair.gov.in']),
  INDIAN_EXPRESS: Object.freeze(['indianexpress.com', 'www.indianexpress.com']),
  THE_HINDU: Object.freeze(['thehindu.com', 'www.thehindu.com']),
  FINANCIAL_TIMES: Object.freeze(['ft.com', 'www.ft.com', 'ep.ft.com']),
});

function clockInTimeZone(now, timeZone = IST_TIMEZONE) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).map(part => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minute: (Number(parts.hour) * 60) + Number(parts.minute),
  };
}

function dateInTimeZone(now, timeZone = IST_TIMEZONE) {
  return clockInTimeZone(now, timeZone).date;
}

function missingSnapshotAvailability(digestDate, now) {
  const clock = clockInTimeZone(now);
  if (digestDate > clock.date) return 'NOT_FROZEN';
  if (digestDate === clock.date && clock.minute < FREEZE_MINUTE_IST) return 'NOT_FROZEN';
  return 'MISSED_FREEZE';
}

function validDigestDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function validCardUrl(publisherFamily, value) {
  try {
    const url = new URL(value);
    const allowed = ALLOWED_HOSTS[publisherFamily] || [];
    return url.protocol === 'https:' && allowed.includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function normalizeCard(card) {
  if (!card || typeof card !== 'object') return null;
  const title = String(card.title || '').trim();
  const canonicalUrl = String(card.canonicalUrl || '').trim();
  const publisherFamily = String(card.publisherFamily || '').trim();
  if (!title || !validCardUrl(publisherFamily, canonicalUrl)) return null;
  return Object.freeze({
    slot: String(card.slot || ''),
    canonicalId: String(card.canonicalId || ''),
    publisherFamily,
    product: String(card.product || ''),
    edition: String(card.edition || ''),
    role: String(card.role || ''),
    title,
    canonicalUrl,
    selectionReason: card.selectionReason || null,
    replacementReason: card.replacementReason || null,
  });
}

function normalizeSnapshot(snapshot, digestDate) {
  if (!snapshot || snapshot.schemaVersion !== SNAPSHOT_SCHEMA) return null;
  if (snapshot.digestDate !== digestDate) return null;
  const cards = (Array.isArray(snapshot.cards) ? snapshot.cards : [])
    .map(normalizeCard)
    .filter(Boolean);
  return {
    snapshotId: snapshot.snapshotId || null,
    digestDate,
    frozenAt: snapshot.frozenAt || null,
    snapshotRevision: Number(snapshot.snapshotRevision || 1),
    compositionState: snapshot.compositionState || 'UNKNOWN',
    cards,
  };
}

function expectedEmptyEnvelope(digestDate, status) {
  return makeEnvelope({
    ok: true,
    datasetId: 'dailyDigest',
    data: { availability: status, digestDate, cards: [] },
    source: ENVELOPE_SOURCES.SNAPSHOT,
    freshness: ENVELOPE_FRESHNESS.EMPTY,
    validation: { passed: true, errors: [], warnings: [`daily_digest_${status.toLowerCase()}`] },
    diagnostics: [{
      event: 'dailyDigestDataset.expected_empty', severity: 'info',
      message: `Daily Digest is not renderable: ${status}`,
    }],
  });
}

function failureEnvelope(digestDate, status) {
  return makeEnvelope({
    ok: false,
    datasetId: 'dailyDigest',
    data: { availability: status, digestDate, cards: [] },
    source: ENVELOPE_SOURCES.FAILED,
    freshness: ENVELOPE_FRESHNESS.EMPTY,
    error: `daily digest unavailable: ${status}`,
    validation: { passed: false, errors: [`daily_digest_${status.toLowerCase()}`], warnings: [] },
  });
}

function liveFallbackEnvelope(digestDate, fallback, curatedStatus) {
  const cards = Array.isArray(fallback?.cards) ? fallback.cards : [];
  if (fallback?.status !== 'READY' || cards.length === 0) return null;

  return makeEnvelope({
    ok: true,
    datasetId: 'dailyDigest',
    data: {
      availability: 'READY',
      digestDate,
      frozenAt: null,
      snapshotId: null,
      snapshotRevision: null,
      compositionState: 'LIVE_SECTIONS_AUTHORITY',
      cards,
      deliveryMode: 'LIVE',
      liveGeneratedAt: fallback.generatedAt || null,
      liveFallbackReason: curatedStatus,
      authoritySummary: fallback.summary || null,
      liveSelection: fallback.selection || null,
    },
    source: ENVELOPE_SOURCES.LIVE,
    freshness: ENVELOPE_FRESHNESS.FRESH,
    generatedAt: fallback.generatedAt || null,
    validation: {
      passed: true,
      errors: [],
      warnings: [
        'daily_digest_live_fallback',
        curatedStatus ? `daily_digest_curated_${String(curatedStatus).toLowerCase()}` : null,
      ].filter(Boolean),
    },
    diagnostics: [{
      event: 'dailyDigestDataset.live_fallback',
      severity: 'warn',
      message: 'Daily Digest is using fresh ranked Sections authority stories because the curated edition is unavailable.',
      details: {
        curatedStatus,
        cardCount: cards.length,
        sourceGroupCount: fallback?.selection?.sourceGroupCount || 0,
        authoritySource: fallback?.summary?.dataSource?.effective || null,
      },
    }],
  });
}

async function maybeLoadLiveFallback({
  liveMode,
  digestDate,
  curatedStatus,
  now,
  liveFallbackLoader,
}) {
  if (!liveMode) return null;

  const fallback = await liveFallbackLoader({
    force: true,
    nowMs: Number(now?.getTime?.() || Date.now()),
  });

  return liveFallbackEnvelope(digestDate, fallback, curatedStatus);
}

export async function load(options = {}) {
  const runtime = getRuntimeCapabilities();
  const now = options.now || new Date();
  const digestDate = validDigestDate(options.asOfDate)
    ? options.asOfDate
    : dateInTimeZone(now);
  const liveMode = options.liveMode ?? isLiveMode();
  const liveFallbackLoader = options.liveFallbackLoader || loadDailyDigestLiveFallback;

  const response = await fetchDailyDigestDatasetApi({
    baseUrl: options.baseUrl !== undefined ? options.baseUrl : runtime.configuredBackendUrl,
    digestDate,
    fetchImpl: options.fetchImpl,
    signal: options.signal,
  });

  if (response.status === 'READY') {
    const snapshot = normalizeSnapshot(response.data, digestDate);

    if (snapshot?.cards?.length) {
      return makeEnvelope({
        ok: true,
        datasetId: 'dailyDigest',
        data: {
          ...snapshot,
          availability: 'READY',
          deliveryMode: 'CURATED',
        },
        source: ENVELOPE_SOURCES.SNAPSHOT,
        freshness: ENVELOPE_FRESHNESS.FRESH,
        generatedAt: snapshot.frozenAt ? Date.parse(snapshot.frozenAt) : null,
        validation: {
          passed: true,
          errors: [],
          warnings: [],
        },
      });
    }

    const liveEnvelope = await maybeLoadLiveFallback({
      liveMode,
      digestDate,
      curatedStatus: snapshot ? 'EMPTY' : 'INVALID_SNAPSHOT',
      now,
      liveFallbackLoader,
    });
    if (liveEnvelope) return liveEnvelope;

    if (!snapshot) return failureEnvelope(digestDate, 'INVALID_SNAPSHOT');

    return makeEnvelope({
      ok: true,
      datasetId: 'dailyDigest',
      data: {
        ...snapshot,
        availability: 'EMPTY',
        deliveryMode: 'CURATED',
      },
      source: ENVELOPE_SOURCES.SNAPSHOT,
      freshness: ENVELOPE_FRESHNESS.EMPTY,
      generatedAt: snapshot.frozenAt ? Date.parse(snapshot.frozenAt) : null,
      validation: {
        passed: true,
        errors: [],
        warnings: ['daily_digest_no_valid_cards'],
      },
    });
  }

  let curatedStatus = response.status;
  if (response.status === 'NOT_FROZEN') {
    curatedStatus = missingSnapshotAvailability(digestDate, now);
  }

  const liveEnvelope = await maybeLoadLiveFallback({
    liveMode,
    digestDate,
    curatedStatus,
    now,
    liveFallbackLoader,
  });
  if (liveEnvelope) return liveEnvelope;

  if (response.status === 'BACKEND_NOT_CONFIGURED') {
    return expectedEmptyEnvelope(digestDate, response.status);
  }

  if (response.status === 'NOT_FROZEN') {
    return curatedStatus === 'NOT_FROZEN'
      ? expectedEmptyEnvelope(digestDate, curatedStatus)
      : failureEnvelope(digestDate, curatedStatus);
  }

  return failureEnvelope(digestDate, response.status);
}

export const __dailyDigestDatasetInternalsForTest = {
  clockInTimeZone,
  dateInTimeZone,
  missingSnapshotAvailability,
  normalizeCard,
  normalizeSnapshot,
  liveFallbackEnvelope,
  maybeLoadLiveFallback,
};
