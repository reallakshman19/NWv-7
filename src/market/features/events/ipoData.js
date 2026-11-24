/**
 * NWv7 Market Desk R2.1 - WP-07 IPO & Market Events Data Layer
 * Models official registered primary issue portals, additional verified official links,
 * structured financial event calendar with verification states, and Asia/Kolkata date math.
 */

export const IST_OFFSET_MS = 19800000; // 5 hours 30 minutes in milliseconds
export const DAY_MS = 86400000;

// 1. WP-00 Registered Sources (Strictly verified against sourceRegistry.js)
export const REGISTERED_ISSUE_SOURCES = Object.freeze([
  {
    id: 'nse-ipo',
    title: 'NSE Public Issues (IPO/FPO)',
    description: 'Upcoming and current public issues, book-building status, and offer documents.',
    url: 'https://www.nseindia.com/market-data/all-upcoming-issues-ipo',
    publisher: 'NSE'
  },
  {
    id: 'bse-ipo',
    title: 'BSE IPO Issues Desk',
    description: 'Current IPOs, SME platform public issues, and bidding statistics.',
    url: 'https://www.bseindia.com/markets/PublicIssues/IPOIssues_new.aspx',
    publisher: 'BSE'
  },
  {
    id: 'amfi-nfo',
    title: 'AMFI New Fund Offers',
    description: 'Mutual fund new fund offer schedules and launch documents.',
    url: 'https://www.amfiindia.com/',
    publisher: 'AMFI'
  }
]);

// 2. Additional Verified External Navigation Links (Validated HTTPS & Whitelisted Host)
export const ADDITIONAL_OFFICIAL_LINKS = Object.freeze([
  {
    id: 'nse-issue-advertisements',
    title: 'NSE Public Issue Advertisements',
    description: 'Statutory corporate advertisements, price bands, and allotment notices.',
    url: 'https://www.nseindia.com/companies-listing/corporate-public-issue-advertisements',
    expectedHost: 'www.nseindia.com'
  },
  {
    id: 'sebi-drhp',
    title: 'SEBI Draft Red Herring Prospectus (DRHP)',
    description: 'Draft offer documents and regulatory filings submitted to SEBI.',
    url: 'https://www.sebi.gov.in/filings/public-issues.html',
    expectedHost: 'www.sebi.gov.in'
  }
]);

// 3. Financial Calendar Event Verification States
export const VERIFICATION_STATUSES = Object.freeze({
  CONFIRMED_SCHEDULE: 'CONFIRMED_SCHEDULE', // Supported by official event-specific announcement
  TENTATIVE: 'TENTATIVE',                   // Expected date or seasonal estimate
  UNVERIFIED: 'UNVERIFIED',                 // Record exists but lacks direct official citation
  SUPERSEDED: 'SUPERSEDED',                 // Replaced by a revised official notice
  CANCELLED: 'CANCELLED'                    // Formally cancelled by authority
});

export const EVENT_CATEGORIES = Object.freeze(['ALL', 'POLICY', 'HOLIDAY', 'EARNINGS']);

// 4. Structured Market Calendar Events
export const MARKET_CALENDAR_EVENTS = Object.freeze([
  {
    id: 'rbi-mpc-2026-12',
    category: 'POLICY',
    title: 'RBI Monetary Policy Committee (MPC) Meeting',
    startDate: '2026-12-02',
    endDate: '2026-12-04',
    finalActionDate: '2026-12-04',
    timeZone: 'Asia/Kolkata',
    verification: VERIFICATION_STATUSES.CONFIRMED_SCHEDULE,
    authority: 'Reserve Bank of India (RBI)',
    sourceUrl: 'https://www.rbi.org.in/Scripts/FS_PressRelease.aspx?prid=62422',
    description: 'Bi-monthly monetary policy statement and policy repo rate announcement.',
    segments: ['ALL']
  },
  {
    id: 'nse-holiday-christmas-2026',
    category: 'HOLIDAY',
    title: 'Christmas — Market Trading Holiday',
    startDate: '2026-12-25',
    endDate: '2026-12-25',
    finalActionDate: '2026-12-25',
    timeZone: 'Asia/Kolkata',
    verification: VERIFICATION_STATUSES.CONFIRMED_SCHEDULE,
    authority: 'National Stock Exchange of India',
    sourceUrl: 'https://www.nseindia.com/resources/exchange-communication-trading-holidays',
    description: 'Trading closed across Equities, Equity Derivatives, and Currency Derivatives segments.',
    segments: ['EQUITIES', 'DERIVATIVES', 'CURRENCY']
  },
  {
    id: 'q3-fy27-earnings-window',
    category: 'EARNINGS',
    title: 'Q3 FY27 Corporate Earnings Season Kickoff (Tentative)',
    startDate: '2027-01-12',
    endDate: '2027-02-15',
    finalActionDate: null,
    timeZone: 'Asia/Kolkata',
    verification: VERIFICATION_STATUSES.TENTATIVE,
    authority: 'BSE/NSE Corporate Filings Registry',
    sourceUrl: 'https://www.bseindia.com/corporates/ann.html',
    description: 'Tentative quarterly earnings reporting window; individual company board meeting dates subject to official corporate announcements.',
    segments: ['EQUITIES']
  },
  {
    id: 'union-budget-2027-28',
    category: 'POLICY',
    title: 'Union Budget 2027–28 Presentation (Expected)',
    startDate: '2027-02-01',
    endDate: '2027-02-01',
    finalActionDate: '2027-02-01',
    timeZone: 'Asia/Kolkata',
    verification: VERIFICATION_STATUSES.TENTATIVE,
    authority: 'Ministry of Finance, Government of India',
    sourceUrl: 'https://www.indiabudget.gov.in/',
    description: 'Expected presentation date for the Annual Financial Statement; parliamentary notification pending.',
    segments: ['ALL']
  }
]);

/**
 * Returns UTC timestamp for 00:00:00 IST of the calendar day corresponding to `now`.
 * @param {number} now 
 * @returns {number}
 */
export function getKolkataTodayMidnight(now = Date.now()) {
  return Math.floor((now + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS;
}

/**
 * Returns YYYY-MM-DD string for current day in Asia/Kolkata.
 * @param {number} now 
 * @returns {string}
 */
export function getKolkataIsoDate(now = Date.now()) {
  const d = new Date(now + IST_OFFSET_MS);
  return d.toISOString().slice(0, 10);
}

/**
 * Parses an ISO date string (YYYY-MM-DD) into UTC timestamp for 00:00:00 IST.
 * @param {string} isoDate 
 * @returns {number|null}
 */
export function parseIsoDateToKolkata(isoDate) {
  if (typeof isoDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return null;
  }
  const [year, month, day] = isoDate.split('-').map(Number);
  const utcStamp = Date.UTC(year, month - 1, day);
  const check = new Date(utcStamp);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return null;
  }
  return utcStamp - IST_OFFSET_MS;
}

/**
 * Computes temporal status and countdown for a calendar event in Asia/Kolkata.
 * @param {{ startDate: string, endDate: string }} event 
 * @param {number} now 
 * @returns {{ temporalState: string, daysRemaining: number, label: string, isOngoing: boolean, isPast: boolean }}
 */
export function calculateEventStatus(event, now = Date.now()) {
  if (event?.verification === VERIFICATION_STATUSES.CANCELLED || event?.verification === VERIFICATION_STATUSES.SUPERSEDED) {
    return {temporalState:event.verification,daysRemaining:0,label:event.verification === VERIFICATION_STATUSES.CANCELLED ? 'Cancelled' : 'Superseded by revised notice',isOngoing:false,isPast:false};
  }
  if (!event || !event.startDate || !Number.isFinite(now)) {
    return { temporalState: 'UNKNOWN', daysRemaining: 0, label: 'Date pending', isOngoing: false, isPast: false };
  }

  const todayMid = getKolkataTodayMidnight(now);
  const startStamp = parseIsoDateToKolkata(event.startDate);
  const endStamp = parseIsoDateToKolkata(event.endDate || event.startDate);

  if (startStamp === null || endStamp === null || endStamp < startStamp) {
    return { temporalState: 'UNKNOWN', daysRemaining: 0, label: 'Invalid date', isOngoing: false, isPast: false };
  }

  const diffDaysToStart = Math.round((startStamp - todayMid) / DAY_MS);
  const diffDaysToEnd = Math.round((endStamp - todayMid) / DAY_MS);

  // Future event
  if (diffDaysToStart > 0) {
    const label = diffDaysToStart === 1 ? 'Starts tomorrow' : `Starts in ${diffDaysToStart} days`;
    return {
      temporalState: 'UPCOMING',
      daysRemaining: diffDaysToStart,
      label,
      isOngoing: false,
      isPast: false
    };
  }

  // Ongoing / in progress event
  if (diffDaysToStart <= 0 && diffDaysToEnd >= 0) {
    const isSingleDay = event.startDate === (event.endDate || event.startDate);
    let label = 'In progress';
    if (isSingleDay) {
      label = 'Today';
    } else if (diffDaysToEnd === 0) {
      label = 'Final day today';
    } else if (diffDaysToStart === 0) {
      label = 'Started today';
    }
    return {
      temporalState: 'IN_PROGRESS',
      daysRemaining: diffDaysToEnd,
      label,
      isOngoing: true,
      isPast: false
    };
  }

  // Past event
  const daysAgo = Math.abs(diffDaysToEnd);
  const label = daysAgo === 1 ? 'Ended yesterday' : `Ended ${daysAgo} days ago`;
  return {
    temporalState: 'ENDED',
    daysRemaining: -daysAgo,
    label,
    isOngoing: false,
    isPast: true
  };
}

/**
 * Validates additional official external link security and protocol.
 * @param {{ url: string, expectedHost: string }} link 
 * @returns {boolean}
 */
export function validateAdditionalOfficialLink(link) {
  if (!link || typeof link.url !== 'string' || typeof link.expectedHost !== 'string') {
    return false;
  }
  try {
    const parsed = new URL(link.url);
    return parsed.protocol === 'https:' &&
      parsed.hostname === link.expectedHost &&
      !parsed.username &&
      !parsed.password;
  } catch {
    return false;
  }
}
