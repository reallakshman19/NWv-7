import {
  ENVELOPE_FRESHNESS,
  ENVELOPE_SOURCES,
  makeEnvelope,
} from '../dataEnvelope.js';
import { getRuntimeCapabilities } from '../../runtime/runtimeCapabilities.js';
import { fetchDailyDigestDatasetApi } from './dailyDigestDatasetApiClient.js';

const IST_TIMEZONE = 'Asia/Kolkata';
const SNAPSHOT_SCHEMA = 'daily-digest-snapshot/v1';
const ALLOWED_HOSTS = Object.freeze({
  AKASHVANI: Object.freeze(['newsonair.gov.in']),
  INDIAN_EXPRESS: Object.freeze(['indianexpress.com', 'www.indianexpress.com']),
  THE_HINDU: Object.freeze(['thehindu.com', 'www.thehindu.com']),
  FINANCIAL_TIMES: Object.freeze(['ft.com', 'www.ft.com', 'ep.ft.com']),
});

function dateInTimeZone(now, timeZone = IST_TIMEZONE) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
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

export async function load(options = {}) {
  const runtime = getRuntimeCapabilities();
  const digestDate = validDigestDate(options.asOfDate)
    ? options.asOfDate
    : dateInTimeZone(options.now || new Date());
  const response = await fetchDailyDigestDatasetApi({
    baseUrl: runtime.configuredBackendUrl,
    digestDate,
    fetchImpl: options.fetchImpl,
    signal: options.signal,
  });

  if (['BACKEND_NOT_CONFIGURED', 'NOT_FROZEN'].includes(response.status)) {
    return expectedEmptyEnvelope(digestDate, response.status);
  }
  if (response.status !== 'READY') return failureEnvelope(digestDate, response.status);

  const snapshot = normalizeSnapshot(response.data, digestDate);
  if (!snapshot) return failureEnvelope(digestDate, 'INVALID_SNAPSHOT');
  return makeEnvelope({
    ok: true,
    datasetId: 'dailyDigest',
    data: { ...snapshot, availability: snapshot.cards.length ? 'READY' : 'EMPTY' },
    source: ENVELOPE_SOURCES.SNAPSHOT,
    freshness: snapshot.cards.length ? ENVELOPE_FRESHNESS.FRESH : ENVELOPE_FRESHNESS.EMPTY,
    generatedAt: snapshot.frozenAt ? Date.parse(snapshot.frozenAt) : null,
    validation: {
      passed: true,
      errors: [],
      warnings: snapshot.cards.length ? [] : ['daily_digest_no_valid_cards'],
    },
  });
}

export const __dailyDigestDatasetInternalsForTest = {
  dateInTimeZone,
  normalizeCard,
  normalizeSnapshot,
};
