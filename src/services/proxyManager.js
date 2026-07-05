/**
 * Proxy Manager - Handles failover between multiple RSS proxies
 * Hardened for static hosting: cooldowns, in-memory caching, and dead-proxy suppression
 */
import logStore from '../utils/logStore.js';

export const LIVE_RSS_PROXY_BUDGET_MS = 6000;
export const LIVE_RSS_PROXY_ATTEMPT_TIMEOUT_MS = 2000;

function firstXmlNode(node, tagName) {
    return node.getElementsByTagName(tagName)[0] || null;
}

function parseXML(xmlString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

    if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
        throw new Error('XML Parsing Error');
    }

    const feedTitle = xmlDoc.querySelector('channel > title')?.textContent || 'Unknown Source';

    const items = Array.from(xmlDoc.querySelectorAll('item')).map(node => {
        const title = node.querySelector('title')?.textContent;
        const link = node.querySelector('link')?.textContent;
        const pubDate = node.querySelector('pubDate')?.textContent;
        const description = node.querySelector('description')?.textContent;
        const guid = node.querySelector('guid')?.textContent;
        const author = node.querySelector('author')?.textContent || firstXmlNode(node, 'dc:creator')?.textContent;
        const enclosureNode = node.querySelector('enclosure');
        const enclosure = enclosureNode ? {
            url: enclosureNode.getAttribute('url'),
            type: enclosureNode.getAttribute('type')
        } : null;
        const mediaContentNode = firstXmlNode(node, 'media:content') || node.querySelector('content');
        const mediaContent = mediaContentNode ? { url: mediaContentNode.getAttribute('url') } : null;
        const mediaThumbnailNode = firstXmlNode(node, 'media:thumbnail') || node.querySelector('thumbnail');
        const thumbnail = mediaThumbnailNode ? mediaThumbnailNode.getAttribute('url') : null;

        return {
            title,
            link,
            pubDate,
            description,
            guid,
            author,
            enclosure,
            'media:content': mediaContent,
            thumbnail
        };
    });

    return { title: feedTitle, items };
}

const PROXIES = [
    {
        name: 'allorigins',
        format: (feedUrl) => `https://api.allorigins.win/raw?url=${encodeURIComponent(feedUrl)}`,
        parse: async (response) => {
            const text = await response.text();
            if (!text) throw new Error('Empty response from allorigins');
            return parseXML(text);
        }
    },
    {
        name: 'corsproxy',
        format: (feedUrl) => `https://corsproxy.io/?${encodeURIComponent(feedUrl)}`,
        parse: async (response) => {
            const text = await response.text();
            if (!text) throw new Error('Empty response from corsproxy');
            return parseXML(text);
        }
    },
    {
        name: 'codetabs',
        format: (feedUrl) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(feedUrl)}`,
        parse: async (response) => {
            const text = await response.text();
            if (!text) throw new Error('Empty response from codetabs');
            return parseXML(text);
        }
    },
    {
        name: 'rss2json',
        format: (feedUrl) => `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`,
        parse: async (response) => {
            const data = await response.json();
            if (data.status === 'ok') {
                return { title: data.feed?.title, items: data.items || [] };
            }
            throw new Error('rss2json status not ok');
        }
    }
];

const SUCCESS_CACHE_TTL_MS = 10 * 60 * 1000;
const SHORT_COOLDOWN_MS = 5 * 60 * 1000;
const LONG_COOLDOWN_MS = 60 * 60 * 1000;

function now() {
    return Date.now();
}

function remainingBudgetMs(startedAt, budgetMs) {
    return Math.max(0, Number(budgetMs || 0) - (now() - startedAt));
}

function makeProxyBudgetError(startedAt, budgetMs, timedOutFeedCount = 0) {
    const error = new Error(`live RSS proxy budget exceeded after ${now() - startedAt}ms`);
    error.code = 'live-rss-budget-exceeded';
    error.proxyFallbackReason = 'live-rss-budget-exceeded';
    error.liveRssDurationMs = now() - startedAt;
    error.liveRssBudgetMs = budgetMs;
    error.timedOutFeedCount = timedOutFeedCount;
    return error;
}

function isLikelyCorsError(message = '') {
    const lower = String(message || '').toLowerCase();
    return lower.includes('cors') || lower.includes('failed to fetch') || lower.includes('networkerror');
}

function isRateLimitError(message = '') {
    return String(message || '').includes('429');
}

class ProxyManager {
    constructor() {
        this.currentIndex = 0;
        this.failureCounts = new Map();
        this.lastSuccess = new Map();
        this.cooldownUntil = new Map();
        this.responseCache = new Map();
    }

    getCached(feedUrl) {
        const cached = this.responseCache.get(feedUrl);
        if (!cached) return null;
        if ((now() - cached.timestamp) > SUCCESS_CACHE_TTL_MS) {
            this.responseCache.delete(feedUrl);
            return null;
        }
        return cached.result;
    }

    setCached(feedUrl, result) {
        this.responseCache.set(feedUrl, { result, timestamp: now() });
    }

    isProxyCoolingDown(proxyName) {
        const until = this.cooldownUntil.get(proxyName) || 0;
        return until > now();
    }

    setCooldown(proxyName, errorMessage) {
        // 429 rate-limit: back off for 1 hour — same as CORS — to stop hammering
        // free-tier proxy services (rss2json, corsproxy, etc.).
        const duration = (isRateLimitError(errorMessage) || isLikelyCorsError(errorMessage))
            ? LONG_COOLDOWN_MS
            : SHORT_COOLDOWN_MS;
        this.cooldownUntil.set(proxyName, now() + duration);
    }

    async fetchViaProxy(feedUrl, options = {}) {
        const cached = this.getCached(feedUrl);
        if (cached) {
            return cached;
        }

        const budgetMs = Number(options.budgetMs || LIVE_RSS_PROXY_BUDGET_MS);
        const startedAt = now();
        let timedOutFeedCount = 0;
        const availableProxies = PROXIES.filter(proxy => !this.isProxyCoolingDown(proxy.name));
        const proxiesToTry = availableProxies.length > 0 ? availableProxies : PROXIES;
        let lastError = null;

        for (let i = 0; i < proxiesToTry.length; i++) {
            const remainingMs = remainingBudgetMs(startedAt, budgetMs);
            if (remainingMs <= 0) {
                lastError = makeProxyBudgetError(startedAt, budgetMs, timedOutFeedCount);
                break;
            }

            const index = (this.currentIndex + i) % proxiesToTry.length;
            const proxy = proxiesToTry[index];

            try {
                const proxyUrl = proxy.format(feedUrl);
                const controller = new AbortController();
                const timeoutId = setTimeout(
                    () => controller.abort(),
                    Math.min(LIVE_RSS_PROXY_ATTEMPT_TIMEOUT_MS, remainingMs)
                );

                let response;
                try {
                    response = await fetch(proxyUrl, {
                        signal: controller.signal,
                        cache: 'no-store'
                    });
                } finally {
                    clearTimeout(timeoutId);
                }

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const result = await proxy.parse(response);
                if (!result || !Array.isArray(result.items) || result.items.length === 0) {
                    throw new Error('No items returned');
                }

                this.failureCounts.set(proxy.name, 0);
                this.lastSuccess.set(proxy.name, now());
                this.cooldownUntil.delete(proxy.name);
                this.currentIndex = index;
                this.setCached(feedUrl, result);
                logStore.info('proxy', `${proxy.name} OK (${result.items.length} items)`);
                return result;
            } catch (error) {
                const isTimeout = error?.name === 'AbortError';
                if (isTimeout) timedOutFeedCount += 1;
                const message = isTimeout ? 'live-rss-proxy-timeout' : (error?.message || 'unknown');
                lastError = isTimeout ? makeProxyBudgetError(startedAt, budgetMs, timedOutFeedCount) : error;
                this.failureCounts.set(proxy.name, (this.failureCounts.get(proxy.name) || 0) + 1);
                this.setCooldown(proxy.name, message);
                console.warn(`[ProxyManager] ${proxy.name} failed for ${feedUrl}:`, message);
            }
        }

        if (cached) {
            return cached;
        }

        logStore.error('proxy', `All proxies failed: ${lastError?.message}`);
        const error = new Error(`All proxies failed. Last error: ${lastError?.message || 'unknown'}`);
        if (lastError?.code) error.code = lastError.code;
        if (lastError?.proxyFallbackReason) error.proxyFallbackReason = lastError.proxyFallbackReason;
        if (lastError?.liveRssDurationMs) error.liveRssDurationMs = lastError.liveRssDurationMs;
        if (lastError?.liveRssBudgetMs) error.liveRssBudgetMs = lastError.liveRssBudgetMs;
        error.timedOutFeedCount = timedOutFeedCount;
        throw error;
    }

    getProxyHealth() {
        return PROXIES.map(proxy => ({
            name: proxy.name,
            failures: this.failureCounts.get(proxy.name) || 0,
            lastSuccess: this.lastSuccess.get(proxy.name) || null,
            coolingDown: this.isProxyCoolingDown(proxy.name)
        }));
    }
}

export const proxyManager = new ProxyManager();