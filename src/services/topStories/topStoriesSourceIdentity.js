import { canonicalNewsUrl } from '../newsStoryIdentity.js';

export const TOP_STORIES_SOURCE_IDENTITY_VERSION =
  'nw-top-stories-source-identity-v2';

function textValue(value) {
  return String(value || '').trim().toLowerCase();
}

function sourceToken(value) {
  const raw = textValue(value);
  if (!raw) return '';
  return raw
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// Source labels support legacy rows, but an origin must match a publisher's
// actual domain (or a DNS child of it) to receive that publisher's credit.
const PUBLISHER_DOMAINS = [
  ['economictimes.indiatimes.com', 'economic_times'],
  ['timesofindia.indiatimes.com', 'times_of_india'],
  ['timesofindia.com', 'times_of_india'],
  ['thehindubusinessline.com', 'business_line'],
  ['thehindu.com', 'the_hindu'],
  ['reuters.com', 'reuters'],
  ['apnews.com', 'associated_press'],
  ['bbc.com', 'bbc'],
  ['bbc.co.uk', 'bbc'],
  ['ndtv.com', 'ndtv'],
  ['moneycontrol.com', 'moneycontrol'],
  ['hindustantimes.com', 'hindustan_times'],
  ['timesofoman.com', 'times_of_oman'],
  ['muscatdaily.com', 'muscat_daily'],
  ['omanobserver.om', 'oman_observer'],
  ['thearabianstories.com', 'the_arabian_stories'],
  ['dw.com', 'dw'],
  ['arstechnica.com', 'ars_technica'],
  ['omannews.gov.om', 'oman_news_agency'],
  ['indiatoday.in', 'india_today'],
  ['onmanorama.com', 'onmanorama'],
  ['openthemagazine.com', 'open_magazine'],
  ['news.google.com', 'google_news'],
];
const DOMAIN_VERIFIED_FAMILIES = new Set(PUBLISHER_DOMAINS.map(([, family]) => family));

function publisherFamilyFromHost(hostname) {
  const host = textValue(hostname).replace(/\.$/, '');
  const matchingDomain = PUBLISHER_DOMAINS.find(([domain]) =>
    host === domain || host.endsWith('.' + domain));
  return matchingDomain?.[1] || '';
}

const EXACT_ALIASES = new Map([
  ['ap', 'associated_press'],
  ['ap_news', 'associated_press'],
  ['apnews', 'associated_press'],
  ['apnews_com', 'associated_press'],
  ['associated_press', 'associated_press'],
  ['businessline', 'business_line'],
  ['the_hindu_businessline', 'business_line'],
  ['thehindu', 'the_hindu'],
  ['thehindu_com', 'the_hindu'],
  ['hindustan', 'hindustan_times'],
  ['hindustan_times', 'hindustan_times'],
  ['hindustantimes', 'hindustan_times'],
  ['hindustantimes_com', 'hindustan_times'],
  ['economic_times', 'economic_times'],
  ['economictimes', 'economic_times'],
  ['economictimes_indiatimes_com', 'economic_times'],
  ['money_control', 'moneycontrol'],
  ['moneycontrol_com', 'moneycontrol'],
  ['moneycontrol', 'moneycontrol'],
  ['ona', 'oman_news_agency'],
  ['oman_news_agency', 'oman_news_agency'],
  ['toi', 'times_of_india'],
  ['the_times_of_india', 'times_of_india'],
  ['timesofindia', 'times_of_india'],
  ['timesofindia_indiatimes_com', 'times_of_india'],
  ['timesofoman', 'times_of_oman'],
  ['timesofoman_com', 'times_of_oman'],
  ['muscatdaily', 'muscat_daily'],
  ['muscatdaily_com', 'muscat_daily'],
  ['omanobserver', 'oman_observer'],
  ['omanobserver_om', 'oman_observer'],
]);

const FAMILY_PREFIXES = Object.freeze([
  ['google_news', 'google_news'],
  ['bbc', 'bbc'],
  ['reuters', 'reuters'],
  ['the_hindu', 'the_hindu'],
  ['times_of_india', 'times_of_india'],
  ['times_of_oman', 'times_of_oman'],
  ['muscat_daily', 'muscat_daily'],
  ['ndtv', 'ndtv'],
]);

export function getSourceFamily(value) {
  const raw = textValue(value);
  // A URL/domain is never a display label. Unknown hostnames cannot use the
  // alias-prefix rules reserved for labels such as BBC World.
  if (/^https?:\/\//.test(raw) || /^[a-z0-9-]+(?:\.[a-z0-9-]+)+\.?$/.test(raw)) {
    const address = canonicalNewsUrl(raw.includes('://') ? raw : 'https://' + raw);
    return address ? publisherFamilyFromHost(new URL(address).hostname) : '';
  }
  const token = sourceToken(value);
  if (!token) return '';
  if (EXACT_ALIASES.has(token)) return EXACT_ALIASES.get(token);
  const prefixMatch = FAMILY_PREFIXES.find(([prefix]) => (
    token === prefix || token.startsWith(`${prefix}_`)
  ));
  return prefixMatch?.[1] || token;
}

function isUsefulFamily(value) {
  return Boolean(value && !['unknown', 'source', 'publisher'].includes(value));
}

export function getStorySourceFamily(story = {}) {
  const groupFamily = getSourceFamily(story.sourceGroup);
  const sourceFamily = getSourceFamily(story.source);
  const rawUrl = story.url || story.link || story.canonicalUrl || story.canonical_url || '';
  if (rawUrl) {
    const address = canonicalNewsUrl(rawUrl);
    const actualFamily = address ? publisherFamilyFromHost(new URL(address).hostname) : '';
    if (actualFamily) return actualFamily;
    for (const family of [groupFamily, sourceFamily]) {
      if (isUsefulFamily(family) && !DOMAIN_VERIFIED_FAMILIES.has(family)) return family;
    }
    return 'unknown';
  }
  if (groupFamily === 'google_news' && isUsefulFamily(sourceFamily) && sourceFamily !== 'google_news') {
    return sourceFamily;
  }
  if (isUsefulFamily(groupFamily)) return groupFamily;
  if (isUsefulFamily(sourceFamily)) return sourceFamily;
  return groupFamily || sourceFamily || 'unknown';
}

function removeAggregatorWrapperWhenPublisherKnown(families) {
  const hasKnownPublisher = [...families].some(family => family !== 'google_news');
  if (hasKnownPublisher) families.delete('google_news');
  return families;
}

export function getStorySourceFamilies(story = {}) {
  const families = new Set(
    (Array.isArray(story.allSources) ? story.allSources : [])
      .map(getSourceFamily)
      .filter(isUsefulFamily),
  );
  const primary = getStorySourceFamily(story);
  if (isUsefulFamily(primary)) families.add(primary);
  removeAggregatorWrapperWhenPublisherKnown(families);
  return [...families];
}

export function isAggregatorSourceFamily(value) {
  return getSourceFamily(value) === 'google_news';
}

export const __topStoriesSourceIdentityInternalsForTest = {
  sourceToken,
  removeAggregatorWrapperWhenPublisherKnown,
};
