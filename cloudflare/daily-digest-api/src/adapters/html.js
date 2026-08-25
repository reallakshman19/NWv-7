const ENTITY_MAP = Object.freeze({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' });

function decodeEntity(_match, named, decimal, hex) {
  if (named) return ENTITY_MAP[named.toLowerCase()] || `&${named};`;
  const code = decimal ? Number(decimal) : Number.parseInt(hex, 16);
  return Number.isFinite(code) ? String.fromCodePoint(code) : '';
}

export function decodeHtml(value) {
  return String(value || '').replace(/&(?:(amp|quot|apos|lt|gt)|#(\d+)|#x([0-9a-f]+));/gi, decodeEntity);
}

export function htmlToText(html) {
  return decodeHtml(String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractAnchors(html, baseUrl) {
  const anchors = [];
  const pattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of String(html || '').matchAll(pattern)) {
    try {
      anchors.push({ url: new URL(decodeHtml(match[1]), baseUrl).toString(), text: htmlToText(match[2]) });
    } catch { /* Ignore malformed publisher links. */ }
  }
  return anchors;
}

export function canonicalizePublisherUrl(value, expectedHost, { stripLite = false } = {}) {
  const url = new URL(value);
  if (url.hostname.replace(/^www\./, '') !== expectedHost.replace(/^www\./, '')) throw new Error('unexpected_publisher_host');
  url.hash = '';
  url.search = '';
  if (stripLite) url.pathname = url.pathname.replace(/\/lite\/?$/, '/');
  return url.toString();
}

function flattenJsonLd(value, output) {
  if (Array.isArray(value)) return value.forEach(item => flattenJsonLd(item, output));
  if (!value || typeof value !== 'object') return;
  output.push(value);
  if (Array.isArray(value['@graph'])) value['@graph'].forEach(item => flattenJsonLd(item, output));
}

export function extractJsonLdObjects(html) {
  const output = [];
  const pattern = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of String(html || '').matchAll(pattern)) {
    try { flattenJsonLd(JSON.parse(match[1].trim()), output); } catch { /* Ignore malformed JSON-LD. */ }
  }
  return output;
}
