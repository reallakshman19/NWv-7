export const ECONOMY_NEWS_ASSET = 'market_economy_news.json';
export const ECONOMY_NEWS_VERSION = 'market-economy-news-v1';
export const PIB_RELEASES_URL = 'https://www.pib.gov.in/AllRelease.aspx?lang=1&reg=20';
export const ECONOMY_NEWS_MAX_ITEMS = 20;
export const ECONOMY_NEWS_MAX_AGE_DAYS = 30;
export const ECONOMY_NEWS_MAX_BYTES = 32 * 1024;
const DAY_MS = 86400000;
const MINISTRIES = [
  'Ministry of Finance',
  'Ministry of Statistics and Programme Implementation'
];

function hasExactly(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function day(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : NaN;
}

function indiaDay(timestamp) {
  return day(new Date(timestamp + 330 * 60000).toISOString().slice(0, 10));
}

export function validateEconomyNews(payload, now = Date.now()) {
  if (!hasExactly(payload, ['schemaVersion', 'checkedAt', 'items']) ||
      payload.schemaVersion !== ECONOMY_NEWS_VERSION ||
      !Array.isArray(payload.items) || !payload.items.length ||
      payload.items.length > ECONOMY_NEWS_MAX_ITEMS) return ['INVALID_ECONOMY_NEWS_ENVELOPE'];

  const checkedAt = Date.parse(payload.checkedAt);
  if (!Number.isFinite(checkedAt) || checkedAt > now + 5 * 60000 ||
      new Date(checkedAt).toISOString() !== payload.checkedAt) return ['INVALID_ECONOMY_NEWS_CHECK_TIME'];

  const latestDay = indiaDay(checkedAt);
  const oldestDay = latestDay - ECONOMY_NEWS_MAX_AGE_DAYS * DAY_MS;
  const ids = new Set();
  for (const row of payload.items) {
    if (!hasExactly(row, ['id', 'headline', 'ministry', 'publishedOn', 'url']) ||
        typeof row.id !== 'string' || !/^\d{6,10}$/.test(row.id) || ids.has(row.id) ||
        typeof row.headline !== 'string' || row.headline.trim() !== row.headline ||
        !row.headline || row.headline.length > 500 || /[<>\p{Cc}]/u.test(row.headline) ||
        !MINISTRIES.includes(row.ministry) ||
        row.url !== 'https://www.pib.gov.in/PressReleaseDetail.aspx?PRID=' + row.id + '&lang=1&reg=20') {
      return ['INVALID_ECONOMY_NEWS_RELEASE'];
    }
    const published = day(row.publishedOn);
    if (!Number.isFinite(published) || published < oldestDay || published > latestDay) {
      return ['INVALID_ECONOMY_NEWS_RELEASE_DATE'];
    }
    ids.add(row.id);
  }
  return [];
}

export function recentEconomyNews(payload, now = Date.now()) {
  if (validateEconomyNews(payload, now).length) return [];
  const cutoff = indiaDay(now) - ECONOMY_NEWS_MAX_AGE_DAYS * DAY_MS;
  return payload.items.filter(row => day(row.publishedOn) >= cutoff);
}
