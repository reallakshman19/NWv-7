function entry(values) {
  return Object.freeze(values);
}

export const DAILY_DIGEST_REGISTRY = Object.freeze([
  entry({
    publisherFamily: 'AKASHVANI', product: 'MORNING_NEWS', edition: 'ENGLISH_NATIONAL',
    role: 'INDIA_GENERAL', publisherClass: 'PUBLIC_BROADCASTER',
    qualificationState: 'QUALIFIED', precedence: 10,
    publisherTimezone: 'Asia/Kolkata', publicationDays: 'DAILY', expectedPublicationLocalTime: '08:15',
  }),
  entry({
    publisherFamily: 'INDIAN_EXPRESS', product: 'DAILY_BRIEFING', edition: 'DEFAULT',
    role: 'INDIA_GENERAL', publisherClass: 'PRIVATE_PUBLISHER',
    qualificationState: 'QUALIFIED', precedence: 20,
    publisherTimezone: 'Asia/Kolkata', publicationDays: 'DAILY', expectedPublicationWindow: '09:00-09:45',
  }),
  entry({
    publisherFamily: 'THE_HINDU', product: 'MORNING_DIGEST', edition: 'DEFAULT',
    role: 'INDIA_GENERAL', publisherClass: 'PRIVATE_PUBLISHER',
    qualificationState: 'HOLD', holdReason: 'ACQUISITION_ADAPTER_NOT_QUALIFIED', precedence: 30,
  }),
  entry({
    publisherFamily: 'FINANCIAL_TIMES', product: 'FIRSTFT', edition: 'ASIA',
    role: 'GLOBAL_BUSINESS_AND_WORLD', publisherClass: 'PRIVATE_PUBLISHER',
    qualificationState: 'HOLD', holdReason: 'EDITION_RESOLVER_NOT_QUALIFIED', precedence: 40,
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
  }),
  entry({
    publisherFamily: 'GUARDIAN', product: 'FIRST_EDITION', edition: 'UK',
    role: 'GLOBAL_GENERAL_UK', qualificationState: 'HOLD', holdReason: 'PUBLICATION_WINDOW', precedence: 80,
  }),
]);

export function findRegistryEntry(publisherFamily, product, edition) {
  return DAILY_DIGEST_REGISTRY.find(item => (
    item.publisherFamily === publisherFamily
    && item.product === product
    && item.edition === edition
  )) || null;
}
