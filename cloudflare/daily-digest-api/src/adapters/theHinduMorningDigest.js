import {
  ACCESSIBILITY_STATES, ACQUISITION_STATES, EDITION_STATES,
  QUALIFICATION_STATES, buildCanonicalId,
} from '../contracts.js';
import { resolvePublicationState } from '../publicationCalendar.js';
import { unavailableQualityEvidence } from '../qualityClassifier.js';
import { parseRssItems } from './rss.js';

export const THE_HINDU_MORNING_DIGEST = Object.freeze({
  publisherFamily: 'THE_HINDU', product: 'MORNING_DIGEST', edition: 'DEFAULT',
  role: 'INDIA_GENERAL',
  discoveryUrl: 'https://www.thehindu.com/news/national/feeder/default.rss',
  publisherTimezone: 'Asia/Kolkata',
  publicationDays: Object.freeze(['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']),
  expectedPublicationStart: '06:00', expectedPublicationEnd: '09:15',
  publicationGraceMinutes: 30,
});

const MONTHS = Object.freeze({
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
});
const PATH_PATTERN = /^\/news\/morning-digest-([a-z]+)-(\d{1,2})-(\d{4})\/article\d+\.ece(?:\/amp\/?|\/)?$/i;

function digestDateFromPath(pathname) {
  const match = PATH_PATTERN.exec(pathname);
  const monthNumber = match ? MONTHS[match[1].toLowerCase()] : null;
  if (!match || !monthNumber) return null;
  const month = String(monthNumber).padStart(2, '0');
  const day = String(Number(match[2])).padStart(2, '0');
  return `${match[3]}-${month}-${day}`;
}

export function canonicalizeTheHinduUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (host !== 'thehindu.com' && host !== 'www.thehindu.com') return null;
    const digestDate = digestDateFromPath(url.pathname);
    if (!digestDate) return null;
    url.protocol = 'https:';
    url.hostname = 'www.thehindu.com';
    url.search = '';
    url.hash = '';
    url.pathname = url.pathname.replace(/\/amp\/?$/i, '').replace(/\/$/, '');
    return { url: url.toString(), digestDate };
  } catch {
    return null;
  }
}

function dateInTimeZone(value, timeZone) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = Object.fromEntries(formatter.formatToParts(parsed).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function normalizedTimestamp(value) {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function isMorningDigestTitle(value) {
  return /^(?:the hindu\s+)?morning digest\b/i.test(String(value || '').trim());
}

function candidateFromItem(item, requestedDigestDate, observedAt) {
  if (!isMorningDigestTitle(item.title)) return null;
  const canonical = canonicalizeTheHinduUrl(item.link);
  if (!canonical) return null;
  const publishedDate = dateInTimeZone(item.pubDate, THE_HINDU_MORNING_DIGEST.publisherTimezone);
  let editionState = EDITION_STATES.INVALID;
  if (publishedDate === canonical.digestDate) {
    editionState = canonical.digestDate === requestedDigestDate
      ? EDITION_STATES.CURRENT : EDITION_STATES.STALE;
  }
  return {
    canonicalId: buildCanonicalId({ ...THE_HINDU_MORNING_DIGEST, digestDate: canonical.digestDate }),
    digestDate: canonical.digestDate, requestedDigestDate, title: item.title,
    canonicalUrl: canonical.url, discoveryUrl: THE_HINDU_MORNING_DIGEST.discoveryUrl,
    publisherFamily: 'THE_HINDU', product: 'MORNING_DIGEST', edition: 'DEFAULT', role: 'INDIA_GENERAL',
    qualificationState: QUALIFICATION_STATES.QUALIFIED, acquisitionState: ACQUISITION_STATES.OK,
    editionState, accessibilityState: ACCESSIBILITY_STATES.UNKNOWN,
    provenanceClass: 'ORIGINAL_EDITORIAL', publisherPublishedAt: normalizedTimestamp(item.pubDate),
    observedAt, linkSemantics: 'DATED_ARTICLE_URL',
  };
}

export function parseTheHinduMorningDigestFeed(xml, requestedDigestDate, observedAt) {
  const candidates = parseRssItems(xml)
    .map(item => candidateFromItem(item, requestedDigestDate, observedAt))
    .filter(Boolean);
  return candidates.find(item => item.editionState === EDITION_STATES.CURRENT)
    || candidates.find(item => item.editionState === EDITION_STATES.INVALID)
    || candidates[0]
    || null;
}

function absentResult(publication, reason) {
  return {
    status: reason, candidate: null, scheduleState: publication.scheduleState,
    acquisitionState: publication.missingAcquisitionState,
  };
}

export async function discoverTheHinduMorningDigest({ digestDate, fetchImpl = fetch, now = new Date() }) {
  const publication = resolvePublicationState(THE_HINDU_MORNING_DIGEST, digestDate, now);
  if (['NOT_SCHEDULED', 'BEFORE_WINDOW', 'FUTURE_DATE'].includes(publication.phase)) {
    return absentResult(publication, publication.phase);
  }
  try {
    const response = await fetchImpl(THE_HINDU_MORNING_DIGEST.discoveryUrl, {
      headers: { Accept: 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8' },
    });
    if (!response?.ok) return absentResult(publication, 'FETCH_NON_OK');
    const candidate = parseTheHinduMorningDigestFeed(await response.text(), digestDate, now.toISOString());
    if (!candidate) return absentResult(publication, 'PRODUCT_CONTRACT_MISSING');
    candidate.scheduleState = publication.scheduleState;
    const status = candidate.editionState === EDITION_STATES.CURRENT ? 'FOUND' : candidate.editionState;
    return {
      status,
      candidate,
      qualityEvidence: unavailableQualityEvidence('THE_HINDU_ARTICLE_BODY_NOT_QUALIFIED'),
      scheduleState: publication.scheduleState,
      acquisitionState: candidate.acquisitionState,
    };
  } catch {
    return absentResult(publication, 'FETCH_ERROR');
  }
}
