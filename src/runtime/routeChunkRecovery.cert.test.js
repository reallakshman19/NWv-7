// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadLazyRoute, recoverOutdatedAppBuild, RouteChunkLoadError } from './routeChunkRecovery.js';

const onlineWindow = window;

describe('route module recovery', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        document.head.innerHTML = '';
        onlineWindow.sessionStorage.clear();
    });

    function installBrowser(online = true) {
        document.head.innerHTML = '<meta name="nw-app-build" content="assets/index-old.js">';
        const reload = vi.fn();
        vi.stubGlobal('window', {
            navigator: { onLine: online }, location: { reload },
            sessionStorage: onlineWindow.sessionStorage,
        });
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            text: async () => '<meta name="nw-app-build" content="assets/index-new.js">',
        });
        vi.stubGlobal('fetch', fetchMock);
        return { reload, fetchMock };
    }

    it('reloads at most once when a different deployed build is confirmed', async () => {
        const { reload, fetchMock } = installBrowser();
        await Promise.all([recoverOutdatedAppBuild(), recoverOutdatedAppBuild()]);
        await recoverOutdatedAppBuild();
        expect(reload).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][1].cache).toBe('no-store');
    });

    it('keeps manual recovery when the same build or a failed entry is served', async () => {
        const { reload, fetchMock } = installBrowser();
        fetchMock.mockResolvedValue({ ok: true, text: async () => document.head.innerHTML });
        await recoverOutdatedAppBuild();
        fetchMock.mockResolvedValue({ ok: false });
        await recoverOutdatedAppBuild();
        expect(reload).not.toHaveBeenCalled();
    });

    it('does not reload or consume the guard while offline or storage is blocked', async () => {
        const { reload, fetchMock } = installBrowser(false);
        await recoverOutdatedAppBuild();
        expect(fetchMock).not.toHaveBeenCalled();
        window.navigator.onLine = true;
        window.sessionStorage = {
            getItem: () => null,
            setItem: () => { throw Error('blocked'); },
        };
        await recoverOutdatedAppBuild();
        expect(reload).not.toHaveBeenCalled();
        vi.restoreAllMocks();
    });

    it('marks transport failures while preserving ordinary route exceptions', async () => {
        await expect(loadLazyRoute(async () => {
            throw new TypeError('Failed to fetch dynamically imported module: /assets/old.js');
        })).rejects.toBeInstanceOf(RouteChunkLoadError);
        const ordinary = new Error('Invalid article');
        await expect(loadLazyRoute(async () => { throw ordinary; })).rejects.toBe(ordinary);
        const component = { default: () => null };
        expect(await loadLazyRoute(async () => component)).toBe(component);
    });
});
