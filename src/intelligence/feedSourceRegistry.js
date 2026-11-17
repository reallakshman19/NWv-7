import { getFeedWeight } from './feedHealthMonitor.js';

const CURRENT_YEAR = new Date().getFullYear();
const discovery = (query, oman = false) => ({
  url: `https://news.google.com/rss/search?${new URLSearchParams({ q: `${query} when:7d`, hl: oman ? 'en-US' : 'en-IN', gl: oman ? 'US' : 'IN', ceid: oman ? 'US:en' : 'IN:en' })}`,
  sourceType: 'search', trust: 'medium',
});

const DEFAULT_FEED_SOURCE_REGISTRY = Object.freeze({
  alerts: {
    Chennai: [discovery('Chennai ("power cut" OR "power shutdown" OR "water supply" OR "road closure" OR advisory)')],
    Muscat: [discovery('(Muscat OR Seeb OR Ghubrah OR Mawaleh) ("road closure" OR "water supply" OR "power shutdown" OR advisory)', true)],
    Trichy: [discovery('Trichy ("power cut" OR "water supply" OR "road closure" OR advisory)')],
  },
  weather_alerts: {
    Chennai: [discovery('Chennai ("weather warning" OR "rain alert" OR cyclone OR "heavy rain")')],
    Muscat: [discovery('(Muscat OR Seeb) ("weather warning" OR "rain alert" OR thunderstorm OR flood)', true)],
    Trichy: [discovery('Trichy ("weather warning" OR "rain alert" OR cyclone OR "heavy rain")')],
  },
  shopping: {
    online: [
      discovery('(Amazon India OR Flipkart) (sale OR discount OR offer) (India OR Indian)'),
      discovery('(Lulu OR Hypermax) Oman (online OR app OR delivery) (sale OR discount OR offer)', true),
    ],
    Chennai: [discovery('Chennai Lulu (sale OR discount OR offer)')],
    Muscat: [discovery('(Muscat OR Seeb OR Ghubrah OR Mawaleh OR "across Oman") (Lulu OR Hypermax OR "Sharaf DG" OR "eXtra Oman") (sale OR discount OR offer)', true)],
  },
  airlines: {
    global: [
      { url: `https://news.google.com/rss/search?q=IndiGo+OR+Air+India+OR+Oman+Air+OR+SalamAir+fare+sale+booking+${CURRENT_YEAR}&hl=en-IN&gl=IN&ceid=IN:en`, sourceType: 'search', trust: 'high' }
    ]
  },
  events: {
    Chennai: [
      { url: 'https://news.google.com/rss/search?q=Chennai+upcoming+events+concert+exhibition+workshop+this+week&hl=en-IN&gl=IN&ceid=IN:en', sourceType: 'search', trust: 'high' }
    ],
    Muscat: [
      { url: 'https://news.google.com/rss/search?q=Muscat+upcoming+events+concert+exhibition+this+month&hl=en-US&gl=US&ceid=US:en', sourceType: 'search', trust: 'high' }
    ],
    Trichy: [
      { url: 'https://news.google.com/rss/search?q=Trichy+events+exhibition+cultural+event+this+week&hl=en-IN&gl=IN&ceid=IN:en', sourceType: 'search', trust: 'high' }
    ]
  },
  movies: {
    India: [
      { url: 'https://www.hindustantimes.com/feeds/rss/entertainment/tamil-cinema/rssfeed.xml', sourceType: 'cinema', trust: 'high' },
      { url: 'https://www.hindustantimes.com/feeds/rss/entertainment/bollywood/rssfeed.xml', sourceType: 'cinema', trust: 'high' },
      { url: `https://news.google.com/rss/search?q=upcoming+movie+release+date+theatre+OTT+India+${CURRENT_YEAR}&hl=en-IN&gl=IN&ceid=IN:en`, sourceType: 'search', trust: 'high' }
    ]
  },
  festivals: {
    India: [
      { url: 'https://www.timeanddate.com/holidays/india/feed', sourceType: 'calendar', trust: 'high' },
      { url: `https://news.google.com/rss/search?q=India+public+holiday+OR+Pongal+OR+Diwali+OR+Republic+Day+${CURRENT_YEAR}&hl=en-IN&gl=IN&ceid=IN:en`, sourceType: 'search', trust: 'high' }
    ],
    Oman: [
      { url: `https://news.google.com/rss/search?q=Oman+public+holiday+OR+Eid+OR+National+Day+${CURRENT_YEAR}&hl=en-US&gl=US&ceid=US:en`, sourceType: 'search', trust: 'high' }
    ]
  },
  civic: {
    Chennai: [
      { url: 'https://news.google.com/rss/search?q=Chennai+metro+water+OR+TANGEDCO+OR+corporation+notice+OR+civic+body&hl=en-IN&gl=IN&ceid=IN:en', sourceType: 'search', trust: 'high' }
    ],
    Muscat: [
      { url: 'https://news.google.com/rss/search?q=Muscat+municipality+OR+Oman+civic+announcement+OR+road+work&hl=en-US&gl=US&ceid=US:en', sourceType: 'search', trust: 'high' }
    ]
  }
});

function uniqByUrl(items = []) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const url = String(item?.url || '').trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(item);
  }
  return out;
}

function normalizeLocationKey(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  if (['chennai', 'madras', 't nagar', 'tnagar', 'adyar', 'velachery', 'tambaram'].includes(lower)) return 'Chennai';
  if (['trichy', 'tiruchirappalli', 'srirangam', 'thillai nagar'].includes(lower)) return 'Trichy';
  if (['muscat', 'al khuwair', 'qurum', 'ruwi', 'seeb', 'mabela'].includes(lower)) return 'Muscat';
  if (['india', 'in'].includes(lower)) return 'India';
  if (['oman'].includes(lower)) return 'Oman';
  return text;
}

function normalizeCategoryKey(value) {
  const text = String(value || '').toLowerCase().trim();
  const aliases = {
    movie: 'movies',
    event: 'events',
    festival: 'festivals',
    alert: 'alerts',
    weather_alert: 'weather_alerts',
    offer: 'shopping',
    airline_offer: 'airlines'
  };
  return aliases[text] || text;
}

export function topupFeedSourceRegistry(baseRegistry = DEFAULT_FEED_SOURCE_REGISTRY, topup = {}) {
  const merged = JSON.parse(JSON.stringify(baseRegistry));
  for (const [category, locationMap] of Object.entries(topup || {})) {
    if (!merged[category]) merged[category] = {};
    for (const [location, entries] of Object.entries(locationMap || {})) {
      if (!merged[category][location]) merged[category][location] = [];
      merged[category][location] = uniqByUrl([...(merged[category][location] || []), ...(entries || [])]);
    }
  }
  return merged;
}

export function getFeedSourcesForRequest({ category, locations = [], includeOnline = true, registry = DEFAULT_FEED_SOURCE_REGISTRY } = {}) {
  const categoryKey = normalizeCategoryKey(category);
  const categoryRegistry = registry[categoryKey] || {};
  const requestedLocations = Array.isArray(locations) ? locations.map(normalizeLocationKey).filter(Boolean) : [];
  const selected = [];

  for (const location of requestedLocations) {
    if (categoryRegistry[location]) {
      selected.push(...categoryRegistry[location].map(entry => ({ ...entry, category: categoryKey, location })));
    }
  }

  if (includeOnline && categoryRegistry.online) {
    selected.push(...categoryRegistry.online.map(entry => ({ ...entry, category: categoryKey, location: 'online' })));
  }
  if (categoryRegistry.global) {
    selected.push(...categoryRegistry.global.map(entry => ({ ...entry, category: categoryKey, location: 'global' })));
  }
  if (categoryRegistry.India && requestedLocations.includes('Chennai')) {
    selected.push(...categoryRegistry.India.map(entry => ({ ...entry, category: categoryKey, location: 'India' })));
  }
  if (categoryRegistry.Oman && requestedLocations.includes('Muscat')) {
    selected.push(...categoryRegistry.Oman.map(entry => ({ ...entry, category: categoryKey, location: 'Oman' })));
  }

  return uniqByUrl(selected);
}

export function rankFeedSource(source) {
  return {
    ...source,
    priorityScore:
      (source.trust === 'high' ? 3 : source.trust === 'medium' ? 2 : 1) +
      (source.sourceType === 'government' ? 2 : 0)
  };
}

export function buildFeedFetchPlan({ categories = [], locations = [], registry = DEFAULT_FEED_SOURCE_REGISTRY, isStaticHost = false } = {}) {
  const plan = [];
  for (const category of categories || []) {
    let sources = getFeedSourcesForRequest({ category, locations, registry, includeOnline: true });

    // Phase 9: Source and feed governance
    // Apply ranking
    sources = sources.map(rankFeedSource).sort((a, b) => b.priorityScore - a.priorityScore);

    // If static host, aggressively trim lower-value feeds to save network/proxy bandwidth
    if (isStaticHost) {
      sources = sources.filter(s => s.priorityScore >= 2 || s.trust !== 'low').slice(0, 3);
    }

    // Feed health auto-demotion: skip sources with >50% failure rate
    sources = sources.filter(s => {
        try { return getFeedWeight(s.url) > 0; } catch { return true; } // fail-open if monitor unavailable
    });

    if (sources.length > 0) {
      plan.push({
        category: normalizeCategoryKey(category),
        sources
      });
    }
  }
  return plan;
}

export { DEFAULT_FEED_SOURCE_REGISTRY };
