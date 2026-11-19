/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { getSettings, saveSettings, fetchSettingsFromApi, acceptRemoteSettings } from '../utils/storage';
import { getRuntimeCapabilities } from "../runtime/runtimeCapabilities.js";
import { STORAGE_WRITE_FAILURE_MESSAGE } from '../data/safeStorage.js';

const SettingsContext = createContext();

function canUseRemoteSettingsSync() {
    return getRuntimeCapabilities().allowRemoteSettingsSync;
}

export function SettingsProvider({ children }) {
    const [settings, setSettingsState] = useState(() => getSettings());
    const [settingsVersion, setSettingsVersion] = useState(0);
    const [settingsError, setSettingsError] = useState(null);

    const updateSettings = useCallback((newSettings) => {
        if (!saveSettings(newSettings)) {
            setSettingsError(STORAGE_WRITE_FAILURE_MESSAGE);
            return false;
        }
        setSettingsError(null);
        setSettingsState(getSettings());
        setSettingsVersion(v => v + 1);
        return true;
    }, []);

    const reloadSettings = useCallback(() => {
        const freshSettings = getSettings();
        setSettingsState(freshSettings);
        setSettingsVersion(v => v + 1);
    }, []);

    useEffect(() => {
        if (!canUseRemoteSettingsSync()) {
            return;
        }

        let active = true;
        const syncWithServer = async () => {
            try {
                const remoteSettings = await fetchSettingsFromApi();
                if (active && acceptRemoteSettings(remoteSettings)) reloadSettings();
            } catch (err) {
                console.warn('[Settings] Failed to sync with server', err);
            }
        };

        syncWithServer();
        return () => { active = false; };
    }, [reloadSettings]);

    useEffect(() => {
        const handleStorageChange = (event) => {
            if (event.key === 'dailyEventAI_settings') {
                console.log('[SettingsContext] Storage changed in another tab, reloading');
                reloadSettings();
            }
        };

        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, [reloadSettings]);

    useEffect(() => {
        if (settings.fontSize) {
            document.documentElement.style.fontSize = settings.fontSize + 'px';
        }
    }, [settings.fontSize]);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', settings.theme || 'dark');
    }, [settings.theme]);

    return (
        <SettingsContext.Provider value={{ settings, updateSettings, reloadSettings, settingsVersion, settingsError }}>
            {children}
        </SettingsContext.Provider>
    );
}

export function useSettings() {
    const context = useContext(SettingsContext);
    if (!context) {
        throw new Error('useSettings must be used within SettingsProvider');
    }
    return context;
}
