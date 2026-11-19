import { extractDate, expandDateKeys, stripDatePublisherLabels } from '../utils/dateExtractor.js';
import { parsePublicationDate } from '../utils/dateKey.js';
import { getUpAheadWindowStatus, upAheadEventDayKey } from '../services/upAheadLifecycle.js';

// Date extraction uses the publication instant, while eligibility uses the
// observation clock. A supported venue sets the calendar for relative dates.
function parseReference({ publishDate, asOfDate } = {}) {
  for (const [source, value] of [['publication', publishDate], ['explicit_as_of', asOfDate]]) {
    if (value == null || value === '') continue;
    const date = parsePublicationDate(value);
    if (date && Number.isFinite(+date)) return { date, source };
  }
  return { date: new Date(), source: 'wall_clock_fallback' };
}
function parseWithLegacyExtractor(text, refDate, allowRelative) {
  const result = extractDate(text, refDate, { allowRelative });
  if (!result?.start) return null;
  return {
    eventDate: result.start,
    eventDateEnd: result.end,
    eventDateKey: result.startKey,
    eventDateEndKey: result.endKey,
    eventDateEndExclusiveKey: result.endExclusiveKey,
    // Python's legacy range confidence is a shape marker; JS consumers expect
    // inferred/exact/tentative and temporalType to represent shape separately.
    dateConfidence: result.confidence === 'range' ? 'inferred' : result.confidence,
    contractConfidence: result.confidence,
    temporalType: result.type === 'deadline' ? 'deadline' : result.end ? 'range' : 'single',
    matchedText: result.matchedText,
    parser: `legacy_${result.type}`,
    legacyType: result.type
  };
}

function hasStrongTemporalSignal(text) {
  return /\b(today|tomorrow|tonight|week|weekend|friday|saturday|sunday|monday|tuesday|wednesday|thursday|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|ends?|expires?|valid|book by|deadline|last date)\b/i.test(String(text || ''));
}

export function analyzeDateText(text, options = {}) {
  const {date: refDate, source: referenceSource} = parseReference(options);
  const candidateText = stripDatePublisherLabels(text).trim();
  const calendarRef = options.locationCanonical
    ? upAheadEventDayKey(refDate, { locationCanonical: options.locationCanonical, datePrecision: 'day' }) || refDate
    : refDate;
  const allowRelative = !options.requirePublicationAnchor || referenceSource === 'publication';
  const decisionTrace = [];

  if (!candidateText) {
    return {
      eventDate: null,
      eventDateEnd: null,
      dateConfidence: 'none',
      temporalType: 'none',
      routeHint: 'drop',
      dropReason: 'empty_text',
      matchedDateKeys: [],
      decisionTrace: ['empty_text']
    };
  }

  const parsers = [() => parseWithLegacyExtractor(candidateText, calendarRef, allowRelative)];

  for (const parser of parsers) {
    const result = parser();
    if (!result?.eventDate) continue;

    const dateKeys = expandDateKeys(
      {
        start: result.eventDate,
        end: result.eventDateEnd,
        startKey: result.eventDateKey, endKey: result.eventDateEndKey
      },
      options.maxExpandedDays || 14
    );

    decisionTrace.push(`matched:${result.parser}`);

    return {
      ...result,
      eventDateKey: result.eventDateKey,
      eventDateEndKey: result.eventDateEndKey,
      referenceSource,
      matchedDateKeys: dateKeys,
      routeHint: result.dateConfidence === 'tentative' ? 'upahead_possible' : 'eligible',
      parsedDateEvidence: {
        parser: result.parser,
        matchedText: result.matchedText,
        legacyType: result.legacyType || null,
        referenceSource,
        contractConfidence: result.contractConfidence
      },
      dropReason: null,
      decisionTrace
    };
  }

  const weakSignal = hasStrongTemporalSignal(candidateText);
  return {
    eventDate: null,
    eventDateEnd: null,
    dateConfidence: weakSignal ? 'tentative' : 'none',
    temporalType: weakSignal ? 'weak_signal' : 'none',
    routeHint: weakSignal ? 'upahead_possible' : 'drop',
    dropReason: weakSignal ? 'missing_resolved_date' : 'no_temporal_signal',
    matchedDateKeys: [],
    decisionTrace: [...decisionTrace, weakSignal ? 'weak_temporal_signal' : 'no_temporal_signal']
  };
}

export function classifyPlannerWindow(dateAnalysis, options = {}) {
  const plannerWindowDays = Number.isFinite(options.plannerWindowDays) ? options.plannerWindowDays : 7;
  const windowStatus = getUpAheadWindowStatus(dateAnalysis, {
    asOfDate: parsePublicationDate(options.asOfDate) ? options.asOfDate : options.publishDate,
    plannerWindowDays,
  });
  if (windowStatus === 'missing_date') {
    return {
      windowStatus: 'missing_date',
      plannerEligible: false,
      upAheadEligible: dateAnalysis?.routeHint === 'upahead_possible'
    };
  }

  if (windowStatus === 'before_window') {
    return { windowStatus: 'before_window', plannerEligible: false, upAheadEligible: false };
  }
  if (windowStatus === 'after_window') {
    return { windowStatus: 'after_window', plannerEligible: false, upAheadEligible: true };
  }

  return {
    windowStatus: 'inside_window',
    plannerEligible: dateAnalysis.dateConfidence !== 'tentative',
    upAheadEligible: true
  };
}
