import { getWeatherLocation } from './weatherLocations.js';

export const TRAVEL_LOCATION_PROFILE_VERSION = 'travel-location-profile-v1-colombo';

export const TRAVEL_LOCATION_REGISTRY = {
  colombo: {
    key: 'colombo',
    display: 'Colombo',
    countryCode: 'LK',
    countryLabel: 'Sri Lanka',
    regionLabel: 'Western Province',
    icon: '🇱🇰',
    lat: 6.9271,
    lon: 79.8612,
    cityKeywords: ['colombo', 'columbo', 'kolamba'],
    aliases: [
      'colombo',
      'columbo',
      'kolamba',
      'sri lanka',
      'srilanka',
      'ceylon',
      'western province',
      'lk',
      'sri lanka capital',
    ],
    storyKeywords: [
      'colombo',
      'columbo',
      'sri lanka',
      'srilanka',
      'ceylon',
      'western province',
      'lk',
      'sri lankan',
      'lankan',
    ],
    edition: {
      country: 'LK',
      lang: 'en',
      timeRange: '30d',
    },
  },

  chennai: {
    key: 'chennai',
    display: 'Chennai',
    countryCode: 'IN',
    countryLabel: 'India',
    regionLabel: 'Tamil Nadu',
    icon: '🇮🇳',
    lat: 13.0827,
    lon: 80.2707,
    cityKeywords: ['chennai', 'madras', 'சென்னை'],
    aliases: ['chennai', 'madras', 'tamil nadu', 'tn', 'சென்னை'],
    storyKeywords: ['chennai', 'madras', 'tamil nadu', 'tn', 'india', 'சென்னை', 'தமிழ்நாடு'],
    edition: {
      country: 'IN',
      lang: 'en',
      timeRange: '30d',
    },
  },

  trichy: {
    key: 'trichy',
    display: 'Trichy',
    countryCode: 'IN',
    countryLabel: 'India',
    regionLabel: 'Tamil Nadu',
    icon: '🇮🇳',
    lat: 10.7905,
    lon: 78.7047,
    cityKeywords: ['trichy', 'tiruchirappalli', 'tiruchirapalli', 'tiruchi'],
    aliases: ['trichy', 'tiruchirappalli', 'tiruchirapalli', 'tiruchi'],
    storyKeywords: ['trichy', 'tiruchirappalli', 'tiruchirapalli', 'tiruchi', 'tamil nadu', 'india'],
    edition: {
      country: 'IN',
      lang: 'en',
      timeRange: '30d',
    },
  },

  muscat: {
    key: 'muscat',
    display: 'Muscat',
    countryCode: 'OM',
    countryLabel: 'Oman',
    regionLabel: 'Muscat Governorate',
    icon: '🇴🇲',
    lat: 23.5859,
    lon: 58.4059,
    cityKeywords: ['muscat', 'masqat', 'maskat', 'مسقط'],
    aliases: ['muscat', 'masqat', 'maskat', 'oman', 'مسقط'],
    storyKeywords: ['muscat', 'masqat', 'oman', 'omani', 'مسقط', 'عمان'],
    edition: {
      country: 'OM',
      lang: 'en',
      timeRange: '30d',
    },
  },
};

export const DEFAULT_TRAVEL_LOCATION_KEY = 'chennai';

// Prefetched local feeds currently cover the four dedicated registry cities.
// Other configured weather cities can still display matching aggregated news.
const WEATHER_COUNTRY_EDITION_CODES = {
  India: 'IN',
  Oman: 'OM',
  'Sri Lanka': 'LK',
  'United States': 'US',
  'United Kingdom': 'GB',
  Canada: 'CA',
  Australia: 'AU',
  Singapore: 'SG',
  UAE: 'AE',
};

function getWeatherCityTravelProfile(city) {
  const location = getWeatherLocation(city);
  if (!location) return null;

  const countryCode = WEATHER_COUNTRY_EDITION_CODES[location.country] || 'ZZ';
  return {
    key: location.key,
    display: location.display,
    countryCode,
    countryLabel: location.country,
    regionLabel: location.region,
    icon: location.icon,
    lat: location.lat,
    lon: location.lon,
    aliases: location.aliases || [],
    cityKeywords: [location.display, ...(location.aliases || [])],
    storyKeywords: [location.display, ...(location.aliases || [])],
    edition: { country: countryCode, lang: 'en', timeRange: '30d' },
    hasDedicatedLocalFeed: false,
  };
}

function safeLocalStorageGet(key) {
  try {
    if (typeof localStorage === 'undefined') return '';
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

export function normalizeTravelLocation(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[\u064b-\u065f\u0670]/g, '')
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, ' ')
    .replace(/\s+/g, ' ');
}

export function resolveTravelLocationKey(value) {
  const normalized = normalizeTravelLocation(value);
  if (!normalized) return null;

  if (TRAVEL_LOCATION_REGISTRY[normalized]) return normalized;

  for (const [key, profile] of Object.entries(TRAVEL_LOCATION_REGISTRY)) {
    const aliases = [profile.key, profile.display, profile.countryLabel, ...(profile.aliases || [])]
      .map(normalizeTravelLocation);

    if (aliases.includes(normalized)) return key;
    // Accept 'Muscat, Oman' but not substrings such as 'milk' -> 'lk'.
    const parts = String(value || '').split(',').map(normalizeTravelLocation);
    if (parts.length === 2 && aliases.includes(parts[0]) &&
        [profile.countryLabel, profile.regionLabel].map(normalizeTravelLocation).includes(parts[1])) return key;
  }

  // Weather locations beyond the dedicated travel feed cities are allowed;
  // they use aggregated headline matching rather than an invented local feed.
  return getWeatherLocation(value)?.key || null;
}

export function getTravelLocationOptions() {
  return Object.values(TRAVEL_LOCATION_REGISTRY)
    .map(profile => ({
      key: profile.key,
      label: profile.display,
      country: profile.countryLabel,
      region: profile.regionLabel,
      icon: profile.icon,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function buildTravelLocationSettings(baseSettings = {}, patch = {}) {
  const rawCity = patch.city ?? patch.location ?? baseSettings?.travelLocation?.city;
  const city = resolveTravelLocationKey(rawCity) || DEFAULT_TRAVEL_LOCATION_KEY;

  return {
    ...baseSettings,
    travelLocation: {
      enabled: true,
      prioritizeStories: true,
      ...(baseSettings.travelLocation || {}),
      ...patch,
      city,
      profileVersion: TRAVEL_LOCATION_PROFILE_VERSION,
    },
  };
}

// Called from Quick Weather when the user actively selects a weather city.
// Preserve unrelated settings and local-news visibility preferences.
export function buildWeatherSelectedNewsSettings(baseSettings = {}, selectedCity) {
  const city = resolveTravelLocationKey(selectedCity);
  if (!city) return baseSettings;

  return {
    ...baseSettings,
    weather: {
      ...(baseSettings.weather || {}),
      activeCity: city,
    },
    // Preserve the independent saved travel city: Main-page news follows
    // weather.activeCity through an explicit ViewModel input.
  };
}

export function getTravelLocationProfile(settings = {}, options = {}) {
  const explicitCity = settings?.travelLocation?.city;
  const weatherActiveCity =
    options.activeWeatherCity ||
    settings?.weather?.activeCity ||
    safeLocalStorageGet('weather_active_city');

  const firstConfiguredWeatherCity = Array.isArray(settings?.weather?.cities)
    ? settings.weather.cities[0]
    : '';

  const selectedWeatherKey = resolveTravelLocationKey(options.activeWeatherCity);
  const key =
    selectedWeatherKey ||
    resolveTravelLocationKey(explicitCity) ||
    resolveTravelLocationKey(weatherActiveCity) ||
    resolveTravelLocationKey(firstConfiguredWeatherCity) ||
    DEFAULT_TRAVEL_LOCATION_KEY;

  const registryProfile = TRAVEL_LOCATION_REGISTRY[key] || getWeatherCityTravelProfile(key) || TRAVEL_LOCATION_REGISTRY[DEFAULT_TRAVEL_LOCATION_KEY];

  const enabled = settings?.travelLocation?.enabled !== false;
  const prioritizeStories = enabled && settings?.travelLocation?.prioritizeStories !== false;

  return {
    ...registryProfile,
    enabled,
    prioritizeStories,
    hasDedicatedLocalFeed: Boolean(TRAVEL_LOCATION_REGISTRY[key]),
    source: selectedWeatherKey
      ? 'quick-weather'
      : explicitCity
        ? 'manual'
      : weatherActiveCity
        ? 'weather-active-city'
        : firstConfiguredWeatherCity
          ? 'weather-config'
          : 'default',
    profileVersion: TRAVEL_LOCATION_PROFILE_VERSION,
  };
}

export function getTravelEditionOptions(profile) {
  const resolved = profile?.key ? profile : getTravelLocationProfile({});
  return {
    country: resolved.edition?.country || resolved.countryCode || 'IN',
    lang: resolved.edition?.lang || 'en',
    timeRange: resolved.edition?.timeRange || '30d',
  };
}

export function isTravelLocationProfile(value) {
  return Boolean(value?.key && value?.countryCode && Array.isArray(value?.storyKeywords));
}
