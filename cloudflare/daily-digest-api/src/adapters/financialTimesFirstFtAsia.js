import {
  ACCESSIBILITY_STATES,
  ACQUISITION_STATES,
  EDITION_STATES,
  QUALIFICATION_STATES,
  buildCanonicalId,
} from '../contracts.js';
import { extractJsonLdObjects, htmlToText } from './html.js';

export const FINANCIAL_TIMES_FIRSTFT_ASIA = Object.freeze({
  publisherFamily: 'FINANCIAL_TIMES',
  product: 'FIRSTFT',
  edition: 'ASIA',
  role: 'GLOBAL_BUSINESS_AND_WORLD',
  productCatalogUrl: 'https://www.ft.com/newsletters',
  publisherTimezone: 'Asia/Kolkata',
  publicationDays: Object.freeze(['MON', 'TUE', 'WED', 'THU', 'FRI']),
  expectedPublicationStart: '01:30',
  expectedPublicationEnd: '05:00',
  publicationGraceMinutes: 30,
});

const FT_HOSTS = Object.freeze(new Set(['ft.com', 'www.ft.com', 'ep.ft.com']));
const MONTHS = Object.freeze({
  January: '01', February: '02', March: '03', April: '04', May: '05', June: '06',
  July: '07', August: '08', September: '09', October: '10', November: '11', December: '12',
});

function directFtUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !FT_HOSTS.has(url.hostname)) throw new Error('unexpected_publisher_host');
  url.hash = '';
  url.search = '';
  return url.toString();
}

function explicitEdition(text) {
  if (/\bFirstFT Europe\/Africa\b/i.test(text)) return 'EUROPE_AFRICA';
  if (/\bFirstFT Americas\b/i.test(text)) return 'AMERICAS';
  if (/\bFirstFT Asia\b/i.test(text)) return 'ASIA';
  return null;
}

export function resolveFirstFtEdition(html) {
  const text = htmlToText(html);
  const explicit = explicitEdition(text);
  if (explicit) return { edition: explicit, resolution: 'EXACT', signals: [`FIRSTFT_${explicit}_MARKER`] };
  if (/\bFirstFT\b/i.test(text) && /\bMarkets at 0?600 GMT\+8\b/i.test(text)) {
    return { edition: 'ASIA', resolution: 'SUPPORTED', signals: ['FIRSTFT_MARKER', 'MARKETS_0600_GMT_PLUS_8'] };
  }
  return { edition: null, resolution: 'UNRESOLVED', signals: [] };
}

function newsletterDate(text) {
  const prefix = String(text || '').slice(0, 700);
  const match = prefix.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\s+(\d{4})\b/i);
  if (!match) return null;
  const monthName = `${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()}`;
  return `${match[3]}-${MONTHS[monthName]}-${String(match[2]).padStart(2, '0')}`;
}

function firstFtArticle(html) {
  return extractJsonLdObjects(html).find(item => {
    const types = Array.isArray(item['@type']) ? item['@type'] : [item['@type']];
    const isArticle = types.some(type => /NewsArticle|Article/i.test(String(type || '')));
    return isArticle && /^FirstFT:/i.test(String(item.headline || item.name || ''));
  }) || null;
}

function dateInTimeZone(value, timeZone) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function evidenceDates(html, publisherPublishedAt) {
  const textDate = newsletterDate(htmlToText(html));
  const publishedDate = dateInTimeZone(publisherPublishedAt, FINANCIAL_TIMES_FIRSTFT_ASIA.publisherTimezone);
  return { textDate, publishedDate, digestDate: textDate || publishedDate };
}

function editionStateFor(dates, requestedDigestDate) {
  if (!dates.digestDate) return EDITION_STATES.INVALID;
  if (dates.textDate && dates.publishedDate && dates.textDate !== dates.publishedDate) return EDITION_STATES.INVALID;
  return dates.digestDate === requestedDigestDate ? EDITION_STATES.CURRENT : EDITION_STATES.STALE;
}

export function parseFirstFtAsiaEditionEvidence({ html, url, requestedDigestDate, observedAt, publisherPublishedAt = null }) {
  const canonicalUrl = directFtUrl(url);
  const edition = resolveFirstFtEdition(html);
  if (edition.edition !== 'ASIA') return null;
  const article = firstFtArticle(html);
  const publishedAt = article?.datePublished || publisherPublishedAt;
  const dates = evidenceDates(html, publishedAt);
  if (!dates.digestDate) return null;
  const editionState = editionStateFor(dates, requestedDigestDate);
  const title = String(article?.headline || article?.name || 'FirstFT Asia').trim();
  return {
    canonicalId: buildCanonicalId({ ...FINANCIAL_TIMES_FIRSTFT_ASIA, digestDate: dates.digestDate }),
    digestDate: dates.digestDate,
    requestedDigestDate,
    title,
    canonicalUrl,
    publisherFamily: 'FINANCIAL_TIMES',
    product: 'FIRSTFT',
    edition: 'ASIA',
    role: 'GLOBAL_BUSINESS_AND_WORLD',
    qualificationState: QUALIFICATION_STATES.HOLD,
    acquisitionState: ACQUISITION_STATES.OK,
    editionState,
    accessibilityState: ACCESSIBILITY_STATES.UNKNOWN,
    provenanceClass: 'ORIGINAL_EDITORIAL',
    editionResolution: edition.resolution,
    editionSignals: edition.signals,
    publisherPublishedAt: publishedAt,
    observedAt,
    selectionEligible: false,
  };
}
