const XML_ENTITIES = Object.freeze({
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
});

function decodeEntity(match, name) {
  try {
    if (name.startsWith('#x')) return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
    if (name.startsWith('#')) return String.fromCodePoint(Number.parseInt(name.slice(1), 10));
    return XML_ENTITIES[name] ?? match;
  } catch {
    return match;
  }
}

export function decodeXmlText(value) {
  return String(value || '')
    .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1')
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, decodeEntity)
    .trim();
}

function tagValue(block, tag) {
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = block.match(pattern);
  return match ? decodeXmlText(match[1]) : '';
}

export function parseRssItems(xml) {
  return [...String(xml || '').matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)]
    .map(match => ({
      title: tagValue(match[1], 'title'),
      link: tagValue(match[1], 'link'),
      pubDate: tagValue(match[1], 'pubDate'),
      description: tagValue(match[1], 'description'),
    }))
    .filter(item => item.title && item.link);
}
