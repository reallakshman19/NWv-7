/**
 * Multi-Model Weather Service
 * Static-host safe: prefer fresh complete cache, then live Open-Meteo for built-in cities,
 * then snapshot/stale cache as fallback.
 */
import {
    averageTemperature,
    averageApparentTemperature,
    getMostCommonWeatherCode,
    averagePrecipitation,
    averagePrecipitationProbability,
    weightedAverageMetric,
    getSuccessfulModels,
    formatModelNames
} from '../utils/multiModelUtils.js';
import { getSettings } from '../utils/storage.js';
import logStore from '../utils/logStore.js';
import { getWeatherIconId } from '../utils/weatherUtils.js';
import { getRuntimeCapabilities } from "../runtime/runtimeCapabilities.js";
import { toLocalDateKey } from '../utils/dateKey.js';
import { fetchWithTimeout } from '../utils/withTimeout.js';
import { isLiveMode } from '../utils/fetchMode.js';

const MODELS = {
    ecmwf: 'https://api.open-meteo.com/v1/ecmwf',
    gfs: 'https://api.open-meteo.com/v1/gfs',
    icon: 'https://api.open-meteo.com/v1/dwd-icon'
};

import { WEATHER_LOCATION_REGISTRY, getWeatherLocationLabel } from './weatherLocations.js';

// Canonical built-in locations derived from the central registry
const LOCATIONS = Object.fromEntries(
    Object.entries(WEATHER_LOCATION_REGISTRY).map(([k, v]) => [k, { lat: v.lat, lon: v.lon }])
);

export function getLocationLocalHour(locationName, now = new Date()) {
    const timezone = WEATHER_LOCATION_REGISTRY[locationName]?.timezone;

    if (!timezone) return now.getHours();

    try {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            hour: 'numeric',
            hour12: false
        }).formatToParts(now);
        const hour = Number(parts.find(part => part.type === 'hour')?.value);

        if (Number.isFinite(hour)) return hour % 24;
    } catch (error) {
        console.warn('[WeatherService] Failed to resolve location-local hour', {
            locationName,
            timezone,
            message: error?.message || String(error)
        });
    }

    return now.getHours();
}

const WEATHER_CACHE_PREFIX = 'weather_cache_v2_';
const LEGACY_WEATHER_CACHE_PREFIX = 'weather_cache_';
const WEATHER_CACHE_TTL_MS = 4 * 60 * 60 * 1000;
const WEATHER_DISPLAY_MAX_AGE_MS = 48 * 60 * 60 * 1000;

function isStaticHostRuntime() { return getRuntimeCapabilities().isStaticHost; }

function parseWeatherTimestamp(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function getWeatherPayloadTimestamp(payload) {
    return parseWeatherTimestamp(
        payload?.fetchedAt ||
        payload?.generatedAt ||
        payload?.generated_at ||
        payload?.timestamp
    );
}

function isWeatherPayloadDisplayable(payload, maxAgeMs = WEATHER_DISPLAY_MAX_AGE_MS, now = Date.now()) {
    const timestamp = getWeatherPayloadTimestamp(payload);
    if (!timestamp) return false;

    const age = now - timestamp;
    return age >= 0 && age <= maxAgeMs;
}

function hasHourlyForecast(payload) {
    return Boolean(
        payload &&
        ((Array.isArray(payload.hourly24) && payload.hourly24.length > 0) ||
         (Array.isArray(payload.next8Hours) && payload.next8Hours.length > 0) ||
         (Array.isArray(payload.morning?.hourly) && payload.morning.hourly.length > 0) ||
         (Array.isArray(payload.noon?.hourly) && payload.noon.hourly.length > 0) ||
         (Array.isArray(payload.evening?.hourly) && payload.evening.hourly.length > 0))
    );
}

function publicDataUrl(path) {
    const base = (import.meta.env.BASE_URL || './').replace(/\/?$/, '/');
    return `${base}${String(path).replace(/^\//, '')}`;
}

async function fetchWeatherSnapshot(locationKey) {
  try {
    const resp = await fetch(publicDataUrl('data/weather_snapshot.json'), { cache: 'no-cache' });
    if (!resp.ok) return null;
    const snapshot = await resp.json();
    const citySnapshot = snapshot?.[String(locationKey || '').toLowerCase()] || null;
    if (!isWeatherPayloadDisplayable(citySnapshot)) return null;
    return citySnapshot;
  } catch {
    return null;
  }
}

function readCachedWeather(locationKey, allowStale = true) {
    try {
        const read = (prefix) => {
            const raw = localStorage.getItem(`${prefix}${locationKey}`);
            return raw ? JSON.parse(raw) : null;
        };
        const parsed = read(WEATHER_CACHE_PREFIX) || read(LEGACY_WEATHER_CACHE_PREFIX);
        if (!parsed) return null;
        const age = Date.now() - (parsed?.fetchedAt || 0);
        if (!allowStale && age > WEATHER_CACHE_TTL_MS) return null;
        if (!isWeatherPayloadDisplayable(parsed, allowStale ? WEATHER_DISPLAY_MAX_AGE_MS : WEATHER_CACHE_TTL_MS)) return null;
        return parsed;
    } catch {
        return null;
    }
}

function writeCachedWeather(locationKey, payload) {
    try {
        localStorage.setItem(`${WEATHER_CACHE_PREFIX}${locationKey}`, JSON.stringify(payload));
    } catch {
        // ignore
    }
}

async function resolveLocation(cityName) {
    const key = String(cityName || '').toLowerCase();
    if (LOCATIONS[key]) return LOCATIONS[key];
    try {
        const cache = JSON.parse(localStorage.getItem('weather_geo_cache') || '{}');
        if (cache[key]) return cache[key];
    } catch {
        // ignore
    }

    if (isStaticHostRuntime()) {
        throw new Error(`Location not found in static-host mode: ${cityName}`);
    }

    const resp = await fetchWithTimeout(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=en&format=json`, { timeoutMs: 15000 });
    const data = await resp.json();
    if (data.results && data.results.length > 0) {
        const loc = { lat: data.results[0].latitude, lon: data.results[0].longitude };
        try {
            const cache = JSON.parse(localStorage.getItem('weather_geo_cache') || '{}');
            cache[key] = loc;
            localStorage.setItem('weather_geo_cache', JSON.stringify(cache));
        } catch {
            // ignore
        }
        return loc;
    }
    throw new Error(`Location not found: ${cityName}`);
}

async function fetchSingleModel(modelName, lat, lon) {
    const baseUrl = MODELS[modelName];
    if (!baseUrl) throw new Error(`Unknown model: ${modelName}`);
    const params = new URLSearchParams({
        latitude: lat,
        longitude: lon,
        current: 'temperature_2m,weather_code,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m',
        hourly: 'temperature_2m,precipitation_probability,precipitation,weather_code,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,uv_index,cloud_cover,visibility,dew_point_2m',
        daily: 'precipitation_probability_max,precipitation_sum,uv_index_max,temperature_2m_max,temperature_2m_min,apparent_temperature_max,relative_humidity_2m_mean,weather_code,wind_speed_10m_max',
        forecast_days: '7',
        timezone: 'auto'
    });
    const response = await fetchWithTimeout(`${baseUrl}?${params}`, { timeoutMs: 15000 });
    if (!response.ok) throw new Error(`${modelName.toUpperCase()} API request failed: ${response.status}`);
    return response.json();
}

export async function fetchWeather(locationKey) {
    const _t0 = Date.now();
    const key = String(locationKey || '').toLowerCase();
    const cacheFresh = readCachedWeather(key, false);
    const liveMode = isLiveMode();

    // Fresh, complete cache is OK. Fresh legacy/static cache without hourly data should not
    // block a live refresh for built-in cities, because it causes home QuickWeather to show
    // "No forecast" permanently.
    // In Live mode, skip cache/snapshot early-returns and always fetch from Open-Meteo.
    if (!liveMode && cacheFresh && hasHourlyForecast(cacheFresh)) return { ...cacheFresh, sourceMode: 'cache' };
    if (!liveMode && cacheFresh && !LOCATIONS[key]) return { ...cacheFresh, sourceMode: 'cache' };

    if (!liveMode && isStaticHostRuntime() && !LOCATIONS[key]) {
        const cached = readCachedWeather(key, true);
        if (cached) return { ...cached, sourceMode: 'cache' };

        const snapshot = await fetchWeatherSnapshot(key);
        if (snapshot) return { ...snapshot, sourceMode: 'snapshot' };

        return null;
    }

    let lat, lon;
    try {
        const coords = await resolveLocation(key);
        lat = coords.lat;
        lon = coords.lon;
    } catch {
        const cached = readCachedWeather(key, true);
        if (cached) return cached;
        throw new Error(`Unknown location: ${locationKey}`);
    }

    const settings = getSettings();
    const modelSettings = settings.weather?.models || { ecmwf: true, gfs: true, icon: true };
    const enabledModelNames = Object.keys(MODELS).filter(m => modelSettings[m] !== false);
    if (enabledModelNames.length === 0) enabledModelNames.push('ecmwf', 'gfs', 'icon');

    try {
        const results = await Promise.allSettled(enabledModelNames.map(model => fetchSingleModel(model, lat, lon)));
        const modelData = {};
        enabledModelNames.forEach((modelName, index) => {
            modelData[modelName] = results[index].status === 'fulfilled' ? results[index].value : null;
        });

        const successfulModels = getSuccessfulModels(modelData);
        if (successfulModels.length === 0) throw new Error('All weather models failed to fetch data');

        const processed = processMultiModelData(modelData, key);
        writeCachedWeather(key, processed);
        logStore.success('weather', `${key}: ${successfulModels.length}/${enabledModelNames.length} models OK`, { durationMs: Date.now() - _t0 });
        return processed;
    } catch (error) {
        const cached = readCachedWeather(key, true);
        if (cached && hasHourlyForecast(cached)) {
            return { ...cached, isStale: true };
        }

        const snapshot = await fetchWeatherSnapshot(key);
        if (snapshot) {
            return { ...snapshot, sourceMode: 'snapshot', isStale: true };
        }

        if (cached) {
            return { ...cached, isStale: true };
        }
        logStore.error('weather', `${key}: ${error.message}`, { durationMs: Date.now() - _t0 });
        throw error;
    }
}

function getDailyMetricRows(modelData, field, dayIndex) {
    return ['ecmwf', 'gfs', 'icon']
        .map(modelName => ({
            modelName,
            value: modelData?.[modelName]?.daily?.[field]?.[dayIndex],
        }))
        .filter(row => row.value != null && Number.isFinite(Number(row.value)));
}

function weightedDailyMetric(modelData, field, dayIndex, options = {}) {
    return weightedAverageMetric(getDailyMetricRows(modelData, field, dayIndex), 'value', options);
}

export function summarizePeriodRain(hourlySlots = []) {
    const valid = (Array.isArray(hourlySlots) ? hourlySlots : []).filter(Boolean);
    const probabilities = valid.map(slot => Number(slot?.prob)).filter(Number.isFinite);
    const precipitation = valid.map(slot => Number(slot?.precip)).filter(Number.isFinite);

    const peak = probabilities.length ? Math.max(...probabilities) : 0;
    const mean = probabilities.length
        ? Math.round(probabilities.reduce((sum, value) => sum + value, 0) / probabilities.length)
        : 0;
    const min = probabilities.length ? Math.min(...probabilities) : 0;
    const totalMm = Number(precipitation.reduce((sum, value) => sum + value, 0).toFixed(1));

    return {
        peak,
        mean,
        min,
        max: peak,
        totalMm,
        displayString: `${peak}% peak`,
        semantics: 'period_peak_hourly_consensus',
    };
}

export function buildPrecipitationReconciliation(dailyForecastMm, hourlyConsensusMm) {
    const daily = Number(dailyForecastMm);
    const hourly = Number(hourlyConsensusMm);
    if (!Number.isFinite(daily) || !Number.isFinite(hourly)) return null;

    const deltaMm = Number(Math.abs(daily - hourly).toFixed(1));
    const toleranceMm = Number(Math.max(0.5, daily * 0.15).toFixed(1));

    return {
        dailyForecastMm: Number(daily.toFixed(1)),
        hourlyConsensusMm: Number(hourly.toFixed(1)),
        deltaMm,
        toleranceMm,
        withinTolerance: deltaMm <= toleranceMm,
    };
}

function selectPeriodWeatherCode(hourlySlots, fallbackCode = 0) {
    const rain = summarizePeriodRain(hourlySlots);
    if (rain.peak < 30 && rain.totalMm < 0.5) return fallbackCode;

    const riskiest = [...(hourlySlots || [])]
        .filter(Boolean)
        .sort((a, b) => (
            (Number(b?.prob || 0) + Number(b?.precip || 0) * 15) -
            (Number(a?.prob || 0) + Number(a?.precip || 0) * 15)
        ))[0];

    return Number.isFinite(Number(riskiest?.weatherCode))
        ? Number(riskiest.weatherCode)
        : fallbackCode;
}

function processMultiModelData(modelData, locationName) {
    const currentData = ['ecmwf', 'gfs', 'icon']
        .map(modelName => modelData?.[modelName]?.current
            ? { ...modelData[modelName].current, modelName }
            : null)
        .filter(Boolean);
    const currentHourOfDay = getLocationLocalHour(locationName);
    const getIconForHour = (code, hour) => getWeatherIconId(code, hour ?? currentHourOfDay);
    const getIcon = (code) => { if (code <= 1) return '☀️'; if (code <= 3) return '⛅'; if (code <= 67) return '🌧️'; if (code <= 99) return '⛈️'; return '❓'; };
    const conditionMap = {
        0: 'Clear',
        1: 'Mainly Clear',
        2: 'Partly Cloudy',
        3: 'Overcast',
        45: 'Fog',
        48: 'Depositing Rime Fog',
        51: 'Light Drizzle',
        53: 'Moderate Drizzle',
        55: 'Dense Drizzle',
        56: 'Light Freezing Drizzle',
        57: 'Dense Freezing Drizzle',
        61: 'Light Rain',
        63: 'Rain',
        65: 'Heavy Rain',
        66: 'Light Freezing Rain',
        67: 'Heavy Freezing Rain',
        71: 'Light Snow',
        73: 'Snow',
        75: 'Heavy Snow',
        77: 'Snow Grains',
        80: 'Light Rain Showers',
        81: 'Rain Showers',
        82: 'Violent Rain Showers',
        85: 'Light Snow Showers',
        86: 'Heavy Snow Showers',
        95: 'Thunderstorm',
        96: 'Thunderstorm with Hail',
        99: 'Severe Thunderstorm with Hail'
    };
    const getCondition = (code) => {
        const normalizedCode = Number.isFinite(Number(code)) ? Number(code) : null;
        if (normalizedCode == null) return 'Forecast';
        return conditionMap[normalizedCode] || conditionMap[Math.round(normalizedCode)] || 'Forecast';
    };

    const allModelHourlyData = ['ecmwf', 'gfs', 'icon']
        .map(modelName => modelData?.[modelName]?.hourly
            ? { modelName, hourly: modelData[modelName].hourly }
            : null)
        .filter(Boolean);

    const getHourConsensus = (hourIdx) => {
        const pts = allModelHourlyData.map(({ modelName, hourly: h }) => ({
            modelName,
            temperature_2m: h.temperature_2m?.[hourIdx],
            apparent_temperature: h.apparent_temperature?.[hourIdx],
            precipitation: h.precipitation?.[hourIdx],
            precipitation_probability: h.precipitation_probability?.[hourIdx],
            weather_code: h.weather_code?.[hourIdx],
            relative_humidity_2m: h.relative_humidity_2m?.[hourIdx],
            wind_speed_10m: h.wind_speed_10m?.[hourIdx],
            uv_index: h.uv_index?.[hourIdx],
            cloud_cover: h.cloud_cover?.[hourIdx]
        })).filter(d => d.temperature_2m != null);
        if (pts.length === 0) return null;
        return pts;
    };

    const formatHourLabel = (h) => {
        const hour = h % 24;
        const ampm = hour >= 12 ? 'PM' : 'AM';
        return `${hour % 12 || 12} ${ampm}`;
    };

    const getSegmentMetrics = (startHour, endHour) => {
        const indices = [];
        for (let i = startHour; i <= endHour; i++) indices.push(i);

        const segmentTemps = []; const segmentApparent = []; const segmentWeatherCodes = []; const segmentHumidity = []; const segmentWindSpeed = []; const segmentUV = []; const segmentCloud = [];
        const hourlySlots = [];

        indices.forEach(hourIdx => {
            const hourData = getHourConsensus(hourIdx);
            if (!hourData) return;
            const avgTemp = averageTemperature(hourData);
            const avgApparent = averageApparentTemperature(hourData);
            const avgPrecip = averagePrecipitation(hourData);
            const avgProb = averagePrecipitationProbability(hourData);
            const weatherCode = getMostCommonWeatherCode(hourData);
            if (avgTemp !== null) segmentTemps.push(avgTemp);
            if (avgApparent !== null) segmentApparent.push(avgApparent);
            if (weatherCode !== null) segmentWeatherCodes.push(weatherCode);
            hourData.forEach(d => {
                if (d.relative_humidity_2m != null) segmentHumidity.push(d.relative_humidity_2m);
                if (d.wind_speed_10m != null) segmentWindSpeed.push(d.wind_speed_10m);
                if (d.uv_index != null) segmentUV.push(d.uv_index);
                if (d.cloud_cover != null) segmentCloud.push(d.cloud_cover);
            });
            if (avgTemp !== null) {
                hourlySlots.push({
                    time: formatHourLabel(hourIdx),
                    label: formatHourLabel(hourIdx),
                    temp: avgTemp,
                    iconId: getIconForHour(weatherCode, hourIdx % 24),
                    icon: getIcon(weatherCode),
                    precip: avgPrecip,
                    prob: avgProb,
                    weatherCode,
                    condition: getCondition(weatherCode)
                });
            }
        });

        const avgTemp = segmentTemps.length ? Math.round(segmentTemps.reduce((a, b) => a + b, 0) / segmentTemps.length) : null;
        const feelsLike = segmentApparent.length ? Math.round(segmentApparent.reduce((a, b) => a + b, 0) / segmentApparent.length) : avgTemp;
        const rainSummary = summarizePeriodRain(hourlySlots);
        const midCode = segmentWeatherCodes.length ? segmentWeatherCodes[Math.floor(segmentWeatherCodes.length / 2)] : 0;
        const periodCode = selectPeriodWeatherCode(hourlySlots, midCode);
        const midHour = Math.floor((startHour + endHour) / 2) % 24;

        return {
            temp: avgTemp,
            feelsLike,
            icon: getIcon(periodCode),
            iconId: getIconForHour(periodCode, midHour),
            condition: getCondition(periodCode),
            rainMm: `${rainSummary.totalMm.toFixed(1)}mm`,
            rainMmValue: rainSummary.totalMm,
            rainProb: {
                avg: rainSummary.peak,
                peak: rainSummary.peak,
                mean: rainSummary.mean,
                min: rainSummary.min,
                max: rainSummary.max,
                displayString: rainSummary.displayString,
                semantics: rainSummary.semantics,
            },
            humidity: segmentHumidity.length ? Math.round(segmentHumidity.reduce((a, b) => a + b, 0) / segmentHumidity.length) : null,
            windSpeed: segmentWindSpeed.length ? Math.round(segmentWindSpeed.reduce((a, b) => a + b, 0) / segmentWindSpeed.length) : null,
            uvIndex: segmentUV.length ? Math.max(...segmentUV) : null,
            cloudCover: segmentCloud.length ? Math.round(segmentCloud.reduce((a, b) => a + b, 0) / segmentCloud.length) : null,
            hourly: hourlySlots
        };
    };

    const getDaySegments = (dayOffset) => {
        const offset = dayOffset * 24;
        return { morning: getSegmentMetrics(6 + offset, 11 + offset), noon: getSegmentMetrics(12 + offset, 16 + offset), evening: getSegmentMetrics(17 + offset, 22 + offset) };
    };

    const today = getDaySegments(0);
    const tomorrow = getDaySegments(1);
    const currentTemp = averageTemperature(currentData);
    const currentFeelsLike = averageApparentTemperature(currentData);
    const currentWeatherCode = getMostCommonWeatherCode(currentData);
    const currentHumidity = weightedAverageMetric(currentData, 'relative_humidity_2m', { round: true });
    const currentWindSpeed = weightedAverageMetric(currentData, 'wind_speed_10m', { round: true });
    const currentWindDirection = weightedAverageMetric(currentData, 'wind_direction_10m', { round: true });
    const maxPrecipProb = weightedDailyMetric(modelData, 'precipitation_probability_max', 0, { round: true }) ?? 0;
    const totalPrecipValue = weightedDailyMetric(modelData, 'precipitation_sum', 0, { digits: 1 }) ?? 0;
    const totalPrecip = totalPrecipValue.toFixed(1);
    const maxUV = weightedDailyMetric(modelData, 'uv_index_max', 0, { round: true });
    const successfulModels = getSuccessfulModels(modelData);

    const hourly24 = [];
    const next8Hours = [];
    for (let i = 0; i < 24; i++) {
        const hourIdx = currentHourOfDay + i;
        const hourData = getHourConsensus(hourIdx);
        if (!hourData) continue;
        const avgTemp = averageTemperature(hourData);
        if (avgTemp === null) continue;
        const weatherCode = getMostCommonWeatherCode(hourData);
        const avgPrecip = averagePrecipitation(hourData);
        const avgProb = averagePrecipitationProbability(hourData);
        const labelHour = hourIdx % 24;
        const slot = {
            label: i === 0 ? 'Now' : formatHourLabel(labelHour),
            time: i === 0 ? 'Now' : formatHourLabel(labelHour),
            temp: avgTemp,
            iconId: getIconForHour(weatherCode, labelHour),
            icon: getIcon(weatherCode),
            prob: avgProb,
            precip: avgPrecip,
            condition: getCondition(weatherCode)
        };
        hourly24.push(slot);
        if (i < 8) next8Hours.push(slot);
    }

    // Build 7-day weekly forecast consensus
    const weeklyForecast = buildDailyConsensus(modelData, getIcon, getCondition);

    let todayHourlyConsensusMm = 0;
    for (let hourIdx = 0; hourIdx < 24; hourIdx += 1) {
        const hourData = getHourConsensus(hourIdx);
        if (!hourData) continue;
        todayHourlyConsensusMm += averagePrecipitation(hourData);
    }
    todayHourlyConsensusMm = Number(todayHourlyConsensusMm.toFixed(1));
    const precipitationReconciliation = buildPrecipitationReconciliation(
        totalPrecipValue,
        todayHourlyConsensusMm
    );

    if (precipitationReconciliation && !precipitationReconciliation.withinTolerance) {
        console.warn('[WeatherService] Daily/hourly precipitation mismatch', {
            locationName,
            ...precipitationReconciliation,
        });
    }

    const timezone = modelData.ecmwf?.timezone || modelData.gfs?.timezone || modelData.icon?.timezone || 'auto';

    return {
        name: getWeatherLocationLabel(locationName),
        icon: WEATHER_LOCATION_REGISTRY[locationName]?.icon || (locationName === 'muscat' ? '📍' : '🏛️'),
        fetchedAt: Date.now(),
        timezone,
        models: { successful: successfulModels, count: successfulModels.length, names: formatModelNames(successfulModels) },
        current: {
            temp: currentTemp,
            feelsLike: currentFeelsLike,
            high: null,
            low: null,
            condition: getCondition(currentWeatherCode),
            icon: getIcon(currentWeatherCode),
            iconId: getIconForHour(currentWeatherCode, currentHourOfDay),
            humidity: currentHumidity,
            windSpeed: currentWindSpeed,
            windDirection: currentWindDirection
        },
        morning: today.morning,
        noon: today.noon,
        evening: today.evening,
        tomorrow,
        hourly24,
        next8Hours,
        weeklyForecast,
        precipitationReconciliation,
        dailyRain: {
            peakProbability: maxPrecipProb,
            forecastTotalMm: totalPrecipValue,
            probabilitySemantics: 'daily_max_hourly_probability_consensus',
        },
        summary: parseFloat(totalPrecip) > 0
            ? `Peak rain chance today ${maxPrecipProb}% · Forecast total ${totalPrecip}mm · UV ${maxUV ?? 'N/A'}`
            : `Stable · UV ${maxUV ?? 'N/A'}`
    };
}

function buildDailyConsensus(modelData, getIcon, getCondition) {
    const days = [];
    for (let d = 0; d < 7; d++) {
        const tempMax = [
            modelData.ecmwf?.daily?.temperature_2m_max?.[d],
            modelData.gfs?.daily?.temperature_2m_max?.[d],
            modelData.icon?.daily?.temperature_2m_max?.[d],
        ].filter(v => v != null);
        const tempMin = [
            modelData.ecmwf?.daily?.temperature_2m_min?.[d],
            modelData.gfs?.daily?.temperature_2m_min?.[d],
            modelData.icon?.daily?.temperature_2m_min?.[d],
        ].filter(v => v != null);
        const precipProbValue = weightedDailyMetric(
            modelData,
            'precipitation_probability_max',
            d,
            { round: true }
        );
        const precipSumValue = weightedDailyMetric(
            modelData,
            'precipitation_sum',
            d,
            { digits: 1 }
        );
        const uvMax = [
            modelData.ecmwf?.daily?.uv_index_max?.[d],
            modelData.gfs?.daily?.uv_index_max?.[d],
            modelData.icon?.daily?.uv_index_max?.[d],
        ].filter(v => v != null);
        const windMax = [
            modelData.ecmwf?.daily?.wind_speed_10m_max?.[d],
            modelData.gfs?.daily?.wind_speed_10m_max?.[d],
            modelData.icon?.daily?.wind_speed_10m_max?.[d],
        ].filter(v => v != null);
        const apparentMax = [
            modelData.ecmwf?.daily?.apparent_temperature_max?.[d],
            modelData.gfs?.daily?.apparent_temperature_max?.[d],
            modelData.icon?.daily?.apparent_temperature_max?.[d],
        ].filter(v => v != null);
        const humidityMean = [
            modelData.ecmwf?.daily?.relative_humidity_2m_mean?.[d],
            modelData.gfs?.daily?.relative_humidity_2m_mean?.[d],
            modelData.icon?.daily?.relative_humidity_2m_mean?.[d],
        ].filter(v => v != null);
        const weatherCodes = [
            modelData.ecmwf?.daily?.weather_code?.[d],
            modelData.gfs?.daily?.weather_code?.[d],
            modelData.icon?.daily?.weather_code?.[d],
        ].filter(v => v != null);

        const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
        const code = weatherCodes.length ? weatherCodes[Math.floor(weatherCodes.length / 2)] : 0;

        // Determine day label
        const date = new Date();
        date.setDate(date.getDate() + d);
        const dayLabel = d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : date.toLocaleDateString('en-US', { weekday: 'short' });
        const dateStr = toLocalDateKey(date);

        days.push({
            dayLabel,
            date: dateStr,
            tempMax: avg(tempMax),
            tempMin: avg(tempMin),
            high: avg(tempMax),
            low: avg(tempMin),
            precipProb: precipProbValue,
            rainProb: precipProbValue,
            rainfallProbability: precipProbValue,
            precipitationProbabilitySemantics: 'daily_max_hourly_probability_consensus',
            precipSum: precipSumValue,
            rainMm: precipSumValue,
            rainfallMm: precipSumValue,
            realFeelDay: avg(apparentMax),
            feelsLikeDay: avg(apparentMax),
            humidityDay: avg(humidityMean),
            humidityMean: avg(humidityMean),
            uvMax: avg(uvMax),
            uvIndex: avg(uvMax),
            windMax: avg(windMax),
            weatherCode: code,
            icon: getIcon(code),
            condition: getCondition(code),
        });
    }
    return days;
}
