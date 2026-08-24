import { ACCESSIBILITY_STATES, ACQUISITION_STATES, EDITION_STATES, QUALIFICATION_STATES, buildCanonicalId } from '../contracts.js';
import { resolvePublicationState } from '../publicationCalendar.js';
import { extractIndianExpressDigestQualityEvidence } from './digestQualityEvidence.js';
import { canonicalizePublisherUrl, extractAnchors, extractJsonLdObjects, htmlToText } from './html.js';

export const INDIAN_EXPRESS_DAILY_BRIEFING = Object.freeze({
  publisherFamily: 'INDIAN_EXPRESS', product: 'DAILY_BRIEFING', edition: 'DEFAULT',
  role: 'INDIA_GENERAL', discoveryUrl: 'https://indianexpress.com/section/live-news/',
  publisherTimezone: 'Asia/Kolkata', publicationDays: Object.freeze(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']),
  expectedPublicationStart: '08:30', expectedPublicationEnd: '10:15', publicationGraceMinutes: 30,
});

function isDailyBriefingAnchor(anchor) {
  try {
    const url = new URL(anchor.url);
    return url.hostname.replace(/^www\./, '') === 'indianexpress.com'
      && url.pathname.startsWith('/article/live-news/')
      && /^Daily Briefing\b/i.test(anchor.text);
  } catch { return false; }
}

export function extractIndianExpressDailyBriefingLinks(html) {
  const seen = new Set();
  return extractAnchors(html, INDIAN_EXPRESS_DAILY_BRIEFING.discoveryUrl)
    .filter(isDailyBriefingAnchor)
    .map(anchor => canonicalizePublisherUrl(anchor.url, 'indianexpress.com', { stripLite: true }))
    .filter(url => !seen.has(url) && seen.add(url));
}

function articleFromJsonLd(html) {
  return extractJsonLdObjects(html).find(item => {
    const types = Array.isArray(item['@type']) ? item['@type'] : [item['@type']];
    return types.some(type => /NewsArticle|Article/i.test(String(type || '')))
      && /^Daily Briefing\b/i.test(String(item.headline || item.name || ''));
  }) || null;
}

function fallbackPublishedAt(html) {
  const match = htmlToText(html).match(/\b(?:Updated:\s*)?([A-Z][a-z]{2})\s+(\d{1,2}),\s+(\d{4})\s+(\d{1,2}:\d{2})\s+(AM|PM)\s+IST\b/);
  if (!match) return null;
  const months = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
  let hour = Number(match[4].split(':')[0]) % 12;
  if (match[5] === 'PM') hour += 12;
  const minute = match[4].split(':')[1];
  return `${match[3]}-${months[match[1]]}-${String(match[2]).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${minute}:00+05:30`;
}

export function parseIndianExpressDailyBriefing(html, url, requestedDigestDate, observedAt) {
  const article = articleFromJsonLd(html);
  const title = String(article?.headline || article?.name || '').trim() || htmlToText(html).match(/Daily Briefing[^|]{0,180}/i)?.[0];
  if (!/^Daily Briefing\b/i.test(String(title || ''))) return null;
  const publisherPublishedAt = article?.datePublished || fallbackPublishedAt(html);
  if (!publisherPublishedAt || !/^\d{4}-\d{2}-\d{2}T/.test(publisherPublishedAt)) return null;
  const digestDate = publisherPublishedAt.slice(0, 10);
  return {
    canonicalId: buildCanonicalId({ ...INDIAN_EXPRESS_DAILY_BRIEFING, digestDate }),
    digestDate, requestedDigestDate, title,
    canonicalUrl: canonicalizePublisherUrl(article?.url || url, 'indianexpress.com', { stripLite: true }),
    discoveryUrl: INDIAN_EXPRESS_DAILY_BRIEFING.discoveryUrl,
    publisherFamily: 'INDIAN_EXPRESS', product: 'DAILY_BRIEFING', edition: 'DEFAULT', role: 'INDIA_GENERAL',
    qualificationState: QUALIFICATION_STATES.QUALIFIED, acquisitionState: ACQUISITION_STATES.OK,
    editionState: digestDate === requestedDigestDate ? EDITION_STATES.CURRENT : EDITION_STATES.STALE,
    accessibilityState: ACCESSIBILITY_STATES.UNKNOWN, provenanceClass: 'ORIGINAL_EDITORIAL',
    publisherPublishedAt, publisherUpdatedAt: article?.dateModified || null,
    observedAt, linkSemantics: 'DATED_EDITION_URL',
  };
}

function absentResult(publication, reason, latestObserved = null) {
  return { status: reason, candidate: null, latestObserved, scheduleState: publication.scheduleState, acquisitionState: publication.missingAcquisitionState };
}

async function findCurrentEdition(links, digestDate, fetchImpl, observedAt) {
  let latestObserved = null;
  for (const url of links.slice(0, 5)) {
    try {
      const response = await fetchImpl(url, { headers: { Accept: 'text/html' } });
      if (!response?.ok) continue;
      const html = await response.text();
      const candidate = parseIndianExpressDailyBriefing(html, url, digestDate, observedAt);
      if (!candidate) continue;
      if (!latestObserved) latestObserved = candidate;
      if (candidate.editionState === EDITION_STATES.CURRENT) {
        return {
          candidate,
          latestObserved,
          qualityEvidence: extractIndianExpressDigestQualityEvidence(html, url),
        };
      }
    } catch {}
  }
  return { candidate: null, latestObserved, qualityEvidence: null };
}

export async function discoverIndianExpressDailyBriefing({ digestDate, fetchImpl = fetch, now = new Date() }) {
  const publication = resolvePublicationState(INDIAN_EXPRESS_DAILY_BRIEFING, digestDate, now);
  if (publication.phase === 'NOT_SCHEDULED' || publication.phase === 'BEFORE_WINDOW' || publication.phase === 'FUTURE_DATE') {
    return absentResult(publication, publication.phase);
  }
  try {
    const index = await fetchImpl(INDIAN_EXPRESS_DAILY_BRIEFING.discoveryUrl, { headers: { Accept: 'text/html' } });
    if (!index?.ok) return absentResult(publication, 'DISCOVERY_NON_OK');
    const links = extractIndianExpressDailyBriefingLinks(await index.text());
    if (!links.length) return absentResult(publication, 'PRODUCT_LINK_MISSING');
    const found = await findCurrentEdition(links, digestDate, fetchImpl, now.toISOString());
    if (!found.candidate) return absentResult(publication, 'CURRENT_EDITION_NOT_FOUND', found.latestObserved);
    found.candidate.scheduleState = publication.scheduleState;
    return {
      status: 'FOUND',
      candidate: found.candidate,
      latestObserved: found.latestObserved,
      qualityEvidence: found.qualityEvidence,
      scheduleState: publication.scheduleState,
      acquisitionState: ACQUISITION_STATES.OK,
    };
  } catch {
    return absentResult(publication, 'FETCH_ERROR');
  }
}
