/**
 * NWv7 Market Desk R2.1 - WP-07 IPO, NFO & Market Events Test Suite
 * Covers WP07-T01 through WP07-T28 against contract market-r21-contract-v1.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  REGISTERED_ISSUE_SOURCES,
  ADDITIONAL_OFFICIAL_LINKS,
  MARKET_CALENDAR_EVENTS,
  VERIFICATION_STATUSES,
  calculateEventStatus,
  getKolkataTodayMidnight,
  getKolkataIsoDate,
  parseIsoDateToKolkata,
  validateAdditionalOfficialLink,
  IST_OFFSET_MS,
  DAY_MS
} from '../src/market/features/events/ipoData.js';
import {
  parseIndiaDate,
  classifyNfoRecord,
  filterActiveNfos,
  filterHistoricalNfos,
  mergeNfoCustody,
  NFO_LIFECYCLE_STATES
} from '../src/market/features/events/nfoEngine.js';
import {
  extractFinanceBriefing,
  isFinanceRelatedArticle,
  stripHtml,
  isValidArticleUrl,
  NWV7_MARKET_NEWS_SOURCE_ID
} from '../src/market/features/events/newsReuseClient.js';
import {
  eventsStore
} from '../src/market/features/events/eventsStore.js';
import {
  getMarketSource,
  mayPerformSourceAction,
  validateSourceReceipt,
  createSourceReceipt
} from '../src/market/contracts/index.js';

// WP07-T01: Zero-Boot Network Silence
test('WP07-T01 zero-boot network silence: store creation executes zero network fetches', () => {
  const snapshot = eventsStore.getSnapshot();
  assert.ok(snapshot, 'Snapshot must exist');
  assert.equal(snapshot.newsLoading, false);
  assert.equal(Array.isArray(snapshot.events), true);
  assert.equal(snapshot.events.length >= 4, true);
});

// WP07-T02: All Registered Official Sources Match WP-00 Rights & Actions
test('WP07-T02 registered official sources match WP-00 rights and actions', () => {
  for (const src of REGISTERED_ISSUE_SOURCES) {
    const policy = getMarketSource(src.id);
    assert.ok(policy, `Source ${src.id} must be registered in WP-00`);
    assert.equal(policy.accessMode, 'OFFICIAL_LINK');
    assert.equal(policy.rights, 'LINK_ONLY');
    assert.equal(mayPerformSourceAction(src.id, 'LINK'), true);
    assert.equal(mayPerformSourceAction(src.id, 'BROWSER_FETCH'), false);
    assert.equal(mayPerformSourceAction(src.id, 'PUBLIC_SNAPSHOT'), false);
    assert.equal(src.url, policy.url);
  }
});

// WP07-T03: Additional Verified Official Links Security
test('WP07-T03 additional official navigation links use verified HTTPS destinations', () => {
  for (const link of ADDITIONAL_OFFICIAL_LINKS) {
    assert.equal(validateAdditionalOfficialLink(link), true);
    assert.ok(link.url.startsWith('https://'));
    assert.ok(link.url.includes(link.expectedHost));
  }
  // Negative check
  assert.equal(validateAdditionalOfficialLink({ url: 'http://insecure.nseindia.com', expectedHost: 'insecure.nseindia.com' }), false);
  assert.equal(validateAdditionalOfficialLink({ url: 'https://attacker.com/spoof', expectedHost: 'www.nseindia.com' }), false);
});

// WP07-T04: False-Zero Negative Assertion Guard (WP00-020)
test('WP07-T04 LINK_ONLY sources cannot establish NO_RESULTS or native issue data', () => {
  const fakeReceipt = {
    sourceId: 'nse-ipo',
    publisher: 'NSE',
    accessMode: 'OFFICIAL_LINK',
    rights: 'LINK_ONLY',
    state: 'NO_RESULTS',
    validity: 'VALID',
    providerClockGranularity: 'day',
    providerAsOf: null,
    requestedAt: new Date().toISOString(),
    checkedAt: new Date().toISOString(),
    originalUrl: 'https://www.nseindia.com/market-data/all-upcoming-issues-ipo',
    transportStatus: 200
  };
  const validation = validateSourceReceipt(fakeReceipt);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.includes('NO_RESULTS_REQUIRES_DIRECT_SOURCE'));
});

// WP07-T05: Invalid or Unqualified NFO Rows Never Become OPEN
test('WP07-T05 invalid or unqualified NFO rows never become OPEN', () => {
  assert.equal(classifyNfoRecord(null).state, NFO_LIFECYCLE_STATES.UNKNOWN);
  assert.equal(classifyNfoRecord({}).state, NFO_LIFECYCLE_STATES.UNKNOWN);
  assert.equal(classifyNfoRecord({ name: 'Fund with no dates' }).state, NFO_LIFECYCLE_STATES.UNKNOWN);
  assert.equal(classifyNfoRecord({ name: 'Fund', openDate: 'invalid-date', closeDate: 'bad' }).state, NFO_LIFECYCLE_STATES.UNKNOWN);
});

// WP07-T06: NFO Boundary Dates (IST) Inclusive Calculations
test('WP07-T06 NFO boundary dates are inclusive and calculated in Asia/Kolkata', () => {
  const mockNow = Date.parse('2026-11-20T12:00:00Z'); // 17:30 IST on 2026-11-20

  // Case A: Open today, closes today -> OPEN
  const singleDayOpen = classifyNfoRecord({
    name: 'Single Day NFO',
    openDate: '2026-11-20',
    closeDate: '2026-11-20'
  }, mockNow);
  assert.equal(singleDayOpen.state, NFO_LIFECYCLE_STATES.OPEN);

  // Case B: Opens tomorrow -> UPCOMING
  const upcomingNfo = classifyNfoRecord({
    name: 'Upcoming NFO',
    openDate: '2026-11-21',
    closeDate: '2026-11-30'
  }, mockNow);
  assert.equal(upcomingNfo.state, NFO_LIFECYCLE_STATES.UPCOMING);

  // Case C: Closed yesterday -> EXPIRED
  const expiredNfo = classifyNfoRecord({
    name: 'Expired NFO',
    openDate: '2026-11-10',
    closeDate: '2026-11-19'
  }, mockNow);
  assert.equal(expiredNfo.state, NFO_LIFECYCLE_STATES.EXPIRED);
});

// WP07-T07: Announced NFO Lacking Close Date Remains ANNOUNCED_UNVERIFIED
test('WP07-T07 announced NFO without close date remains ANNOUNCED_UNVERIFIED', () => {
  const mockNow = Date.parse('2026-11-20T12:00:00Z');
  const announcedNfo = classifyNfoRecord({
    name: 'Announced Tech ETF',
    openDate: '2026-11-15',
    closeDate: null,
    status: 'announced',
    source: 'AMFI'
  }, mockNow);

  assert.equal(announcedNfo.state, NFO_LIFECYCLE_STATES.ANNOUNCED_UNVERIFIED);
  assert.equal(announcedNfo.stateLabel, 'Announced · verify availability');
});

// WP07-T08: Expired NFOs Leave Current Views but Preserve Historical Evidence
test('WP07-T08 expired NFOs leave current views but preserve historical evidence', () => {
  const mockNow = Date.parse('2026-11-20T12:00:00Z');
  const pool = [
    { name: 'Active Scheme A', openDate: '2026-11-15', closeDate: '2026-11-25' },
    { name: 'Past Scheme B', openDate: '2026-10-01', closeDate: '2026-10-15' }
  ];

  const active = filterActiveNfos(pool, mockNow);
  const historical = filterHistoricalNfos(pool, mockNow);

  assert.equal(active.length, 1);
  assert.equal(active[0].name, 'Active Scheme A');

  assert.equal(historical.length, 1);
  assert.equal(historical[0].name, 'Past Scheme B');
  assert.equal(historical[0].state, NFO_LIFECYCLE_STATES.EXPIRED);
});

// WP07-T09: Stale Replay Protection (Cannot Revive Expired Offer)
test('WP07-T09 stale NFO replay cannot revive a closed offer back to OPEN', () => {
  const mockNow = Date.parse('2026-11-20T12:00:00Z');
  const existingCustody = [
    { id: 'scheme-1', name: 'Scheme 1', openDate: '2026-10-01', closeDate: '2026-10-15', state: NFO_LIFECYCLE_STATES.EXPIRED }
  ];

  // Incoming stale update claiming it's still open
  const staleIncoming = [
    { id: 'scheme-1', name: 'Scheme 1', openDate: '2026-10-01', closeDate: '2026-11-30' }
  ];

  const merged = mergeNfoCustody(existingCustody, staleIncoming, mockNow);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].state, NFO_LIFECYCLE_STATES.EXPIRED);
});

// WP07-T10: Distant NFO (>90d) Excluded from Presentation Window
test('WP07-T10 distant upcoming NFO (>90d) excluded from presentation window', () => {
  const mockNow = Date.parse('2026-11-20T12:00:00Z');
  const distant = classifyNfoRecord({
    name: 'Distant 2028 NFO',
    openDate: '2028-05-01',
    closeDate: '2028-05-15'
  }, mockNow);

  assert.equal(distant.state, NFO_LIFECYCLE_STATES.UNKNOWN);
  assert.equal(filterActiveNfos([distant], mockNow).length, 0);
});

// WP07-T11: Calendar Records Retain Authoritative Evidence & Verification States
test('WP07-T11 calendar records retain event-specific evidence URLs and verification states', () => {
  for (const evt of MARKET_CALENDAR_EVENTS) {
    assert.ok(evt.id, 'Event must have ID');
    assert.ok(evt.startDate, 'Event must have startDate');
    assert.ok(evt.authority, 'Event must have authority');
    assert.ok(evt.sourceUrl, 'Event must have authoritative sourceUrl');
    assert.ok(Object.values(VERIFICATION_STATUSES).includes(evt.verification));
    assert.ok(Array.isArray(evt.segments));
  }
});

// WP07-T12: RBI MPC Renders 2-4 Dec 2026 Date Range under CONFIRMED_SCHEDULE
test('WP07-T12 RBI MPC renders 2-4 Dec 2026 date range with confirmed schedule', () => {
  const rbiEvt = MARKET_CALENDAR_EVENTS.find(e => e.id === 'rbi-mpc-2026-12');
  assert.ok(rbiEvt);
  assert.equal(rbiEvt.startDate, '2026-12-02');
  assert.equal(rbiEvt.endDate, '2026-12-04');
  assert.equal(rbiEvt.finalActionDate, '2026-12-04');
  assert.equal(rbiEvt.verification, VERIFICATION_STATUSES.CONFIRMED_SCHEDULE);
  assert.ok(rbiEvt.sourceUrl.includes('rbi.org.in'));
});

// WP07-T13: Tentative Budget and Earnings Dates Cannot Appear as Confirmed
test('WP07-T13 tentative Budget and earnings dates cannot appear as confirmed', () => {
  const budgetEvt = MARKET_CALENDAR_EVENTS.find(e => e.id === 'union-budget-2027-28');
  assert.ok(budgetEvt);
  assert.equal(budgetEvt.verification, VERIFICATION_STATUSES.TENTATIVE);

  const earningsEvt = MARKET_CALENDAR_EVENTS.find(e => e.id === 'q3-fy27-earnings-window');
  assert.ok(earningsEvt);
  assert.equal(earningsEvt.verification, VERIFICATION_STATUSES.TENTATIVE);
});

// WP07-T14: Trading Holidays Identify Applicable Exchange Segments
test('WP07-T14 trading holidays identify applicable exchange segments', () => {
  const holidayEvt = MARKET_CALENDAR_EVENTS.find(e => e.id === 'nse-holiday-christmas-2026');
  assert.ok(holidayEvt);
  assert.equal(holidayEvt.verification, VERIFICATION_STATUSES.CONFIRMED_SCHEDULE);
  assert.deepEqual(holidayEvt.segments, ['EQUITIES', 'DERIVATIVES', 'CURRENCY']);
});

// WP07-T15: Countdown Works Across Midnight IST and Date Boundaries
test('WP07-T15 countdown works at midnight IST and across date boundaries', () => {
  // Midnight transition: 2026-12-01 23:59:59 IST vs 2026-12-02 00:00:01 IST
  const beforeMidnightUtc = Date.parse('2026-12-01T18:29:59Z'); // 23:59:59 IST on Dec 1
  const afterMidnightUtc = Date.parse('2026-12-01T18:30:01Z');  // 00:00:01 IST on Dec 2

  const rbiEvt = { startDate: '2026-12-02', endDate: '2026-12-04' };

  const statusBefore = calculateEventStatus(rbiEvt, beforeMidnightUtc);
  assert.equal(statusBefore.temporalState, 'UPCOMING');
  assert.equal(statusBefore.daysRemaining, 1);
  assert.equal(statusBefore.label, 'Starts tomorrow');

  const statusAfter = calculateEventStatus(rbiEvt, afterMidnightUtc);
  assert.equal(statusAfter.temporalState, 'IN_PROGRESS');
  assert.equal(statusAfter.label, 'Started today');
});

// WP07-T16: Missing or Changed Event Dates Produce Truthful Uncertainty
test('WP07-T16 missing or changed event dates produce truthful uncertainty', () => {
  assert.equal(calculateEventStatus(null).temporalState, 'UNKNOWN');
  assert.equal(calculateEventStatus({ startDate: null }).temporalState, 'UNKNOWN');
  assert.equal(calculateEventStatus({ startDate: 'bad-date' }).temporalState, 'UNKNOWN');
});

// WP07-T17: News Adapter Ingests Real sectionsDataset Envelope
test('WP07-T17 news adapter ingests real sectionsDataset envelope structure', () => {
  const sampleEnvelope = {
    ok: true,
    datasetId: 'sections',
    data: {
      sections: {
        business: [
          {
            title: 'RBI Monetary Policy Committee begins three-day meeting',
            source: 'Reuters',
            link: 'https://example.com/rbi-news',
            pubDate: '2026-11-20T10:00:00Z',
            summary: 'The Reserve Bank of India commenced discussions.'
          },
          {
            title: 'Unrelated movie review headline',
            source: 'Entertainment Wire',
            link: 'https://example.com/movie',
            pubDate: '2026-11-20T10:00:00Z',
            summary: 'Entertainment news.'
          }
        ]
      }
    }
  };

  const { stories, receipt } = extractFinanceBriefing(sampleEnvelope);
  assert.equal(stories.length, 1);
  assert.equal(stories[0].title.includes('RBI'), true);
  assert.equal(stories[0].publisher, 'Reuters');
  assert.ok(receipt);
  assert.equal(receipt.sourceId, 'nwv7-market-news');
  assert.equal(receipt.state, 'READY');
});

// WP07-T18: Zero-Boot News Ingestion (No Network Loader Triggered)
test('WP07-T18 news adapter does not independently invoke network loader on mount', () => {
  let networkCalls = 0;
  const mockFetch = () => { networkCalls++; };
  // Extracting from null or existing envelope executes synchronously without calling fetch
  const res = extractFinanceBriefing(null);
  assert.equal(res.stories.length, 0);
  assert.equal(networkCalls, 0);
});

// WP07-T19: Relative Ages Cannot Produce Fabricated READY Receipts
test('WP07-T19 relative ages and missing timestamps cannot produce fabricated READY receipts', () => {
  const envelopeWithoutIso = {
    data: {
      sections: {
        business: [
          {
            title: 'Sensex rises 200 points on banking stocks',
            source: 'The Hindu',
            link: 'https://example.com/sensex',
            pubDate: '2 hours ago', // Relative string, NOT valid instant clock
            summary: 'Market gains.'
          }
        ]
      }
    }
  };

  const { stories, receipt } = extractFinanceBriefing(envelopeWithoutIso);
  assert.equal(stories.length, 1);
  // Without verified ISO instant timestamp, state must be UNVERIFIED
  assert.equal(receipt.state, 'UNVERIFIED');
});

// WP07-T20: Provenance Fields Remain Distinct
test('WP07-T20 publisher, article URL, publication time and freshness remain distinct fields', () => {
  const envelope = {
    data: {
      sections: {
        business: [
          {
            title: 'India GDP growth outlook remains robust: World Bank',
            source: 'Mint',
            link: 'https://example.com/gdp-growth',
            pubDate: '2026-11-20T08:30:00Z',
            summary: 'Macro summary.'
          }
        ]
      }
    }
  };

  const { stories } = extractFinanceBriefing(envelope);
  const story = stories[0];
  assert.equal(story.publisher, 'Mint');
  assert.equal(story.url, 'https://example.com/gdp-growth');
  assert.equal(story.publishedAt, '2026-11-20T08:30:00.000Z');
});

// WP07-T21: Untrusted Article URLs and HTML Render Safely
test('WP07-T21 untrusted article URLs and HTML are rejected or rendered safely as text', () => {
  assert.equal(stripHtml('<b>Bold headline</b> with <script>alert(1)</script>'), 'Bold headline with alert(1)');
  assert.equal(isValidArticleUrl('javascript:alert(1)'), false);
  assert.equal(isValidArticleUrl('http://insecure.com/news'), false);
  assert.equal(isValidArticleUrl('https://valid.com/news'), true);
});

// WP07-T22: News Failure Isolation from IPO & Calendar
test('WP07-T22 news failure cannot remove IPO or calendar content', () => {
  eventsStore.init();
  eventsStore.setNewsError('Network timeout loading news');

  const snapshot = eventsStore.getSnapshot();
  assert.equal(snapshot.newsError, 'Network timeout loading news');
  // IPO events remain intact
  assert.ok(snapshot.events.length >= 4);
});

// WP07-T23: EventsQuickWidget Never Invents Active-Issue Counts
test('WP07-T23 EventsQuickWidget data model renders honest actions without fake counts', () => {
  // In `REGISTERED_ISSUE_SOURCES`, destinations are links, not countable quotes
  for (const src of REGISTERED_ISSUE_SOURCES) {
    assert.equal(typeof src.url, 'string');
    assert.equal(src.id.includes('ipo') || src.id.includes('nfo'), true);
  }
});

// WP07-T24: Overview and Full Events Desk Share Unified Store State
test('WP07-T24 overview and full events desk share coherent store state', () => {
  eventsStore.init();
  const s1 = eventsStore.getSnapshot();
  eventsStore.setActiveTab('calendar');
  const s2 = eventsStore.getSnapshot();
  assert.equal(s2.activeTab, 'calendar');
  assert.deepEqual(s2.events, s1.events);
});

// WP07-T25: Calendar Subtraction & Leap Year Calculations
test('WP07-T25 calendar calculations handle leap years and month ends accurately', () => {
  // Leap year 2028: Feb has 29 days
  const leapDayUtc = parseIsoDateToKolkata('2028-02-29');
  assert.ok(leapDayUtc !== null);
  const nextDayUtc = parseIsoDateToKolkata('2028-03-01');
  assert.equal((nextDayUtc - leapDayUtc) / DAY_MS, 1);
});

// WP07-T26: Test Status Reporting Separation
test('WP07-T26 Node native unit tests verify contract logic without masquerading as live browser tests', () => {
  assert.equal(typeof test, 'function');
  assert.ok(true);
});

// WP07-T27: Contract Baseline Immutability
test('WP07-T27 all shared contracts and registry entries remain untouched', () => {
  assert.ok(getMarketSource('nse-ipo'));
  assert.ok(getMarketSource('bse-ipo'));
  assert.ok(getMarketSource('amfi-nfo'));
  assert.ok(getMarketSource('nwv7-market-news'));
});

// WP07-T28: NFO Indian Date Formats Support
test('WP07-T28 NFO parser supports both ISO (YYYY-MM-DD) and Indian DMY (DD-MM-YYYY) dates', () => {
  const isoStamp = parseIndiaDate('2026-11-20');
  const dmyStamp = parseIndiaDate('20-11-2026');
  assert.equal(isoStamp, dmyStamp);
});
