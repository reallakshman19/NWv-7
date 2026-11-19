import { loadSectionsSnapshot } from '../adapters/sectionsSnapshotFetcher.js';
import { isLocalAppPreview, readPublishedSnapshot } from '../utils/publishedSnapshotFetch.js';

export const NEWSPAPER_MAX_AGE_MS = 48 * 60 * 60 * 1000;
export const PAPER_SOURCES = Object.freeze({
  THE_HINDU: { id: 'THE_HINDU', label: 'The Hindu', lang: 'en', domain: 'thehindu.com', url: 'https://www.thehindu.com/' },
  INDIAN_EXPRESS: { id: 'INDIAN_EXPRESS', label: 'Indian Express', lang: 'en', domain: 'indianexpress.com', url: 'https://indianexpress.com/' },
  DINAMANI: { id: 'DINAMANI', label: 'Dinamani', lang: 'ta', domain: 'dinamani.com', url: 'https://www.dinamani.com/' },
  DAILY_THANTHI: { id: 'DAILY_THANTHI', label: 'Daily Thanthi', lang: 'ta', domain: 'dailythanthi.com', url: 'https://www.dailythanthi.com/' },
});

export function newspaperTimestamp(value) {
  if (value == null || value === '') return 0;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric < 1e11 ? numeric * 1000 : numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fresh(value, now) {
  const timestamp = newspaperTimestamp(value);
  return timestamp > 0 && timestamp <= now + 5 * 60 * 1000 && now - timestamp <= NEWSPAPER_MAX_AGE_MS;
}

function host(url) {
  try { const parsed = new URL(url); return /^https?:$/.test(parsed.protocol) ? parsed.hostname.toLowerCase().replace(/^www\./, '') : ''; } catch { return ''; }
}

export function isPublisherArticle(article, sourceId) {
  const source = PAPER_SOURCES[sourceId];
  if (!source) return false;
  const articleHost = host(article?.link || article?.url);
  if (articleHost === source.domain || articleHost.endsWith(`.${source.domain}`)) return true;
  // Google discovery links retain the publisher's source URL. A newspaper
  // selector must never re-label another publisher's or an unverified story.
  if (articleHost !== 'news.google.com') return false;
  const publisher = host(article.publisherUrl || article.sourceUrl);
  return publisher === source.domain || publisher.endsWith(`.${source.domain}`);
}

export function normalizeNewspaperEdition(payload, now = Date.now()) {
  const lastUpdated = newspaperTimestamp(payload?.lastUpdated || payload?.fetchedAt);
  if (!fresh(lastUpdated, now)) throw new Error('Newspaper edition is older than 48 hours or has no valid publication time.');
  const sources = {};
  const sourceStatus = {};
  for (const [sourceId, meta] of Object.entries(PAPER_SOURCES)) {
    const seenLinks = new Set();
    const seenTitles = new Set();
    sources[sourceId] = (Array.isArray(payload.sources?.[sourceId]) ? payload.sources[sourceId] : []).flatMap(section => {
      const articles = [];
      for (const article of (Array.isArray(section.articles) ? section.articles : [])) {
        if (articles.length >= 10) break;
        const link = article?.link || article?.url;
        const title = String(article?.title || '').trim();
        const key = title.toLowerCase().replace(/\s+/g, ' ');
        const confidence = String(article?.timestampConfidence || '').toLowerCase();
        const timestampSource = String(article?.publishedAtSource || article?.timestampSource || '').toLowerCase();
        if (!title || !link || confidence === 'low'
          || ['fetch_time_fallback', 'missing', 'invalid', 'unknown'].includes(timestampSource)
          || !fresh(article.publishedAt || article.pubDate || article.date, now)
          || !isPublisherArticle(article, sourceId) || seenLinks.has(link) || seenTitles.has(key)) continue;
        seenLinks.add(link);
        seenTitles.add(key);
        articles.push({ ...article, link, publishedAt: newspaperTimestamp(article.publishedAt || article.pubDate || article.date), source: meta.label });
      }
      if (!articles.length) return [];
      return [{ page: section.page || 'Latest headlines', articles,
        summary: articles.map(article => `• ${article.title}`).join('\n'), summary_method: 'headlines' }];
    });
    const count = sources[sourceId].reduce((total, section) => total + section.articles.length, 0);
    sourceStatus[sourceId] = { count, status: count ? 'current' : 'unavailable',
      detail: count ? 'Publisher headlines from the last 48 hours.' : 'No verified current headlines available. Open the publisher or retry.',
      acquisition: payload.sourceStatus?.[sourceId] || null };
  }
  if (!Object.values(sourceStatus).some(status => status.count)) throw new Error('No verified newspaper headlines from the last 48 hours.');
  return { sources, lastUpdated, sourceStatus, provenance: payload.provenance || 'publisher-rss' };
}

export function newspaperPublicationUrls() {
  const deployed = `${import.meta.env.BASE_URL || './'}data/epaper_data.json`;
  const location = globalThis.window?.location;
  return location?.origin === 'https://reallakshman19.github.io'
    && (location.pathname === '/NWv-7' || location.pathname.startsWith('/NWv-7/'))
    ? ['https://raw.githubusercontent.com/reallakshman19/NWv-7/main/public/data/epaper_data.json', deployed]
    : isLocalAppPreview()
      ? [deployed, 'https://raw.githubusercontent.com/reallakshman19/NWv-7/main/public/data/epaper_data.json']
      : [deployed];
}

export async function fetchCurrentNewspaperPublication({ fetchImpl = fetch, now = Date.now() } = {}) {
  let lastError;
  for (const url of newspaperPublicationUrls()) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetchImpl(url, { cache: 'no-store', redirect: 'error', signal: controller.signal });
      const edition = normalizeNewspaperEdition(await readPublishedSnapshot(response), now);
      return { ...edition, publicationUrl: url };
    } catch (error) { lastError = error; } finally { clearTimeout(timer); }
  }
  throw lastError;
}

export function newspaperFromSections(snapshot, now = Date.now()) {
  const sources = Object.fromEntries(Object.keys(PAPER_SOURCES).map(id => [id, []]));
  for (const [page, items] of Object.entries(snapshot?.sections || {})) {
    if (!Array.isArray(items)) continue;
    for (const sourceId of Object.keys(sources)) {
      const articles = items.filter(item => isPublisherArticle(item, sourceId));
      if (articles.length) sources[sourceId].push({ page, articles });
    }
  }
  return normalizeNewspaperEdition({ sources, fetchedAt: snapshot?.fetchedAt,
    provenance: 'current-sections-publisher-headlines' }, now);
}

export async function fetchCurrentSectionsPaper() {
  return newspaperFromSections(await loadSectionsSnapshot());
}

export async function loadCurrentNewspaper() {
  try { return await fetchCurrentNewspaperPublication(); }
  catch { return fetchCurrentSectionsPaper(); }
}
