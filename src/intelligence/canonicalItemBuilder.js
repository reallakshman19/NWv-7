import { classifyItemCategory } from './classification.js';
import { analyzeDateText } from './dateAware.js';
import { annotateItemLocation } from './locationAware.js';
import { evaluateEligibility } from './eligibilityWindowing.js';
import { parsePublicationDate, toUtcCalendarDateKey } from '../utils/dateKey.js';
import { upAheadDateKey } from '../services/upAheadLifecycle.js';

function normalizeText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hash(value) {
  let h = 0;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) {
    h = (h << 5) - h + text.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36);
}

function safeDate(input) {
  return parsePublicationDate(input);
}

function toDateKey(input) {
  return toUtcCalendarDateKey(input);
}

function normalizeLink(link) {
  try {
    const url = new URL(link);
    return url.toString();
  } catch {
    return String(link || '').trim() || null;
  }
}

function chooseSummary(raw) {
  return normalizeText(raw?.summary || raw?.description || raw?.contentSnippet || raw?.content || '');
}

function buildCanonicalId(raw, dateKey) {
  const title = normalizeText(raw?.title || 'untitled').toLowerCase();
  const source = String(raw?.source || raw?.rawSource || raw?.feedPack || 'feed').toLowerCase();
  const link = normalizeLink(raw?.link || raw?.url || '') || 'nolink';
  return hash(`${title}|${dateKey || 'nodate'}|${source}|${link}`);
}

function extractMode(raw, options) {
  if (options?.mode) return options.mode;
  if (raw?.mode) return raw.mode;
  return 'offline';
}

function deriveFeedPack(raw, options) {
  return raw?.feedPack || raw?.sourcePack || options?.feedPack || 'default';
}

function mergeDecisionTrace(...segments) {
  return [...new Set(segments.flat().filter(Boolean))];
}

export function buildCanonicalItem(rawItem, options = {}) {
  const raw = rawItem || {};
  const title = normalizeText(raw.title || raw.name || '');
  const summary = chooseSummary(raw);
  const description = normalizeText(raw.description || raw.summary || raw.content || '');
  const link = normalizeLink(raw.link || raw.url || '');
  const publishDate = safeDate(raw.pubDate || raw.publishDate || raw.isoDate || raw.publishedAt);
  const mode = extractMode(raw, options);
  const baseText = [title, summary, description, raw.originalText].filter(Boolean).join(' • ');

  const classified = classifyItemCategory(
    {
      ...raw,
      title,
      summary,
      description,
      link
    },
    {
      settings: options.settings,
      sourceTrustOptions: options.sourceTrustOptions
    }
  );

  const locationAnnotated = annotateItemLocation(
    {
      ...classified,
      title,
      summary,
      description,
      link,
      mode
    },
    {
      mode,
      category: classified.category,
      selectedCities: options.selectedCities,
      locationLibrary: options.locationLibrary,
      allowOnlineBypass: options.allowOnlineBypass !== false
    }
  );

  const locationCanonical = locationAnnotated.locationCanonical || null;
  const dateAnalysis = analyzeDateText(baseText, {
    asOfDate: options.asOfDate,
    publishDate,
    locationCanonical,
    requirePublicationAnchor: true,
    plannerWindowDays: options.plannerWindowDays || 7,
    maxExpandedDays: options.maxExpandedDays || 14
  });
  const explicitDateKey = upAheadDateKey({
    eventDateKey: raw.eventDateKey,
    eventStartAt: raw.eventStartAt,
    datePrecision: raw.datePrecision,
    locationCanonical,
  });
  const eventDateKey = explicitDateKey || dateAnalysis.eventDateKey || null;
  const parsedDateMatches = eventDateKey === dateAnalysis.eventDateKey;
  const canonicalId = raw.canonicalId || buildCanonicalId(raw, eventDateKey || toDateKey(publishDate));

  const canonical = {
    canonicalId,
    occurrenceId: raw.occurrenceId || null,
    sessionId: raw.sessionId || null,
    revisionOf: raw.revisionOf || null,
    revisionAt: raw.revisionAt || null,
    observedAt: raw.observedAt || options.asOfDate || null,
    firstSeenAt: raw.firstSeenAt || null,
    venue: raw.venue || null,
    dateSource: raw.dateSource || null,
    retailerId: raw.retailerId || null,
    offerMarket: raw.offerMarket || null,
    offerChannel: raw.offerChannel || null,
    rawSourceId: raw.guid || raw.id || raw.link || raw.url || title,
    title,
    summary,
    description,
    link,
    source: raw.source || raw.rawSource || 'feed',
    sourceUrl: raw.sourceUrl || null,
    sourceDomain: locationAnnotated.sourceDomain || classified.sourceDomain || null,
    sourceType: classified.sourceType || null,
    sourceTrust: classified.sourceTrust || 'low',
    sourceTrustScore: classified.sourceTrustScore || 0,
    feedPack: deriveFeedPack(raw, options),
    category: classified.category,
    classificationConfidence: classified.classificationConfidence || 0,
    eventDate: parsedDateMatches ? dateAnalysis.eventDate : null,
    eventDateEnd: parsedDateMatches ? dateAnalysis.eventDateEnd : null,
    eventDateKey,
    eventDateEndKey: raw.eventDateEndKey || (parsedDateMatches ? dateAnalysis.eventDateEndKey : null),
    eventDateEndExclusiveKey: raw.eventDateEndExclusiveKey || (parsedDateMatches ? dateAnalysis.eventDateEndExclusiveKey : null),
    eventStartAt: raw.eventStartAt || null,
    eventEndAt: raw.eventEndAt || null,
    expiryAt: raw.expiryAt || null,
    lifecycle: raw.lifecycle || null,
    datePrecision: raw.datePrecision || (eventDateKey && !raw.eventStartAt ? 'day' : null),
    matchedDateKeys: parsedDateMatches ? dateAnalysis.matchedDateKeys || [] : eventDateKey ? [eventDateKey] : [],
    parsedDateEvidence: dateAnalysis.parsedDateEvidence || null,
    dateConfidence: raw.dateConfidence || (explicitDateKey ? 'exact' : dateAnalysis.dateConfidence || 'none'),
    temporalType: dateAnalysis.temporalType || 'none',
    publishDate,
    publishTs: publishDate ? publishDate.getTime() : null,
    locationCanonical,
    locationAliasesMatched: locationAnnotated.locationMatchedAlias ? [locationAnnotated.locationMatchedAlias] : [],
    locationConfidence: locationAnnotated.locationConfidence || 0,
    locationEligible: locationAnnotated.locationEligible !== false,
    mode,
    priority: Number(raw.priority || 0),
    status: raw.status || 'new',
    routeHint: explicitDateKey ? 'eligible' : dateAnalysis.routeHint || null,
    dropReason: raw.dropReason || (!explicitDateKey && dateAnalysis.dropReason) || locationAnnotated.dropReason || null,
    suppressionReason: raw.suppressionReason || null,
    displayEligible: raw.displayEligible !== false,
    decisionTrace: mergeDecisionTrace(raw.decisionTrace, classified.decisionTrace, dateAnalysis.decisionTrace, locationAnnotated.locationDecisionTrace),
    mergedWith: raw.mergedWith || [],
    routedTo: null,
    originalItem: raw
  };

  const eligibility = evaluateEligibility(canonical, {
    asOfDate: options.asOfDate,
    plannerWindowDays: options.plannerWindowDays || 7
  });

  return {
    ...canonical,
    plannerEligible: eligibility.plannerEligible,
    upAheadEligible: eligibility.upAheadEligible,
    routeTarget: eligibility.routeTarget,
    routedTo: eligibility.routeTarget,
    windowStatus: eligibility.windowStatus,
    dropReason: eligibility.dropReason,
    decisionTrace: mergeDecisionTrace(canonical.decisionTrace, eligibility.decisionTrace)
  };
}

export function buildCanonicalItems(rawItems = [], options = {}) {
  return (rawItems || [])
    .filter(Boolean)
    .map(item => buildCanonicalItem(item, options));
}

export function summarizeCanonicalItems(items = []) {
  const summary = {
    total: 0,
    plannerEligible: 0,
    upAheadEligible: 0,
    dropped: 0,
    byCategory: {},
    byRoute: {}
  };

  for (const item of items || []) {
    summary.total += 1;
    if (item.plannerEligible) summary.plannerEligible += 1;
    if (item.upAheadEligible) summary.upAheadEligible += 1;
    if (!item.upAheadEligible && !item.plannerEligible) summary.dropped += 1;

    const category = item.category || 'unknown';
    const route = item.routeTarget || 'unknown';
    summary.byCategory[category] = (summary.byCategory[category] || 0) + 1;
    summary.byRoute[route] = (summary.byRoute[route] || 0) + 1;
  }

  return summary;
}
