const BUILD_MARKER = 'meta[name="nw-app-build"]';
const MODULE_LOAD_FAILURE = /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|unable to preload css/i;

export class RouteChunkLoadError extends Error {
    constructor(cause) {
        super('This page did not finish loading.', { cause });
        this.name = 'RouteChunkLoadError';
    }
}

export async function loadLazyRoute(importRoute) {
    try {
        return await importRoute();
    } catch (error) {
        if (MODULE_LOAD_FAILURE.test(error?.message ?? '')) {
            throw new RouteChunkLoadError(error);
        }
        throw error;
    }
}

export async function recoverOutdatedAppBuild() {
    if (typeof window === 'undefined' || window.navigator.onLine === false) return;
    const currentBuild = document.querySelector(BUILD_MARKER)?.content;
    if (!currentBuild) return;

    const entryUrl = new URL('index.html', document.baseURI);
    const guardKey = `nw:chunk-reload:${entryUrl.pathname}:${currentBuild}`;
    try {
        if (window.sessionStorage.getItem(guardKey)) return;
        const response = await fetch(entryUrl, {
            cache: 'no-store',
            signal: AbortSignal.timeout(4000),
        });
        if (!response.ok) return;
        const html = new DOMParser().parseFromString(await response.text(), 'text/html');
        const publishedBuild = html.querySelector(BUILD_MARKER)?.content;
        if (!publishedBuild || publishedBuild === currentBuild) return;

        // Set the guard before navigating, including when two boundaries catch together.
        if (window.sessionStorage.getItem(guardKey)) return;
        window.sessionStorage.setItem(guardKey, '1');
        window.location.reload();
    } catch {
        // The error boundary still offers a manual page reload.
    }
}
