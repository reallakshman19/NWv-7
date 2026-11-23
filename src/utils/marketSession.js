import { MARKET_TRADING_HOLIDAY_CALENDAR, NSE_CAPITAL_MARKET_CALENDAR_AUTHORITY } from '../config/settings_market.js';
const MARKET_TIME_ZONE = 'Asia/Kolkata';
const MARKET_OPEN_MINUTES = 9 * 60 + 15;
const MARKET_CLOSE_MINUTES = 15 * 60 + 30;

function getIstParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: MARKET_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).formatToParts(date);

    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return {
        year: Number(map.year),
        month: Number(map.month),
        day: Number(map.day),
        weekday: map.weekday,
        hour: Number(map.hour),
        minute: Number(map.minute)
    };
}

function buildIstDateKey(parts) {
    return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function normalizeHolidayList(tradingHolidays = []) {
    const holidays = (Array.isArray(tradingHolidays) ? tradingHolidays : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean);

    return {
        holidaySet: new Set(holidays),
        holidayYears: new Set(
            holidays
                .map((value) => Number(value.slice(0, 4)))
                .filter(Number.isFinite)
        ),
    };
}

function parseTimestamp(value) {
    const timestamp = typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN;
    return Number.isFinite(timestamp) && timestamp > 0 && timestamp <= 8.64e15 ? timestamp : null;
}

export function getMarketQuoteAt(row) {
    if (isMarketSeedRow(row)) return null;
    const quoteAt = parseTimestamp(row?.quoteAt);
    // Older Yahoo client rows used collection time when the provider omitted its quote time.
    if (String(row?.sourceProvider || '').startsWith('yahoo-')) return quoteAt;
    return quoteAt ?? parseTimestamp(row?.timestamp);
}

export function getOldestMarketQuoteAt(rows) {
    const timestamps = (Array.isArray(rows) ? rows : []).map(getMarketQuoteAt).filter(timestamp => timestamp !== null);
    return timestamps.length > 0 ? Math.min(...timestamps) : null;
}

export function formatMarketTimestamp(value) {
    const timestamp = parseTimestamp(value);
    if (timestamp === null) return null;

    return `${new Date(timestamp).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: MARKET_TIME_ZONE,
    })} IST`;
}

export function isUsableMarketQuoteRow(row) {
    if (typeof row?.name !== 'string' || !row.name.trim() || isMarketSeedRow(row)) return false;
    const { value } = row;
    if (typeof value === 'number') return Number.isFinite(value) && value > 0;
    if (typeof value !== 'string') return false;
    const digits = value.trim().replace(/^[$₹]\s*/, '');
    if (!/^(?:\d+|\d{1,3}(?:,\d{2,3})*,\d{3})(?:\.\d+)?$/.test(digits)) return false;
    const price = Number(digits.replaceAll(',', ''));
    return Number.isFinite(price) && price > 0;
}

export function isMarketSeedRow(row) {
    return [row?.sourceMode, row?.source, row?.sourceProvider].some(source => (
        typeof source === 'string' && source.toLowerCase() === 'seed'
    ));
}

export function formatMarketQuote(row, sourceMode) {
    const rowSource = String(row?.sourceMode || row?.sourceProvider || row?.source || '').toLowerCase();
    const timestamp = formatMarketTimestamp(getMarketQuoteAt(row));
    if (isMarketSeedRow(row) || sourceMode === 'seed') return 'Seed data';
    if (rowSource.includes('daily') || rowSource.startsWith('yahoo-chart') || rowSource === 'yahoo-yfinance') {
        return timestamp ? `Daily · ${timestamp}` : 'Daily · quote time unavailable';
    }
    return timestamp ? `Quote as of ${timestamp}` : 'Quote time unavailable';
}

export function getMarketSessionState({
    now = new Date(),
    quoteAt = null,
    tradingHolidays = []
} = {}) {
    const parts = getIstParts(now);
    const currentMinutes = parts.hour * 60 + parts.minute;
    const isWeekend = parts.weekday === 'Sat' || parts.weekday === 'Sun';
    const { holidaySet, holidayYears } = normalizeHolidayList(tradingHolidays);
    const todayKey = buildIstDateKey(parts);
    const official = NSE_CAPITAL_MARKET_CALENDAR_AUTHORITY[parts.year];
    const officialDays = official ? MARKET_TRADING_HOLIDAY_CALENDAR[parts.year] || [] : [];
    const verifiedHolidayYear = Boolean(
        official && officialDays.length === official.weekdayHolidayCount &&
        new Set(officialDays).size === official.weekdayHolidayCount
    );
    // Source authority must not depend on old persisted user settings. The
    // built-in NSE closures remain effective when legacy settings omit them.
    const isOfficialHoliday = verifiedHolidayYear && officialDays.includes(todayKey);
    const isUserListedHoliday = holidaySet.has(todayKey);
    const isHoliday = isOfficialHoliday || isUserListedHoliday;

    const timestamp = parseTimestamp(quoteAt);
    const ageMinutes = timestamp !== null && timestamp <= now.getTime()
        ? Math.floor((now.getTime() - timestamp) / 60000)
        : null;

    const ageLabel = ageMinutes === null
        ? '--'
        : ageMinutes < 60
            ? `${ageMinutes}m ago`
            : `${Math.round(ageMinutes / 60)}h ago`;

    const holidayCalendarStatus = verifiedHolidayYear
        ? 'nse_circular_verified_list_live_status_unverified'
        : holidayYears.has(parts.year)
            ? 'listed_year_completeness_unverified'
            : 'unknown_year_weekday_rules';
    const baseState = {
        ageLabel,
        ageMinutes,
        holidayCalendarStatus,
        holidayCalendarYear: parts.year,
    };

    // NSE's 2026 special Muhurat Sunday session has a separately notified
    // timetable; Sunday alone does not prove the exchange is closed all day.
    if (official?.exceptionalSessionDates?.includes(todayKey)) {
        return {
            ...baseState,
            label: 'Special Session — verify NSE',
            tone: 'warning',
            reason: 'Muhurat Trading timetable not verified by this calendar',
            isOpen: null,
        };
    }

    if (isWeekend || isHoliday) {
        return {
            ...baseState,
            label: 'Closed (scheduled)',
            tone: 'muted',
            reason: isWeekend ? 'Weekend' : isOfficialHoliday
                ? 'NSE 2026 capital-market circular holiday' : 'Listed holiday (unverified)',
            isOpen: false,
        };
    }

    if (currentMinutes < MARKET_OPEN_MINUTES || currentMinutes > MARKET_CLOSE_MINUTES) {
        return {
            ...baseState,
            label: 'After Hours',
            tone: 'warning',
            reason: 'Outside NSE session',
            isOpen: false,
        };
    }

    // This is an indicative timetable, not exchange connectivity or a live
    // confirmation of trading, even when the official holiday list is complete.
    return {
        ...baseState,
        label: verifiedHolidayYear ? 'Scheduled NSE Hours' : 'Indicative NSE Hours',
        tone: verifiedHolidayYear ? 'muted' : 'warning',
        reason: verifiedHolidayYear
            ? 'Within the NSE 2026 regular timetable; live/exceptions not checked'
            : 'Within regular timetable; official holiday calendar unverified',
        isOpen: null,
    };
}
