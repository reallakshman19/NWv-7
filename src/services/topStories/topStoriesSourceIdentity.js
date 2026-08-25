export const TOP_STORIES_SOURCE_IDENTITY_VERSION =
  'nw-top-stories-source-identity-v1';

function textValue(value) {
  return String(value || '').trim().toLowerCase();
}

function sourceToken(value) {
  const raw = textValue(value);
  if (!raw) return '';
  let candidate = raw;
  try {
    const parsed = new URL(raw);
    candidate = parsed.hostname.replace(/^www\./, '');
  } catch {
    // Display labels and source-group identifiers are the normal path.
  }
  return candidate
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
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
  ['toi', 'times_of_india'],
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
  if (groupFamily === 'google_news' && isUsefulFamily(sourceFamily) && sourceFamily !== 'google_news') {
    return sourceFamily;
  }
  if (isUsefulFamily(groupFamily)) return groupFamily;
  if (isUsefulFamily(sourceFamily)) return sourceFamily;
  return groupFamily || sourceFamily || 'unknown';
}

function removeAggregatorWrapperWhenPublisherKnown(families, primary) {
  if (primary && primary !== 'google_news') families.delete('google_news');
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
  removeAggregatorWrapperWhenPublisherKnown(families, primary);
  return [...families];
}

export function isAggregatorSourceFamily(value) {
  return getSourceFamily(value) === 'google_news';
}

export const __topStoriesSourceIdentityInternalsForTest = {
  sourceToken,
  removeAggregatorWrapperWhenPublisherKnown,
};
