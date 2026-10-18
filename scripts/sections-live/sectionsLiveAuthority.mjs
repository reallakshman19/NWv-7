import { createHash } from 'node:crypto';
import { digestCanonicalJson } from '../top-stories-shadow/canonicalJson.mjs';

export const SECTIONS_LIVE_EVIDENCE_SCHEMA = 'nw-sections-live-evidence/v1';
export const LIVE_STORY_RETAIN_HOURS = 36;
export const LIVE_MAX_ITEMS_PER_FEED = 20;
export const LIVE_MAX_STORIES_PER_SECTION = 30;
export const LIVE_MAX_FEED_BYTES = 500_000;
export const LIVE_MAX_LANE_PAYLOAD_BYTES = 60_000;
export const LIVE_MAX_TITLE_CHARS = 400;
export const LIVE_MAX_SUMMARY_CHARS = 800;
export const LIVE_MAX_URL_CHARS = 2_048;
export const LIVE_MAX_PUBLISHED_AT_CHARS = 128;

const HOUR_MS = 60 * 60 * 1_000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000;
const SUPPRESS_PATTERNS = [
  /you won'?t believe/i,
  /\bviral\b/i,
  /\bshocking\b/i,
  /photo\s*gallery/i,
  /\brecap\b/i,
  /\bbreaks? the internet\b/i,
  /\bomg\b/i,
];
const SECTION_BACKFILL = Object.freeze({ trichy: 'tn', muscat: 'world' });

function text(value) {
  return String(value || '').trim();
}

function compactText(value, maxChars) {
  return text(value).replace(/\s+/g, ' ').slice(0, maxChars).trim();
}

function escapeXml(value) {
  return text(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function decodeXml(value) {
  return text(value)
    .replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/i, '$1')
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&#x([0-9a-f]+);/gi, (_, number) => String.fromCodePoint(parseInt(number, 16)))
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, '&');
}

function stripMarkup(value) {
  return decodeXml(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function childText(block, names) {
  for (const name of names) {
    const local = escapeRegExp(name);
    const match = block.match(new RegExp(
      `<(?:[A-Za-z0-9_-]+:)?${local}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_-]+:)?${local}>`,
      'i',
    ));
    if (match) return decodeXml(match[1]);
  }
  return '';
}

function entryLink(block) {
  const atom = block.match(/<(?:[A-Za-z0-9_-]+:)?link\b[^>]*\bhref=["']([^"']+)["'][^>]*\/?\s*>/i);
  if (atom) return decodeXml(atom[1]);
  return stripMarkup(childText(block, ['link']));
}

function listEntryBlocks(xmlText) {
  const blocks = [];
  const expression = /<(?:[A-Za-z0-9_-]+:)?(item|entry)\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_-]+:)?\1>/gi;
  let match;
  while ((match = expression.exec(xmlText)) !== null) blocks.push(match[2]);
  return blocks;
}

function canonicalUrl(value) {
  let url = text(value);
  if (!url) return '';
  url = url.replace(/#.*$/, '').replace(/\?.*$/, '').replace('/amp/', '/');
  const googleTarget = url.match(/^https:\/\/news\.google\.com\/.*?[?&]url=([^&]+)/i);
  if (googleTarget) {
    try { url = decodeURIComponent(googleTarget[1]); } catch { url = googleTarget[1]; }
  }
  return url.toLowerCase().replace(/\/$/, '');
}

function titleFingerprint(value) {
  return text(value).toLowerCase()
    .replace(/\b(live|latest|breaking|update|exclusive|watch|just in)\b/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sha(value, algorithm = 'sha256') {
  return createHash(algorithm).update(String(value)).digest('hex');
}

function makeStoryId(item) {
  const urlKey = canonicalUrl(item.url);
  const base = urlKey || [
    titleFingerprint(item.title),
    item.sourceGroup || '',
    String(item.publishedAt || '').slice(0, 10),
  ].join('|');
  return sha(base, 'sha1').slice(0, 16);
}

function parseTimestamp(value) {
  const timestamp = Date.parse(text(value));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isSuppressed(title, summary) {
  const haystack = `${title} ${summary}`;
  return SUPPRESS_PATTERNS.some(pattern => pattern.test(haystack));
}

export function buildLiveLaneDefinitions(registryAuthority) {
  const definitions = [];
  for (const [sectionKey, feeds] of Object.entries(registryAuthority.canonicalRegistry.sections)) {
    feeds.forEach((feed, index) => {
      const feedUrlDigest = sha(feed.url);
      definitions.push({
        laneId: `${sectionKey}:${String(index + 1).padStart(2, '0')}:${feedUrlDigest.slice(0, 12)}`,
        sectionKey,
        sourceGroup: feed.sourceGroup,
        sourceName: feed.source,
        feedUrl: feed.url,
        feedUrlDigest,
        tier: feed.tier,
        topic: feed.topic,
      });
    });
  }
  return definitions;
}

export function buildBoundedBrowserFeedXml(extraction, options = {}) {
  if (!extraction?.recognized) return '';
  const maxItems = Math.min(
    LIVE_MAX_ITEMS_PER_FEED,
    Math.max(1, Number(options.maxItems || LIVE_MAX_ITEMS_PER_FEED)),
  );
  const entries = Array.isArray(extraction.entries) ? extraction.entries.slice(0, maxItems) : [];
  const items = entries.map(entry => [
    '<item>',
    `<title>${escapeXml(compactText(entry?.title, LIVE_MAX_TITLE_CHARS))}</title>`,
    `<description>${escapeXml(compactText(entry?.summary, LIVE_MAX_SUMMARY_CHARS))}</description>`,
    `<link>${escapeXml(compactText(entry?.url, LIVE_MAX_URL_CHARS))}</link>`,
    `<pubDate>${escapeXml(compactText(entry?.publishedAt, LIVE_MAX_PUBLISHED_AT_CHARS))}</pubDate>`,
    '</item>',
  ].join('')).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>${items}</channel></rss>`;
}

export function parseLiveFeedText(xmlText, lane, nowMs, options = {}) {
  const maxItems = Math.max(1, Number(options.maxItems || LIVE_MAX_ITEMS_PER_FEED));
  const blocks = listEntryBlocks(String(xmlText || ''));
  if (blocks.length === 0 && !/<(?:rss|feed|rdf:RDF)\b/i.test(String(xmlText || ''))) {
    const error = new Error('Feed payload is not recognized RSS or Atom XML');
    error.code = 'FEED_XML_INVALID';
    throw error;
  }
  const diagnostics = {
    parsedEntries: blocks.length,
    staleRejected: 0,
    futureRejected: 0,
    malformedRejected: 0,
    suppressedRejected: 0,
    duplicatesRejected: 0,
  };
  const items = [];
  const seen = new Set();
  const cutoff = nowMs - LIVE_STORY_RETAIN_HOURS * HOUR_MS;
  for (let index = 0; index < blocks.length && items.length < maxItems; index += 1) {
    const block = blocks[index];
    const title = compactText(stripMarkup(childText(block, ['title'])), LIVE_MAX_TITLE_CHARS);
    const summary = compactText(stripMarkup(childText(block, ['description', 'summary', 'content', 'encoded'])), LIVE_MAX_SUMMARY_CHARS);
    const url = compactText(entryLink(block), LIVE_MAX_URL_CHARS);
    const publishedAt = parseTimestamp(childText(block, ['pubDate', 'published', 'updated', 'date']));
    if (!title || !url || !publishedAt) {
      diagnostics.malformedRejected += 1;
      continue;
    }
    if (publishedAt < cutoff) {
      diagnostics.staleRejected += 1;
      continue;
    }
    if (publishedAt > nowMs + MAX_FUTURE_SKEW_MS) {
      diagnostics.futureRejected += 1;
      continue;
    }
    if (isSuppressed(title, summary)) {
      diagnostics.suppressedRejected += 1;
      continue;
    }
    const item = {
      title,
      summary,
      source: lane.sourceName,
      sourceGroup: lane.sourceGroup,
      sourceTier: lane.tier,
      sourceTopic: lane.topic,
      url,
      publishedAt,
      publishedAtSource: 'feed_timestamp',
      timestampConfidence: 'high',
      category: lane.sectionKey,
      region: lane.sectionKey === 'muscat' ? 'om' : 'in',
      language: 'en',
      feedPosition: index + 1,
      feedLength: blocks.length,
    };
    item.id = makeStoryId(item);
    if (seen.has(item.id)) {
      diagnostics.duplicatesRejected += 1;
      continue;
    }
    seen.add(item.id);
    if (lane.sectionKey === 'topStories') {
      item.topFeedRank = index + 1;
      item.topFeedSource = lane.laneId;
      item.canonicalId = item.id;
    }
    items.push(item);
  }
  return { items, diagnostics };
}

export async function readResponseTextWithLimit(response, maxBytes = LIVE_MAX_FEED_BYTES) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > maxBytes) {
    const error = new Error(`Feed response declares ${declared} bytes; limit is ${maxBytes}`);
    error.code = 'FEED_BODY_TOO_LARGE';
    throw error;
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let output = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        const error = new Error(`Feed response exceeded ${maxBytes} bytes`);
        error.code = 'FEED_BODY_TOO_LARGE';
        throw error;
      }
      output += decoder.decode(value, { stream: true });
    }
    output += decoder.decode();
    return output;
  } finally {
    if (bytes > maxBytes) await reader.cancel('feed body limit exceeded');
    reader.releaseLock();
  }
}

export async function acquireLiveLane(lane, options = {}) {
  const nowMs = Number(options.nowMs ?? Date.now());
  const timeoutMs = Math.max(1_000, Number(options.timeoutMs || 12_000));
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const startedAt = Date.now();
  if (!lane?.feedUrl || !String(lane.feedUrl).startsWith('https://')) {
    return {
      lane,
      disposition: 'POLICY_BLOCKED',
      items: [],
      httpStatus: null,
      durationMs: Date.now() - startedAt,
      errorCode: 'HTTPS_REQUIRED',
      diagnostics: {},
      observedAtMs: nowMs,
    };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('feed timeout'), timeoutMs);
  try {
    const response = await fetchImpl(lane.feedUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9',
        'Accept-Language': 'en-IN,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (compatible; NWv7SectionsShadow/1.0)',
      },
    });
    if (!response.ok) {
      return {
        lane,
        disposition: 'HTTP_ERROR',
        items: [],
        httpStatus: response.status,
        durationMs: Date.now() - startedAt,
        errorCode: `HTTP_${response.status}`,
        diagnostics: {},
        observedAtMs: nowMs,
      };
    }
    let xmlText;
    try {
      xmlText = await readResponseTextWithLimit(response, Number(options.maxBytes || LIVE_MAX_FEED_BYTES));
    } catch (error) {
      return {
        lane,
        disposition: error?.code === 'FEED_BODY_TOO_LARGE' ? 'POLICY_BLOCKED' : 'HTTP_ERROR',
        items: [],
        httpStatus: response.status,
        durationMs: Date.now() - startedAt,
        errorCode: error?.code || 'FEED_READ_FAILED',
        diagnostics: {},
        observedAtMs: nowMs,
      };
    }
    try {
      const parsed = parseLiveFeedText(xmlText, lane, nowMs, options);
      return {
        lane,
        disposition: parsed.items.length > 0 ? 'OK' : 'EMPTY',
        items: parsed.items,
        httpStatus: response.status,
        durationMs: Date.now() - startedAt,
        errorCode: null,
        diagnostics: parsed.diagnostics,
        observedAtMs: nowMs,
      };
    } catch (error) {
      return {
        lane,
        disposition: 'PARSE_ERROR',
        items: [],
        httpStatus: response.status,
        durationMs: Date.now() - startedAt,
        errorCode: error?.code || 'FEED_PARSE_ERROR',
        diagnostics: {},
        observedAtMs: nowMs,
      };
    }
  } catch (error) {
    const timedOut = controller.signal.aborted || error?.name === 'AbortError';
    return {
      lane,
      disposition: timedOut ? 'TIMEOUT' : 'HTTP_ERROR',
      items: [],
      httpStatus: null,
      durationMs: Date.now() - startedAt,
      errorCode: timedOut ? 'FETCH_TIMEOUT' : 'FETCH_FAILED',
      diagnostics: {},
      observedAtMs: nowMs,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function dedupeAndCap(items) {
  const sorted = [...items].sort((a, b) => Number(b.publishedAt || 0) - Number(a.publishedAt || 0));
  const seen = new Set();
  const result = [];
  for (const item of sorted) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
    if (result.length >= LIVE_MAX_STORIES_PER_SECTION) break;
  }
  return result;
}

export function assembleLiveSections(laneResults, nowMs) {
  const sections = {};
  const sourceHealth = {};
  const ordered = [...laneResults].sort((a, b) => a.lane.laneId.localeCompare(b.lane.laneId));
  for (const result of ordered) {
    const sectionKey = result.lane.sectionKey;
    if (!sections[sectionKey]) sections[sectionKey] = [];
    sections[sectionKey].push(...result.items);
    sourceHealth[result.lane.laneId] = {
      section: sectionKey,
      sourceGroup: result.lane.sourceGroup,
      disposition: result.disposition,
      itemCount: result.items.length,
      httpStatus: result.httpStatus,
      errorCode: result.errorCode,
      diagnostics: result.diagnostics,
    };
  }
  for (const sectionKey of Object.keys(sections)) sections[sectionKey] = dedupeAndCap(sections[sectionKey]);
  for (const [child, parent] of Object.entries(SECTION_BACKFILL)) {
    const current = sections[child] || [];
    if (current.length >= 10) continue;
    const childIds = new Set(current.map(item => item.id));
    const extras = [];
    for (const story of sections[parent] || []) {
      if (childIds.has(story.id)) continue;
      childIds.add(story.id);
      extras.push({ ...story, backfilledFrom: parent });
      if (current.length + extras.length >= 10) break;
    }
    sections[child] = [...current, ...extras];
  }
  const topFeedItems = (sections.topStories || []).map((item, index) => ({
    ...item,
    topFeedRank: item.topFeedRank || index + 1,
    topFeedSource: item.topFeedSource || 'sections-topStories',
  }));
  const inputEvidenceDigest = digestCanonicalJson({
    sectionItems: sections,
    topFeedItems,
    settings: {},
    sourceHealth,
  });
  return { nowMs, sectionItems: sections, topFeedItems, settings: {}, sourceHealth, inputEvidenceDigest };
}

export function buildLiveAcquisitionEvidence(laneResults) {
  return [...laneResults]
    .sort((a, b) => a.lane.laneId.localeCompare(b.lane.laneId))
    .map(result => ({
      laneId: result.lane.laneId,
      sectionKey: result.lane.sectionKey,
      sourceGroup: result.lane.sourceGroup,
      feedUrlDigest: result.lane.feedUrlDigest,
      disposition: result.disposition,
      itemCount: result.items.length,
      normalizedItemsDigest: digestCanonicalJson(result.items),
      httpStatus: result.httpStatus,
      errorCode: result.errorCode,
      diagnostics: result.diagnostics,
    }));
}
