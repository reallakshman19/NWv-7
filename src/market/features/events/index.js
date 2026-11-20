/**
 * NWv7 Market Desk R2.1 - WP-07 Events Module Barrel
 * Canonical export for IPO, NFO & Market Events features.
 */

export { IpoEventsPanel } from './IpoEventsPanel.jsx';
export { EventsQuickWidget } from './EventsQuickWidget.jsx';
export { EventTimeline } from './EventTimeline.jsx';

export {
  REGISTERED_ISSUE_SOURCES,
  ADDITIONAL_OFFICIAL_LINKS,
  MARKET_CALENDAR_EVENTS,
  VERIFICATION_STATUSES,
  EVENT_CATEGORIES,
  calculateEventStatus,
  getKolkataTodayMidnight,
  getKolkataIsoDate,
  parseIsoDateToKolkata,
  validateAdditionalOfficialLink,
  IST_OFFSET_MS,
  DAY_MS
} from './ipoData.js';

export {
  parseIndiaDate,
  classifyNfoRecord,
  filterActiveNfos,
  filterHistoricalNfos,
  mergeNfoCustody,
  NFO_LIFECYCLE_STATES
} from './nfoEngine.js';

export {
  extractFinanceBriefing,
  isFinanceRelatedArticle,
  stripHtml,
  isValidArticleUrl,
  NWV7_MARKET_NEWS_SOURCE_ID,
  FINANCE_KEYWORDS
} from './newsReuseClient.js';

export {
  eventsStore,
  useEventsStore
} from './eventsStore.js';
