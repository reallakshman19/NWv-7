export const MARKET_TRADING_HOLIDAY_CALENDAR = {
    2024: [
        '2024-01-22', '2024-01-26', '2024-03-08', '2024-03-25', '2024-03-29',
        '2024-04-11', '2024-04-17', '2024-05-01', '2024-05-20', '2024-06-17',
        '2024-07-17', '2024-08-15', '2024-10-02', '2024-11-01', '2024-11-15',
        '2024-12-25',
    ],
    2025: [
        '2025-02-26', '2025-03-14', '2025-03-31', '2025-04-10', '2025-04-14',
        '2025-04-18', '2025-05-01', '2025-08-15', '2025-10-02', '2025-10-20',
        '2025-11-05', '2025-12-25',
    ],
    2026: [
        '2026-01-26', '2026-03-04', '2026-04-03', '2026-05-01',
        '2026-10-02', '2026-12-25',
    ],
};

export function buildTradingHolidayList(calendar = MARKET_TRADING_HOLIDAY_CALENDAR) {
    return Object.keys(calendar)
        .sort()
        .flatMap((year) => calendar[year]);
}

export function getMaintainedTradingHolidayYears(calendar = MARKET_TRADING_HOLIDAY_CALENDAR) {
    return Object.keys(calendar).map(Number).sort((a, b) => a - b);
}

export const DEFAULT_MARKET_SETTINGS = {
    showIndices: true,
    showGlobalIndices: false,
    showGainers: true,
    showLosers: true,
    showSectorals: true,
    showCommodities: true,
    showCurrency: true,
    showMutualFunds: true,
    showIPO: true,
    showFIIDII: true,
    showMarketHealth: true,
    tradingHolidayYears: getMaintainedTradingHolidayYears(),
    tradingHolidays: buildTradingHolidayList(),
};


/**
 * The active Market page has exactly these visibility consumers. Legacy
 * toggles (e.g. showCommodities) remain stored but are not shown as working UI.
 * Cache duration and layoutVariant were inert; migrate them away rather than
 * implying that they control quote validity or data-provider minimum refresh.
 */
export const MARKET_VISIBILITY_CONTROLS = Object.freeze([
    { key: 'showIndices', label: 'India indices' },
    { key: 'showGlobalIndices', label: 'Global indices' },
    { key: 'showSectorals', label: 'Sector indices' },
    { key: 'showMutualFunds', label: 'Funds' },
    { key: 'showCurrency', label: 'OMR / INR currency converter' },
    { key: 'showIPO', label: 'IPO / FPO schedules' },
]);

const validCalendarDate = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const utc = new Date(Date.UTC(year, month - 1, day));
    return utc.getUTCFullYear() === year && utc.getUTCMonth() + 1 === month && utc.getUTCDate() === day;
};

export function normalizeMarketSettings(source = {}) {
    const raw = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
    const settings = { ...DEFAULT_MARKET_SETTINGS, ...raw };
    // These old fields had no consumers; never extend acquisition/cache validity.
    delete settings.cacheMinutes;
    delete settings.layoutVariant;
    for (const { key } of MARKET_VISIBILITY_CONTROLS) {
        settings[key] = typeof raw[key] === 'boolean' ? raw[key] : DEFAULT_MARKET_SETTINGS[key];
    }
    const custom = Array.isArray(raw.tradingHolidays) ? raw.tradingHolidays : DEFAULT_MARKET_SETTINGS.tradingHolidays;
    settings.tradingHolidays = [...new Set(custom.filter(validCalendarDate))].slice(0, 512);
    settings.tradingHolidayYears = Array.isArray(raw.tradingHolidayYears)
        ? [...new Set(raw.tradingHolidayYears.filter(year => Number.isInteger(year) && year >= 2020 && year <= 2100))]
        : DEFAULT_MARKET_SETTINGS.tradingHolidayYears;
    return settings;
}
