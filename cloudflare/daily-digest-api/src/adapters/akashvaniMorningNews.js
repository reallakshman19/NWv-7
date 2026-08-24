import { ACCESSIBILITY_STATES, ACQUISITION_STATES, EDITION_STATES, QUALIFICATION_STATES, buildCanonicalId } from '../contracts.js';
import { resolvePublicationState } from '../publicationCalendar.js';
import { extractAkashvaniDigestQualityEvidence } from './digestQualityEvidence.js';
import { htmlToText } from './html.js';

export const AKASHVANI_MORNING_NEWS = Object.freeze({
  publisherFamily: 'AKASHVANI', product: 'MORNING_NEWS', edition: 'ENGLISH_NATIONAL',
  role: 'INDIA_GENERAL', discoveryUrl: 'https://newsonair.gov.in/bulletins-detail-category/morning-news/',
  canonicalUrl: 'https://newsonair.gov.in/bulletins-detail-category/morning-news/',
  publisherTimezone: 'Asia/Kolkata', publicationDays: Object.freeze(['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']),
  expectedPublicationStart: '08:15', expectedPublicationEnd: '08:45', publicationGraceMinutes: 30,
});

const MONTHS = Object.freeze({ January: 1, February: 2, March: 3, April: 4, May: 5, June: 6, July: 7, August: 8, September: 9, October: 10, November: 11, December: 12 });

function indiaTimestamp(monthName, day, year, time, meridiem) {
  const [hourText, minuteText] = time.split(':');
  let hour = Number(hourText) % 12;
  if (meridiem.toUpperCase() === 'PM') hour += 12;
  const month = String(MONTHS[monthName]).padStart(2, '0');
  return `${year}-${month}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${minuteText}:00+05:30`;
}

export function parseAkashvaniMorningNews(html, requestedDigestDate, observedAt) {
  const text = htmlToText(html);
  if (!/\bMorning News\b/i.test(text)) return null;
  const datePattern = '(January|February|March|April|May|June|July|August|September|October|November|December)\\s+(\\d{1,2}),\\s+(\\d{4})\\s+(\\d{1,2}:\\d{2})\\s*(AM|PM)';
  const match = text.match(new RegExp(`${datePattern}\\s+Morning News\\b`, 'i'))
    || text.match(new RegExp(`Morning News.{0,120}?${datePattern}`, 'i'));
  if (!match) return null;
  const publisherPublishedAt = indiaTimestamp(match[1], Number(match[2]), match[3], match[4], match[5]);
  const digestDate = publisherPublishedAt.slice(0, 10);
  return {
    canonicalId: buildCanonicalId({ ...AKASHVANI_MORNING_NEWS, digestDate }),
    digestDate, requestedDigestDate, title: 'Morning News',
    canonicalUrl: AKASHVANI_MORNING_NEWS.canonicalUrl, discoveryUrl: AKASHVANI_MORNING_NEWS.discoveryUrl,
    publisherFamily: 'AKASHVANI', product: 'MORNING_NEWS', edition: 'ENGLISH_NATIONAL', role: 'INDIA_GENERAL',
    qualificationState: QUALIFICATION_STATES.QUALIFIED, acquisitionState: ACQUISITION_STATES.OK,
    editionState: digestDate === requestedDigestDate ? EDITION_STATES.CURRENT : EDITION_STATES.STALE,
    accessibilityState: ACCESSIBILITY_STATES.UNKNOWN, provenanceClass: 'PUBLIC_BROADCAST',
    publisherPublishedAt, observedAt, linkSemantics: 'ROLLING_PRODUCT_URL',
  };
}

function absentResult(publication, reason) {
  return { status: reason, candidate: null, scheduleState: publication.scheduleState, acquisitionState: publication.missingAcquisitionState };
}

export async function discoverAkashvaniMorningNews({ digestDate, fetchImpl = fetch, now = new Date() }) {
  const publication = resolvePublicationState(AKASHVANI_MORNING_NEWS, digestDate, now);
  if (publication.phase === 'NOT_SCHEDULED' || publication.phase === 'BEFORE_WINDOW' || publication.phase === 'FUTURE_DATE') {
    return absentResult(publication, publication.phase);
  }
  try {
    const response = await fetchImpl(AKASHVANI_MORNING_NEWS.discoveryUrl, { headers: { Accept: 'text/html' } });
    if (!response?.ok) return absentResult(publication, 'FETCH_NON_OK');
    const html = await response.text();
    const candidate = parseAkashvaniMorningNews(html, digestDate, now.toISOString());
    if (!candidate) return absentResult(publication, 'PRODUCT_CONTRACT_MISSING');
    candidate.scheduleState = publication.scheduleState;
    return {
      status: candidate.editionState === EDITION_STATES.CURRENT ? 'FOUND' : 'STALE',
      candidate,
      qualityEvidence: extractAkashvaniDigestQualityEvidence(html),
      scheduleState: publication.scheduleState,
      acquisitionState: candidate.acquisitionState,
    };
  } catch {
    return absentResult(publication, 'FETCH_ERROR');
  }
}
