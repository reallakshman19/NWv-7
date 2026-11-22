/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { fetchWeather } from '../services/weatherService';
import { getSettings } from '../utils/storage';
import { useSettings } from './SettingsContext';
import { getConfiguredWeatherCities, resolveRegistryKey } from '../services/weatherLocations.js';

const WeatherContext = createContext();

const WEATHER_CURRENT_MAX_AGE_MS = 4 * 60 * 60 * 1000;

function hasUsableWeatherCity(cityData) {
    if (cityData?.current?.temp == null || !Number.isFinite(Number(cityData.current.temp))) return false;
    const stamp = Number(cityData?.fetchedAt);
    const age = Date.now() - stamp;
    return Number.isFinite(stamp) && stamp > 0 && age >= -5*60*1000 && age <= WEATHER_CURRENT_MAX_AGE_MS;
}

export function WeatherProvider({ children, lazy = false }) {
    const { settings, settingsVersion, updateSettings } = useSettings();
    const [legacyCity] = useState(() => {
        try { return resolveRegistryKey(localStorage.getItem('weather_active_city') || localStorage.getItem('dw_active_city')); }
        catch { return null; }
    });
    const selectedCities = useMemo(() => getConfiguredWeatherCities(settings), [settings]);
    const savedCity = resolveRegistryKey(settings?.weather?.activeCity);
    const activeCity = selectedCities.includes(savedCity) ? savedCity :
        selectedCities.includes(legacyCity) ? legacyCity : selectedCities[0];
    const setActiveCity = useCallback(city => {
        const canonical = resolveRegistryKey(city);
        if (!canonical || !selectedCities.includes(canonical)) return false;
        const existing = getSettings();
        if (existing?.weather?.activeCity === canonical) return true;
        return updateSettings({
            ...existing,
            weather: { ...(existing?.weather || {}), activeCity: canonical },
        }) !== false;
    }, [selectedCities, updateSettings]);
    useEffect(() => {
        if (settings?.weather?.activeCity !== activeCity && activeCity) setActiveCity(activeCity);
    }, [activeCity, settings?.weather?.activeCity, setActiveCity]);
    useEffect(() => {
        if (!activeCity || settings?.weather?.activeCity !== activeCity) return;
        try { localStorage.setItem('weather_active_city', activeCity); } catch { /* storage unavailable */ }
    }, [activeCity, settings?.weather?.activeCity]);
    const dataSettingsKey = JSON.stringify({
        cities: selectedCities, models: settings?.weather?.models,
        enabled: settings?.sections?.weather !== false,
    });
    const lastDataSettingsKey = useRef(dataSettingsKey);
    const requestGeneration = useRef(0);

    const [booted, setBooted] = useState(!lazy);
    const [weatherData, setWeatherData] = useState(null);
    const [loading, setLoading] = useState(!lazy);
    const [error, setError] = useState(null);
    const [lastFetch, setLastFetch] = useState(0);

    const ensureBoot = useCallback(() => {
        setBooted(true);
    }, []);

    const loadWeather = useCallback(async (force = false, { rosterChange = false } = {}) => {
        if (!booted) return;
        const settings = getSettings();

        if (!force && !rosterChange && weatherData) {
            const age = Date.now() - lastFetch;
            if (age < 15 * 60 * 1000) return { ok: true, skipped: true };
        }

        const generation = ++requestGeneration.current;
        setLoading(true);

        if (settings?.sections?.weather === false) {
            setLoading(false);
            return;
        }

        try {
            const cities = getConfiguredWeatherCities(settings);
            const data = {};
            let successCount = 0;
            let unavailableCount = 0;
            // Preserve selected order but cap simultaneous model acquisitions.
            // Only changed/expired cities are fetched on roster modifications.
            const fetchCity = async city => {
                const existing = weatherData?.[city];
                if (!force && rosterChange && hasUsableWeatherCity(existing)) return existing;
                try {
                    const fetched = await fetchWeather(city, { force });
                    if (hasUsableWeatherCity(fetched)) return fetched;
                    return hasUsableWeatherCity(existing) ? { ...existing, sourceMode: 'cache', isStale: true } : null;
                } catch (cityError) {
                    console.warn(`[WeatherContext] ${city} failed:`, cityError?.message || cityError);
                    return hasUsableWeatherCity(existing) ? { ...existing, sourceMode: 'cache', isStale: true } : null;
                }
            };
            for (let offset=0; offset<cities.length; offset+=3) {
                const batch=cities.slice(offset,offset+3);
                const results=await Promise.all(batch.map(city=>fetchCity(city)));
                if (generation !== requestGeneration.current) return { ok:false, superseded:true };
                results.forEach((cityData,index)=>{
                    const city=batch[index];
                    data[city]=cityData;
                    if (hasUsableWeatherCity(cityData)) successCount += 1;
                    else unavailableCount += 1;
                });
            }
            if (generation !== requestGeneration.current) return { ok:false, superseded:true };
            // Publish only the current configured-city roster. Removed cities and
            // late responses cannot be restored in React state.
            setWeatherData(data);
            setLastFetch(Date.now());
            setError(unavailableCount ? new Error(`${unavailableCount} city forecasts unavailable`) : null);
            return { ok:successCount > 0, available:successCount, unavailable:unavailableCount };
        } catch (err) {
            if (generation !== requestGeneration.current) return { ok:false, superseded:true };
            console.error('Weather Context Error:', err);
            setError(err);
            if (!weatherData) setWeatherData(null);
            return { ok:false, error:err?.message || String(err) };
        } finally {
            if (generation === requestGeneration.current) setLoading(false);
        }
    }, [weatherData, lastFetch, booted]);

    useEffect(() => {
        if (!booted) return;
        loadWeather();
    }, [booted, loadWeather]);

    useEffect(() => {
        if (!booted || typeof window === 'undefined') return;
        const refreshOnResume = () => {
            if (document.visibilityState === 'visible') loadWeather(false);
        };
        const timer = window.setInterval(() => loadWeather(false), 15*60*1000);
        document.addEventListener('visibilitychange', refreshOnResume);
        return () => {
            window.clearInterval(timer);
            document.removeEventListener('visibilitychange', refreshOnResume);
        };
    }, [booted, loadWeather]);

    useEffect(() => {
        if (!booted) return;
        if (lastDataSettingsKey.current !== dataSettingsKey) {
            const previous = JSON.parse(lastDataSettingsKey.current);
            const next = JSON.parse(dataSettingsKey);
            lastDataSettingsKey.current = dataSettingsKey;
            const modelsChanged = JSON.stringify(previous.models) !== JSON.stringify(next.models) || previous.enabled !== next.enabled;
            loadWeather(modelsChanged, { rosterChange: true });
        }
    }, [booted, dataSettingsKey, loadWeather, settingsVersion]);

    return (
        <WeatherContext.Provider value={{ weatherData, loading, error, refreshWeather: loadWeather, ensureBoot, booted, activeCity, setActiveCity }}>
            {children}
        </WeatherContext.Provider>
    );
}

export function useWeather() {
    return useContext(WeatherContext);
}
