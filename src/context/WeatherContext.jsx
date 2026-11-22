/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { fetchWeather } from '../services/weatherService';
import { getSettings } from '../utils/storage';
import { useSettings } from './SettingsContext';
import { getConfiguredWeatherCities, resolveRegistryKey } from '../services/weatherLocations.js';

const WeatherContext = createContext();

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function hasUsableWeatherCity(cityData) {
    return Boolean(cityData?.current?.temp != null && Number.isFinite(Number(cityData.current.temp)));

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

    const loadWeather = useCallback(async (force = false) => {
        if (!booted) return;
        const settings = getSettings();

        if (!force && weatherData) {
            const age = Date.now() - lastFetch;
            if (age < 15 * 60 * 1000) {
                return;
            }
            // Keep previous visible data while a new request is in flight.
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

            for (let i = 0; i < cities.length; i += 1) {
                const city = String(cities[i] || '').toLowerCase();
                try {
                    const cityData = await fetchWeather(city, { force });
                    if (hasUsableWeatherCity(cityData)) {
                        data[city] = cityData;
                        successCount += 1;
                    } else {
                        data[city] = weatherData?.[city] || null;
                    }
                } catch (cityError) {
                    console.warn(`[WeatherContext] ${city} failed:`, cityError?.message || cityError);
                    data[city] = weatherData?.[city] || null;
                }

                if (generation !== requestGeneration.current) return;
                if (i < cities.length - 1) {
                    await delay(500);
                }
            }

            if (generation !== requestGeneration.current) return;
            if (successCount === 0 && weatherData) {
                setError(new Error('Using previous cached weather data; live refresh failed.'));
                setLoading(false);
                return;
            }

            const nextData = successCount > 0 ? data : null;
            setWeatherData(nextData);
            setLastFetch(successCount > 0 ? Date.now() : lastFetch);
            setError(successCount === 0 ? new Error('All weather fetches failed') : null);
        } catch (err) {
            if (generation !== requestGeneration.current) return;
            console.error('Weather Context Error:', err);
            setError(err);
            if (!weatherData) {
                setWeatherData(null);
            }
        } finally {
            if (generation === requestGeneration.current) setLoading(false);
        }
    }, [weatherData, lastFetch, booted]);

    useEffect(() => {
        if (!booted) return;
        loadWeather();
    }, [booted, loadWeather]);

    useEffect(() => {
        if (!booted) return;
        if (lastDataSettingsKey.current !== dataSettingsKey) {
            lastDataSettingsKey.current = dataSettingsKey;
            loadWeather(true);
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
