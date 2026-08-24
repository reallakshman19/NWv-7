function entry(values) {
  return Object.freeze(values);
}

function calendar(publicationDays, start, end, graceMinutes, qualification) {
  return {
    publisherTimezone: 'Asia/Kolkata',
    publicationDays: Object.freeze(publicationDays),
    expectedPublicationStart: start,
    expectedPublicationEnd: end,
    publicationGraceMinutes: graceMinutes,
    calendarQualification: qualification,
  };
}

export const DAILY_DIGEST_REGISTRY_VERSION = 'daily-digest-registry/v0.5';

export const DAILY_DIGEST_REGISTRY = Object.freeze([
  entry({
    publisherFamily: 'AKASHVANI', product: 'MORNING_NEWS', edition: 'ENGLISH_NATIONAL',
    role: 'INDIA_GENERAL', publisherClass: 'PUBLIC_BROADCASTER',
    qualificationState: 'QUALIFIED', precedence: 10,
    discoveryUrl: 'https://newsonair.gov.in/bulletins-detail-category/morning-news/',
    adapterKey: 'AKASHVANI_MORNING_NEWS',
    ...calendar(['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'], '08:15', '08:45', 30, 'QUALIFIED'),
  }),
  entry({
    publisherFamily: 'INDIAN_EXPRESS', product: 'DAILY_BRIEFING', edition: 'DEFAULT',
    role: 'INDIA_GENERAL', publisherClass: 'PRIVATE_PUBLISHER',
    qualificationState: 'QUALIFIED', precedence: 20,
    discoveryUrl: 'https://indianexpress.com/section/live-news/',
    adapterKey: 'INDIAN_EXPRESS_DAILY_BRIEFING',
    ...calendar(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'], '08:30', '10:15', 30, 'PILOT'),
  }),
  entry({
    publisherFamily: 'THE_HINDU', product: 'MORNING_DIGEST', edition: 'DEFAULT',
    role: 'INDIA_GENERAL', publisherClass: 'PRIVATE_PUBLISHER',
    qualificationState: 'QUALIFIED', precedence: 30,
    discoveryUrl: 'https://www.thehindu.com/news/national/feeder/default.rss',
    adapterKey: 'THE_HINDU_MORNING_DIGEST', acquisitionQualification: 'PILOT',
    ...calendar(['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'], '06:00', '09:15', 30, 'PILOT'),
  }),
  entry({
    publisherFamily: 'FINANCIAL_TIMES', product: 'FIRSTFT', edition: 'ASIA',
    role: 'GLOBAL_BUSINESS_AND_WORLD', publisherClass: 'PRIVATE_PUBLISHER',
    qualificationState: 'HOLD', holdReason: 'CURRENT_EDITION_DISCOVERY_NOT_QUALIFIED', precedence: 40,
    v1Eligibility: 'EXCLUDED', v1ExclusionReason: 'CURRENT_EDITION_DISCOVERY_AUTHORITY_NOT_PROVEN',
    productCatalogUrl: 'https://www.ft.com/newsletters',
    editionResolverKey: 'FINANCIAL_TIMES_FIRSTFT_ASIA', editionResolverQualification: 'QUALIFIED',
    acquisitionQualification: 'HOLD',
    ...calendar(['MON', 'TUE', 'WED', 'THU', 'FRI'], '01:30', '05:00', 30, 'PILOT'),
  }),
  entry({
    publisherFamily: 'MONEYCONTROL', product: 'MORNING_SCAN', edition: 'DEFAULT',
    role: 'INDIA_BROAD', qualificationState: 'HOLD', holdReason: 'RECURRENCE_NOT_ESTABLISHED', precedence: 50,
  }),
  entry({
    publisherFamily: 'MONEYCONTROL', product: 'ESSENTIAL_7', edition: 'DEFAULT',
    role: 'INDIA_BROAD', qualificationState: 'HOLD', holdReason: 'PRODUCT_QUALIFICATION_PENDING', precedence: 60,
  }),
  entry({
    publisherFamily: 'REUTERS', product: 'TRADING_DAY', edition: 'ASIA_MARKETS',
    role: 'GLOBAL_MARKETS', qualificationState: 'HOLD', holdReason: 'ROLE_MISMATCH', precedence: 70,
    v1Eligibility: 'EXCLUDED', v1ExclusionReason: 'G1_ROLE_MISMATCH',
  }),
  entry({
    publisherFamily: 'GUARDIAN', product: 'FIRST_EDITION', edition: 'UK',
    role: 'GLOBAL_GENERAL_UK', qualificationState: 'HOLD', holdReason: 'PUBLICATION_WINDOW', precedence: 80,
    v1Eligibility: 'EXCLUDED', v1ExclusionReason: 'G1_ROLE_AND_1015_IST_TIMING_MISMATCH',
  }),
  entry({
    publisherFamily: 'ASSOCIATED_PRESS', product: 'MORNING_WIRE', edition: 'DEFAULT',
    role: 'GLOBAL_GENERAL', publisherClass: 'NEWS_AGENCY', precedence: 90,
    qualificationState: 'HOLD', holdReason: 'PUBLIC_EDITION_DISCOVERY_NOT_QUALIFIED',
    productQualification: 'QUALIFIED', acquisitionQualification: 'HOLD',
    v1Eligibility: 'EXCLUDED', v1ExclusionReason: 'G1_ROLE_AND_PUBLIC_EDITION_DISCOVERY_NOT_QUALIFIED',
  }),
  entry({
    publisherFamily: 'BBC', product: 'NEWS_BRIEFING', edition: 'INTERNATIONAL',
    role: 'GLOBAL_GENERAL', publisherClass: 'PUBLIC_BROADCASTER', precedence: 100,
    qualificationState: 'HOLD', holdReason: 'PUBLIC_EDITION_DISCOVERY_NOT_QUALIFIED',
    productQualification: 'QUALIFIED', acquisitionQualification: 'HOLD',
    v1Eligibility: 'EXCLUDED', v1ExclusionReason: 'G1_ROLE_AND_PUBLIC_EDITION_DISCOVERY_NOT_QUALIFIED',
  }),
]);

export function findRegistryEntry(publisherFamily, product, edition) {
  return DAILY_DIGEST_REGISTRY.find(item => (
    item.publisherFamily === publisherFamily
    && item.product === product
    && item.edition === edition
  )) || null;
}
