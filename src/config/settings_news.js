export const DEFAULT_NEWS_SETTINGS = {
    hideOlderThanHours: 60,
    enableNewScoring: true,
    enableProximityScoring: false,
    maxTopicPercent: 40,
    maxGeoPercent: 30,
    topicSuggestions: { enabled: true, basedOnReadingHistory: true },
    enableCache: true,
    crawlerMode: 'auto'
};

export const MAX_NEWS_AGE_HOURS = 7 * 24;

export function resolveNewsAgeLimit(settings) {
    for (const value of [settings?.hideOlderThanHours, settings?.freshnessLimitHours]) {
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
            return Math.min(value, MAX_NEWS_AGE_HOURS);
        }
    }
    return DEFAULT_NEWS_SETTINGS.hideOlderThanHours;
}

export const DEFAULT_NEWSPAPER_SETTINGS = {
    enableImages: true,
    headlinesCount: 3,
    leadsCount: 6,
    briefsCount: 12
};
