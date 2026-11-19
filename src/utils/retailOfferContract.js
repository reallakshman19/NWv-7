export function retailHttpsUrl(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url : null;
  } catch { return null; }
}

export function isRetailerUrl(value, source) {
  const url = retailHttpsUrl(value);
  return Boolean(url && source.domains.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`)));
}

export function retailProductKey(row) {
  const url = retailHttpsUrl(row.url);
  if (!url) return null;
  let product = url.origin + url.pathname;
  if (row.retailerId === 'amazon-in') {
    const asin = url.pathname.match(/\/(?:dp|gp\/product)\/([a-z0-9]{10})(?:\/|$)/i)?.[1];
    if (asin) product = `asin:${asin.toUpperCase()}`;
  } else if (row.retailerId === 'flipkart-in') {
    const item = url.pathname.match(/\/p\/(itm[a-z0-9]+)/i)?.[1];
    if (item) product = `item:${item}`;
  } else if (row.retailerId === 'lulu-oman') {
    const item = url.pathname.match(/\/p\/(\d+)(?:\/|$)/)?.[1];
    if (item) product = `item:${item}`;
  }
  // Seller variants remain distinct; tracking parameters never create offers.
  const variants = ['pid', 'sku', 'variant'].filter(key => url.searchParams.has(key))
    .map(key => `${key}=${url.searchParams.get(key)}`).join('&');
  return [row.retailerId, product, variants, row.channel].join('|');
}

// Flyer listing URLs are evidence from the named publisher, not merchant price URLs.
export function retailFlyerUrl(value, source) {
  const url = retailHttpsUrl(value);
  if (!source?.flyerListing || !url || !['clicoffer.com', 'www.clicoffer.com'].includes(url.hostname)) return null;
  const match = url.pathname.match(/^\/en\/oman\/muscat\/offers\/(\d+)\/([^/]+)\/([a-z0-9-]+)\/?$/);
  if (!match || match[2] !== source.flyerListing.merchant) return null;
  url.hostname = 'www.clicoffer.com';
  url.search = ''; url.hash = '';
  return { url: url.href.replace(/\/$/, ''), listingId: match[1], campaign: match[3] };
}

export function retailFlyerKey(row, source) {
  const link = retailFlyerUrl(row?.url, source);
  return link ? `${source.id}|${link.campaign}|${row.validUntil}` : null;
}

function muscatDateBoundary(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [year, month, day] = key.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return null;
  return utc.getTime() - 4 * 3600000;
}

export function isMuscatFlyerScope(value) {
  return /^(?:Oman|All (?:stores|branches) (?:in|across) Oman)$/i.test(value)
    || /\b(?:Muscat|Seeb|Qurum|Amerat|Mawaleh|Mabela|Mabell?a|Al Khoudh?)\b/i.test(value);
}

export function validateRetailFlyer(row, source, now, freshHours = 24) {
  const link = retailFlyerUrl(row?.url, source);
  if (!link || row?.retailerId !== source.id || !source.channels.includes('offline')) return null;
  if (!/^flyer-[a-f0-9]{20}$/.test(row.id) || row.kind !== 'flyer' || row.channel !== 'offline') return null;
  if (row.sourceKind !== 'flyer_listing' || row.sourceName !== 'ClicOffer' || row.city !== source.flyerListing.city) return null;
  if (!Number.isFinite(row.checkedAt) || row.checkedAt <= 0 || row.checkedAt > now + 300000 || now - row.checkedAt > freshHours * 3600000) return null;
  if (!Number.isFinite(row.validUntil) || row.validUntil <= now || row.validUntil > row.checkedAt + 90 * 86400000) return null;
  if (!Number.isFinite(row.expiresAt) || row.expiresAt <= now || row.expiresAt > Math.min(row.validUntil, row.checkedAt + freshHours * 3600000)) return null;
  // The end date is inclusive in the source's Muscat calendar, not a UTC date guess.
  const endBoundary = muscatDateBoundary(row.endDateKey);
  if (endBoundary === null || endBoundary + 86400000 !== row.validUntil) return null;
  const publishedBoundary = muscatDateBoundary(row.publishedDateKey);
  if (publishedBoundary === null || publishedBoundary <= 0 || publishedBoundary > now + 300000 || publishedBoundary >= row.validUntil) return null;
  const title = String(row.title || '').replace(/\s+/g, ' ').trim();
  const description = String(row.description || '').replace(/\s+/g, ' ').trim();
  const storeScope = String(row.storeScope || '').replace(/\s+/g, ' ').trim();
  if (title.length < 8 || title.length > 240 || description.length > 500 || !isMuscatFlyerScope(storeScope) || storeScope.length > 400 || /\bonline[-\s]+only\b/i.test(title + ' ' + description)) return null;
  const pages = [...new Set((Array.isArray(row.pages) ? row.pages : []).filter(value => {
    const image = retailHttpsUrl(value);
    return image?.hostname === 'app.clicoffer.com' && image.pathname.startsWith(`/uploads/flyers/${link.listingId}/`) && /\.(?:webp|jpe?g|png)$/i.test(image.pathname);
  }))].slice(0, 24);
  if (!pages.length) return null;
  return { id: row.id, kind: 'flyer', retailerId: source.id, retailer: source.name, market: source.market,
    cities: [row.city], city: row.city, channel: 'offline', title, description, url: link.url, pages,
    storeScope, checkedAt: row.checkedAt, publishedDateKey: row.publishedDateKey, endDateKey: row.endDateKey,
    validUntil: row.validUntil, expiresAt: row.expiresAt, sourceKind: 'flyer_listing', sourceName: 'ClicOffer',
    storeScopeVerified: false };
}

export function retailSnapshotContent(snapshot) {
  return JSON.stringify(Array.isArray(snapshot.flyers) ? { items: snapshot.items, flyers: snapshot.flyers } : snapshot.items);
}

// Used at both publication and display. Observation age is never a sale end date.
export function validateRetailOffer(row, source, now, freshHours = 24) {
  if (!row || !source || row.retailerId !== source.id || !isRetailerUrl(row.url, source)) return null;
  if (!/^retail-[a-f0-9]{20}$/.test(row.id) || typeof row.title !== 'string') return null;
  const title = row.title.replace(/\s+/g, ' ').trim();
  if (title.length < 5 || title.length > 400 || row.currency !== source.currency) return null;
  if (!Number.isFinite(row.price) || row.price <= 0 || row.price > 10000000) return null;
  if (!Number.isFinite(row.checkedAt) || row.checkedAt <= 0 || row.checkedAt > now + 300000 || now - row.checkedAt > freshHours * 3600000) return null;
  if (!Number.isFinite(row.expiresAt) || row.expiresAt <= now || row.expiresAt > row.checkedAt + freshHours * 3600000) return null;
  const validUntil = row.validUntil ?? null;
  if (validUntil !== null && (!Number.isFinite(validUntil) || validUntil <= now || row.expiresAt > validUntil)) return null;
  if (!source.channels.includes(row.channel)) return null;
  if (row.channel === 'offline' && (row.storeScopeVerified !== true || !validUntil)) return null;
  if (row.availability && /outofstock|soldout|discontinued/i.test(row.availability)) return null;
  const previousPrice = row.previousPrice ?? null;
  const discountPercent = row.discountPercent ?? null;
  if (previousPrice !== null && (!Number.isFinite(previousPrice) || previousPrice <= row.price)) return null;
  if (discountPercent !== null && (!Number.isFinite(discountPercent) || discountPercent <= 0 || discountPercent >= 100)) return null;
  if (!previousPrice && !discountPercent) return null;
  if (previousPrice && discountPercent && Math.abs((1 - row.price / previousPrice) * 100 - discountPercent) > 2) return null;
  return {
    id: row.id, retailerId: source.id, retailer: source.name, market: source.market, cities: source.cities,
    channel: row.channel, title, url: new URL(row.url).href, price: row.price, currency: source.currency,
    previousPrice, discountPercent, imageUrl: retailHttpsUrl(row.imageUrl)?.href || null,
    checkedAt: row.checkedAt, expiresAt: row.expiresAt, validUntil,
    validUntilSource: validUntil ? (row.validUntilSource === 'retailer_countdown' ? 'retailer_countdown' : 'retailer') : null,
    sourceUrl: isRetailerUrl(row.sourceUrl, source) ? row.sourceUrl : source.url,
    sourceKind: 'retailer', sourceName: source.name, storeScopeVerified: row.storeScopeVerified === true,
    availability: typeof row.availability === 'string' ? row.availability.slice(0, 200) : 'Not verified for your delivery address',
  };
}
