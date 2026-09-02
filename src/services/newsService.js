/**
 * News Service
 * Fetches data from NewsData.io (Priority) or RSS Fallback (Basic Data)
 */

const BASE_URL = 'https://newsdata.io/api/1/news';
import { proxyManager } from './proxyManager.js';
import { fnv1aHex } from '../data/dataEnvelope.js';
import { sanitizeHtmlText } from '../utils/htmlText.js';

// Mapping from Settings Keys (or general identifiers) to Google News Source Strings
const SOURCE_MAPPINGS = {
    bbc: ['BBC', 'BBC News'],
    reuters: ['Reuters'],
    ndtv: ['NDTV', 'NDTV News'],
    theHindu: ['The Hindu'],
    toi: ['The Times of India', 'Times of India', 'TOI'],
    financialExpress: ['The Financial Express', 'Financial Express'],
    dtNext: ['DT Next'],
    omanObserver: ['Oman Daily Observer', 'Oman Observer'],
    moneyControl: ['Moneycontrol'],
    indiaToday: ['India Today'],
    variety: ['Variety'],
    hollywoodReporter: ['The Hollywood Reporter'],
    bollywoodHungama: ['Bollywood Hungama'],
    filmCompanion: ['Film Companion'],
    timesOfOman: ['Times of Oman'],
    alJazeera: ['Al Jazeera']
};

const HIGH_IMPACT_SOURCES = ['ndtv', 'theHindu'];

export function makeStableNewsId(prefix, article) {
    const seed = article?.url || article?.link || article?.title || article?.headline || '';
    return `${prefix}-${fnv1aHex(seed)}`;
}

export function parseNewsPublishedAt(value) {
    if (typeof value === 'number') {
        return Number.isFinite(value) && value > 0 ? value : 0;
    }
    const parsed = Date.parse(String(value || ''));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function formatPublishedTime(publishedAt) {
    return publishedAt
        ? new Date(publishedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '';
}

export async function fetchNews(query, keys = {}) {
    // Handle both old signature (query, apiKeyString) and new (query, keyObject)
    let apiKey = '';
    let settings = null;

    if (typeof keys === 'string') {
        apiKey = keys;
    } else {
        apiKey = keys.newsApiKey;
        settings = keys.settings;
    }

    // 1. Try DuckDuckGo "Crawler" style (Bing RSS Proxy)
    // We attempt this first. We removed the strict check for ddgApiKey.length > 0
    // to fix the "not working" issue reported by user.
    try {
        // Only try if not explicitly disabled via some future setting, but for now we try it.
        // Note: DDG results usually don't contain source info in title, so strict filtering
        // requested for Google News might not apply here.
        console.log('Fetching via DDG/Crawler proxy...');
        const results = await fetchDDGNews(query);
        if (results && results.length > 0) return results;
    } catch (error) {
        void error;
        console.warn('DDG Fetch failed, trying next option.', error);
    }

    // 2. Try NewsData.io API (High Priority if key exists)
    if (apiKey) {
        try {
            const url = `${BASE_URL}?apikey=${apiKey}&q=${encodeURIComponent(query)}&language=en`;
            const response = await fetch(url);

            if (response.ok) {
                const data = await response.json();
                if (data.status === 'success' && data.results?.length > 0) {
                    return (data.results || []).map(item => {
                        const publishedAt = parseNewsPublishedAt(item.pubDate);
                        return {
                            id: item.article_id,
                            headline: item.title,
                            summary: item.description ? item.description.substring(0, 150) + '...' : 'No summary available.',
                            source: item.source_id,
                            url: item.link,
                            publishedAt,
                            publishedAtSource: publishedAt ? 'newsdata_pubdate' : 'missing',
                            timestampConfidence: publishedAt ? 'medium' : 'low',
                            time: formatPublishedTime(publishedAt),
                            confidence: 'HIGH',
                            sourceCount: 1
                        };
                    });
                }
            }
        } catch (error) {
            void error;
            console.warn(`API fetch failed for ${query}, falling back to RSS.`);
        }
    }

    // 3. Fallback to Google News RSS (Basic Data / "Crawler Data")
    // This works without any API key.
    return fetchRSSNews(query, settings);
}

/**
 * Fetch "Basic Data" via Google News RSS + rss2json
 */
async function fetchRSSNews(query, settings = null) {
    try {
        const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
        const data = await proxyManager.fetchViaProxy(rssUrl);

        let items = (data.items || []).map((item) => {
            // Extract source from title if author is missing/generic
            let source = item.author || 'Google News';
            if (source === 'Google News' || !source) {
                source = extractSourceFromTitle(item.title) || 'Unknown Source';
            }
            const publishedAt = parseNewsPublishedAt(item.pubDate);

            return {
                id: makeStableNewsId('rss', item),
                headline: item.title,
                summary: sanitizeHtmlText(item.description || item.content || 'Latest coverage from Google News', { maxLength: 150 }),
                source: source,
                url: item.link,
                publishedAt,
                publishedAtSource: publishedAt ? 'google_news_rss_timestamp' : 'missing',
                timestampConfidence: publishedAt ? 'medium' : 'low',
                time: formatPublishedTime(publishedAt),
                confidence: 'MEDIUM',
                sourceCount: 1,
                originalTitle: item.title
            };
        });

        // Apply Source Filtering and Sorting if settings are provided
        if (settings && settings.newsSources) {
            // 1. Filter: Restrict to sources in settings
            items = items.filter(item => isSourceAllowed(item.source, settings.newsSources));

            // 2. Sort: High Impact first
            items.sort((a, b) => {
                const aHigh = isHighImpact(a.source);
                const bHigh = isHighImpact(b.source);
                if (aHigh && !bHigh) return -1;
                if (!aHigh && bHigh) return 1;
                return 0;
            });
        }

        // Return filtered list (up to 10 to ensure we have content after filtering)
        return items.slice(0, 10);

    } catch (error) {
        void error;
        console.error(`RSS Fetch failed for ${query}`, error);
        return [];
    }
}

/**
 * Fetch "Crawler" Data via Bing RSS (Proxy for DDG-style results)
 */
async function fetchDDGNews(query) {
    try {
        const rssUrl = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss`;
        const data = await proxyManager.fetchViaProxy(rssUrl);

        return (data.items || []).map((item) => {
            const publishedAt = parseNewsPublishedAt(item.pubDate);
            return {
                id: makeStableNewsId('ddg', item),
                headline: item.title,
                summary: item.description || 'Web Result',
                source: item.author || 'DuckDuckGo/Bing',
                url: item.link,
                publishedAt,
                publishedAtSource: publishedAt ? 'bing_news_rss_timestamp' : 'missing',
                timestampConfidence: publishedAt ? 'medium' : 'low',
                time: formatPublishedTime(publishedAt),
                confidence: 'MEDIUM',
                sourceCount: 1
            };
        });
    } catch (error) {
        void error;
        throw new Error('DDG Fetch Failed');
    }
}

// Helpers

function extractSourceFromTitle(title) {
    if (!title) return null;
    let extracted = null;
    // Common pattern: "Headline Text - Source Name"
    const parts = title.split(' - ');
    if (parts.length > 1) {
        extracted = parts[parts.length - 1].trim();
    }
    // Fallback: Check " | "
    else {
        const partsPipe = title.split(' | ');
        if (partsPipe.length > 1) {
            extracted = partsPipe[partsPipe.length - 1].trim();
        }
    }

    if (!extracted) return null;

    // Apply strict shortening mapping
    const overrides = {
        'bbc': 'BBC',
        'ndtv': 'NDTV',
        'the hindu': 'The Hindu',
        'times of india': 'TOI',
        'india news': 'India News'
    };

    const lowerExt = extracted.toLowerCase();
    for (const [k, v] of Object.entries(overrides)) {
        if (lowerExt.includes(k)) return v;
    }

    return extracted;
}

function mapSourceToKey(sourceName) {
    if (!sourceName) return null;
    const lowerSource = sourceName.toLowerCase();

    for (const [key, variants] of Object.entries(SOURCE_MAPPINGS)) {
        if (variants.some(v => lowerSource.includes(v.toLowerCase()) || v.toLowerCase() === lowerSource)) {
            return key;
        }
    }
    return null;
}

function isSourceAllowed(sourceName, newsSourcesSettings) {
    const key = mapSourceToKey(sourceName);
    // Strict filtering: If key is found AND enabled -> True.
    // If key is NOT found (Unknown source) -> False.
    if (key && newsSourcesSettings[key]) {
        return true;
    }
    return false;
}

function isHighImpact(sourceName) {
    const key = mapSourceToKey(sourceName);
    return key && HIGH_IMPACT_SOURCES.includes(key);
}
