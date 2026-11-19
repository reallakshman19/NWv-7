// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SettingsProvider, useSettings } from './SettingsContext.jsx';

vi.mock('../runtime/runtimeCapabilities.js', () => ({
    getRuntimeCapabilities: () => ({ allowRemoteSettingsSync: false }),
}));

afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

it('keeps the saved preference and version when storage rejects a settings change', () => {
    localStorage.clear();
    const { result } = renderHook(() => useSettings(), { wrapper: SettingsProvider });
    const previousTheme = result.current.settings.theme;
    const previousVersion = result.current.settingsVersion;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('quota exceeded'); });
    let saved;
    act(() => { saved = result.current.updateSettings({ theme: 'light' }); });
    expect(saved).toBe(false);
    expect(result.current.settings.theme).toBe(previousTheme);
    expect(result.current.settingsVersion).toBe(previousVersion);
    expect(result.current.settingsError).toContain('Storage is full or unavailable');
});
