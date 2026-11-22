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

// Google News commonly appends " - Publisher Name" to the headline itself.
// Treat it as acquisition metadata, never evidence that an event took place
// in a city whose name happens to appear in the publisher's brand.
export function stripTravelPublisherSuffix(title, source) {
  const text = String(title || '').trim();
  const publisher = String(source || '').trim();
  const suffix = ' - ' + publisher;
  return publisher && text.toLocaleLowerCase().endsWith(suffix.toLocaleLowerCase())
    ? text.slice(0, -suffix.length).trim()
    : text;
}

function isEvergreenFlightListing(title, source) {
  return /flightradar24/i.test(source) &&
    /\bairport\s+(?:arrivals|departures)\b/i.test(title);
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
    const source = readTag(item, 'source');
    const title = stripTravelPublisherSuffix(readTag(item, 'title'), source);
    const url = readTag(item, 'link');
    const date = readTag(item, 'pubDate');
    // No publisher provenance, no article; reject continuously regenerated
    // utility listings that are not time-bound editorial news.
    if (!title || !source || !/^https?:\/\//i.test(url) || !date ||
        isEvergreenFlightListing(title, source)) continue;
    result.push({
      id: readTag(item, 'guid') || url,
      title,
      url,
      link: url,
      source,
      publishedAt: date,
      // No synthetic city/country: the query or publisher isn't event geography.
    });
  }
  return result;
}

export const __travelRssParserForTest = { decodeXmlText, readTag };
