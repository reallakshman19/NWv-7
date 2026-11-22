/**
 * Strict RSS 2.0 reader for Google News's city-specific RSS items.
 * Publication metadata is copied from the feed, never inferred from fetch time.
 */
function decodeXmlText(raw = '') {
  return String(raw)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_, code) => {
      const number = /^x/i.test(code) ? parseInt(code.slice(1), 16) : Number(code);
      try { return String.fromCodePoint(number); } catch { return ''; }
    })
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/gi, (_, entity) => ({
      amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    })[entity.toLowerCase()])
    .replace(/\s+/g, ' ')
    .trim();
}

function readTag(item, tag) {
  const regex = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  return decodeXmlText(regex.exec(item)?.[1] || '');
}

export function parseTravelRssItems(xml) {
  if (typeof xml !== 'string' || !/<rss\b/i.test(xml)) {
    throw new Error('Invalid RSS document (missing rss root)');
  }
  const result = [];
  const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];
    const title = readTag(item, 'title');
    const url = readTag(item, 'link');
    const date = readTag(item, 'pubDate');
    if (!title || !/^https?:\/\//i.test(url) || !date) continue;
    result.push({
      id: readTag(item, 'guid') || url,
      title,
      url,
      link: url,
      source: readTag(item, 'source') || 'Google News',
      publishedAt: date,
      // No synthetic city/country: the query or publisher isn't event geography.
    });
  }
  return result;
}

export const __travelRssParserForTest = { decodeXmlText, readTag };
