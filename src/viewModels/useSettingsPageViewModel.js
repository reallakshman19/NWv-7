import { useCallback } from 'react';
import { useSettings } from '../context/SettingsContext';
import { getRuntimeCapabilities } from '../runtime/runtimeCapabilities';

export function useSettingsPageViewModel() {
  const { settings, updateSettings, reloadSettings, settingsError } = useSettings();
  const runtime = getRuntimeCapabilities();

  const getBackupData = useCallback(() => ({
    settings,
    hiddenEvents: JSON.parse(localStorage.getItem('upAhead_hiddenEvents') || '[]'),
    watchlist: JSON.parse(localStorage.getItem('upAhead_watchlist') || '[]'),
    readingHistory: settings.readingHistory || [],
  }), [settings]);

  const applyImport = useCallback((imported) => {
    if (!updateSettings(imported?.settings ?? imported)) return false;
    if (imported.settings) {
      if (imported.hiddenEvents) localStorage.setItem('upAhead_hiddenEvents', JSON.stringify(imported.hiddenEvents));
      if (imported.watchlist) localStorage.setItem('upAhead_watchlist', JSON.stringify(imported.watchlist));
    }
    return true;
  }, [updateSettings]);

  return {
    settings,
    settingsError,
    updateSettings,
    reloadSettings,
    isStaticHost: Boolean(runtime.isStaticHost),
    getBackupData,
    applyImport,
  };
}
