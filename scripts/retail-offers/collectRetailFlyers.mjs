import { createHash } from 'node:crypto';
import { JSDOM, VirtualConsole } from 'jsdom';
import { retailFlyerUrl, retailFlyerKey, validateRetailFlyer, isMuscatFlyerScope } from '../../src/utils/retailOfferContract.js';

const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const FULL_MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];
export function flyerDateKey(value) {
  const match = clean(value).match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$|^([a-z]+)\s+(\d{1,2}),?\s+(\d{4})$/i);
  if (!match) return null;
  const token = (match[2] || match[4]).toLowerCase();
  const day = Number(match[1] || match[5]); const month = MONTHS.includes(token) ? MONTHS.indexOf(token) : FULL_MONTHS.indexOf(token);
  const year = Number(match[3] || match[6]);
  const date = new Date(Date.UTC(year, month, day));
  if (month < 0 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
const midnight = key => Date.parse(`${key}T00:00:00+04:00`);
function sourceText(node) {
  const walker = node.ownerDocument.createTreeWalker(node, 4); const parts = []; let text;
  while ((text = walker.nextNode())) parts.push(text.textContent);
  return clean(parts.join(' '));
}
function documentFor(html, url) {
  const dom = new JSDOM(html, { url, virtualConsole: new VirtualConsole() });
  for (const node of dom.window.document.querySelectorAll('script,style,ins')) node.remove();
  return dom;
}

export function discoverRetailFlyers(html, source, now, limit = 4) {
  const dom = documentFor(html, source.flyerListing.url);
  try {
    const d = dom.window.document;
    if (!/Muscat/i.test(d.querySelector('h1')?.textContent || '')) throw Error('UNRECOGNISED_FLYER_LISTING');
    const found = new Map();
    for (const a of d.querySelectorAll('a[href]')) {
      const link = retailFlyerUrl(a.href, source);
      if (!link) continue;
      const title = a.querySelector('img')?.alt || a.textContent;
      const date = clean(title).match(/\|\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/);
      const end = flyerDateKey(date?.[1]);
      if (!end || midnight(end) + 86400000 <= now) continue;
      // Several issues can contain the same campaign; fetch its richest first listing once.
      if (!found.has(link.campaign)) found.set(link.campaign, link.url);
      if (found.size >= limit) break;
    }
    return [...found.values()];
  } finally { dom.window.close(); }
}

export function parseRetailFlyer(html, url, source, checkedAt) {
  const link = retailFlyerUrl(url, source);
  if (!link) return null;
  const dom = documentFor(html, link.url);
  try {
    const d = dom.window.document;
    const headline = d.querySelector('main h1');
    const article = headline?.closest('article');
    const details = article?.nextElementSibling;
    if (!article || details?.tagName !== 'SECTION') return null;
    const text = sourceText(details);
    const title = clean(headline?.textContent);
    const publishedNode = [...article.querySelectorAll('p')].find(node => /^Published\s*•/.test(clean(node.textContent)));
    const published = clean(publishedNode?.textContent).match(/^Published\s*•\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})$/);
    const expiryNode = [...details.querySelectorAll('div,p')].find(node => !node.children.length && /^Valid until\s/.test(clean(node.textContent)));
    const end = clean(expiryNode?.textContent).match(/^Valid until\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})$/);
    const publishedKey = flyerDateKey(published?.[1]); const endDateKey = flyerDateKey(end?.[1]);
    if (!publishedKey || !endDateKey || !/\bIn-store offer\b/i.test(text)) return null;
    const label = [...details.querySelectorAll('p')].find(node => clean(node.textContent) === 'Available Stores');
    const storeScope = clean(label?.nextElementSibling?.textContent);
    // A city-specific listing plus an explicit nationwide or named Muscat scope is required.
    if (!isMuscatFlyerScope(storeScope)) return null;
    const pages = [...d.querySelectorAll('img[src]')].map(img => img.src)
      .filter(value => value.includes(`/uploads/flyers/${link.listingId}/`) && !/_thumb\./.test(value));
    const description = clean(headline?.parentElement.querySelector('p')?.textContent).slice(0, 500);
    const validUntil = midnight(endDateKey) + 86400000;
    const row = { id: 'flyer-' + createHash('sha256').update(`${source.id}|${link.campaign}|${validUntil}`).digest('hex').slice(0, 20),
      kind: 'flyer', retailerId: source.id, city: source.flyerListing.city, channel: 'offline', title, description,
      url: link.url, pages, storeScope, checkedAt, publishedDateKey: publishedKey, endDateKey, validUntil,
      expiresAt: Math.min(checkedAt + 86400000, validUntil), sourceKind: 'flyer_listing', sourceName: 'ClicOffer' };
    return validateRetailFlyer(row, source, checkedAt);
  } finally { dom.window.close(); }
}

export function mergeRetailFlyers(previous = [], incoming = [], now, policy) {
  const rows = new Map();
  for (const raw of [...previous, ...incoming]) {
    const source = policy.sources.find(value => value.id === raw?.retailerId);
    const row = validateRetailFlyer(raw, source, now, policy.freshHours);
    if (!row) continue;
    const key = retailFlyerKey(row, source); const old = rows.get(key);
    if (!old || row.checkedAt >= old.checkedAt) rows.set(key, row);
  }
  const counts = new Map();
  return [...rows.values()].sort((a, b) => b.checkedAt - a.checkedAt || a.id.localeCompare(b.id)).filter(row => {
    const count = counts.get(row.retailerId) || 0;
    if (count >= policy.maxFlyersPerRetailer) return false;
    counts.set(row.retailerId, count + 1); return true;
  }).slice(0, 16);
}

export async function collectRetailFlyers(policy, readPage, now = Date.now) {
  const pages = new Map(); const flyers = []; const health = {};
  const read = url => { if (!pages.has(url)) pages.set(url, Promise.resolve().then(() => readPage(url))); return pages.get(url); };
  for (const source of policy.sources.filter(value => value.flyerListing)) {
    const checkedAt = now();
    try {
      const links = discoverRetailFlyers(await read(source.flyerListing.url), source, checkedAt, policy.maxFlyersPerRetailer);
      let failures = 0; const rows = [];
      for (const url of links) {
        try { const row = parseRetailFlyer(await read(url), url, source, now()); if (row) rows.push(row); else failures++; }
        catch { failures++; }
      }
      flyers.push(...rows);
      health[source.id] = { status: failures ? 'partial' : rows.length ? 'ok' : 'empty', checkedAt,
        offers: rows.length, sourceName: 'ClicOffer', url: source.flyerListing.url,
        limitedListing: Boolean(source.flyerListing.limitedListing), ...(failures ? { error: 'FLYER_DETAIL_UNAVAILABLE' } : {}) };
    } catch { health[source.id] = { status: 'unavailable', checkedAt, offers: 0, sourceName: 'ClicOffer', url: source.flyerListing.url, error: 'FLYER_LISTING_UNAVAILABLE' }; }
  }
  return { flyers, health, requests: pages.size };
}
