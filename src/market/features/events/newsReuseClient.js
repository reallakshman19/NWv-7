/**
 * NWv7 Market Desk R2.1 - WP-07 Finance News Briefing Client
 * Reuses qualified editorial business news from sectionsDataset envelope
 * without initiating independent network requests (zero-boot silence),
 * preserving authentic publication timestamps and publisher provenance.
 */

import { createSourceReceipt, isSourceClock } from '../../contracts/sourceReceipt.js';

export const NWV7_MARKET_NEWS_SOURCE_ID = 'nwv7-market-news';

export const FINANCE_KEYWORDS = Object.freeze([
  'market', 'equity', 'rbi', 'ipo', 'nfo', 'shares', 'rupee', 'inflation',
  'sensex', 'nifty', 'banking', 'gdp', 'economy', 'budget', 'earnings',
  'sebi', 'investment', 'investors', 'stock', 'stocks', 'forex', 'fund', 'funds'
]);

/**
 * Deterministically checks whether an article is related to finance or markets.
 * @param {object} item 
 * @returns {boolean}
 */
export function isFinanceRelatedArticle(item) {
  if (!item || typeof item !== 'object') return false;
  const text = `${item.title || ''} ${item.description || ''} ${item.summary || ''}`.toLowerCase();
  return FINANCE_KEYWORDS.some(kw => {
    const regex = new RegExp(`\\b${kw}\\b`, 'i');
    return regex.test(text);
  });
}

/**
 * Strips any potential HTML tags from headline or summary to ensure pure text rendering.
 * @param {string} input 
 * @returns {string}
 */
export function stripHtml(input) {
  if (!input) return '';
  return String(input).replace(/<[^>]*>/g, '').trim();
}

/**
 * Validates external article link protocol.
 * @param {string} url 
 * @returns {boolean}
 */
export function isValidArticleUrl(url) {
  if (typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

/**
 * Adapts news items from sectionsDataset envelope without invoking network loaders.
 *
 * @param {object} sectionsEnvelope An existing dataset envelope from sectionsDataset
 * @param {number} now
 * @returns {{ stories: Array<object>, receipt: object|null }}
 */
export function extractFinanceBriefing(sectionsEnvelope, now = Date.now()) {
  if (!sectionsEnvelope || typeof sectionsEnvelope !== 'object') {
    return { stories: [], receipt: null };
  }

  // Access business section from envelope data
  const businessItems = sectionsEnvelope.data?.sections?.business ||
                        sectionsEnvelope.data?.items ||
                        [];

  if (!Array.isArray(businessItems)) {
    return { stories: [], receipt: null };
  }

  const stories = [];

  for (const raw of businessItems) {
    if (!raw || typeof raw !== 'object') continue;

    const title = stripHtml(raw.title);
    if (!title) continue;

    // Filter for finance relevance
    if (!isFinanceRelatedArticle(raw)) continue;

    const url = raw.link || raw.url;
    if (!isValidArticleUrl(url)) continue;

    // Extract authentic timestamp
    let publishedIso = null;
    const rawTime = raw.pubDate || raw.publishedAt || raw.isoDate || raw.timestamp;

    if (rawTime) {
      const parsedTime = Date.parse(rawTime);
      if (Number.isFinite(parsedTime)) {
        publishedIso = new Date(parsedTime).toISOString();
      }
    }

    stories.push({
      id: raw.id || raw.guid || url,
      title,
      publisher: stripHtml(raw.source || raw.publisher || raw.sourceTitle || 'News Wire'),
      url,
      publishedAt: publishedIso,
      summary: stripHtml(raw.summary || raw.description || ''),
      isFinanceTopic: true
    });
  }

  // Build immutable source receipt under WP-00 contract
  const latestStoryWithTime = stories.find(s => s.publishedAt && isSourceClock(s.publishedAt, 'instant'));
  const providerAsOf = latestStoryWithTime ? latestStoryWithTime.publishedAt : null;

  // Under WP-00, READY strictly requires a valid provider clock; otherwise UNVERIFIED
  const receiptState = providerAsOf ? 'READY' : 'UNVERIFIED';
  const checkedAtIso = new Date(now).toISOString();

  const receiptResult = createSourceReceipt({
    sourceId: NWV7_MARKET_NEWS_SOURCE_ID,
    publisher: 'NWv7 editorial',
    accessMode: 'USER_LOCAL',
    rights: 'LOCAL_ONLY',
    state: receiptState,
    validity: 'VALID',
    providerClockGranularity: 'instant',
    providerAsOf,
    requestedAt: checkedAtIso,
    checkedAt: checkedAtIso,
    originalUrl: 'https://reallakshman19.github.io/NWv-7/',
    transportStatus: 200,
    dataVersion: 'sections-v1'
  });

  return {
    stories: stories.slice(0, 15),
    receipt: receiptResult.ok ? receiptResult.receipt : null
  };
}
