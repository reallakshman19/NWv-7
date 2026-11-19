import { sanitizeHtmlText } from './htmlText.js';

function publicationTimestamp(value) {
  if (value == null || value === '') return null;
  let timestamp;
  if (value instanceof Date) timestamp = value.getTime();
  else if (typeof value === 'number' || typeof value === 'string' && /^\d{9,13}$/.test(value.trim())) {
    const number = Number(value);
    timestamp = number < 10000000000 ? number * 1000 : number;
  } else if (typeof value === 'string' && /\d{1,2}:\d{2}/.test(value)
    && /(?:Z|GMT|UTC|[+-]\d{2}:?\d{2})\s*$/i.test(value)) timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > 0 && Number.isFinite(new Date(timestamp).getTime()) ? timestamp : null;
}

export function digestPublishedAt(card) {
  for (const field of ['publishedAt', 'pubDate', 'published_at', 'datePublished', 'publishedDate', 'publicationDate']) {
    const timestamp = publicationTimestamp(card?.[field]);
    if (timestamp) return timestamp;
  }
  // Refresh, freeze and cache dates are not article publication times.
  return null;
}

const comparable = value => String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function digestSnippet(card) {
  const title = comparable(sanitizeHtmlText(card?.title || card?.headline));
  const publisher = comparable(card?.source || card?.publisher || card?.publisherFamily);
  for (const value of [card?.snippet, card?.summary, card?.description, card?.excerpt, card?.contentSnippet]) {
    if (typeof value !== 'string') continue;
    const plain = sanitizeHtmlText(value.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '').replace(/\.{3,}/g, '…'), { maxLength: 420 });
    const key = comparable(plain);
    if (!key || key === title || publisher && key === `${title} ${publisher}`) continue;
    return plain;
  }
  return '';
}
