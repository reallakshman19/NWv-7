/* Service Worker for News & Weather App */
const CACHE_PREFIX = 'news-weather-app-';
const CACHE_NAME = 'news-weather-app-v3-sections-authority';
const BASE_PATH = './';

const PRECACHE_URLS = [
    BASE_PATH,
    `${BASE_PATH}index.html`,
    `${BASE_PATH}vite.svg`,
    `${BASE_PATH}manifest.json`
];

function isRuntimeDataRequest(url) {
    return url.pathname.includes('/newsdata/') ||
        url.pathname.includes('/api/datasets/') ||
        url.pathname.includes('/preview/sections/') ||
        url.pathname.includes('/v1/sections/');
}

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        await Promise.all(PRECACHE_URLS.map(async (url) => {
            const response = await fetch(url, { cache: 'reload' });
            if (response.ok) await cache.put(url, response.clone());
        }));
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((cacheName) => {
            if (cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME) {
                return caches.delete(cacheName);
            }
            return Promise.resolve();
        }));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    if (request.method !== 'GET') return;

    // Dataset freshness belongs to the dataset authority, never the app-shell cache.
    if (isRuntimeDataRequest(url)) return;

    // Do not proxy or cache third-party requests.
    if (url.origin !== self.location.origin) return;

    event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);

        try {
            const response = await fetch(request, { cache: 'no-store' });
            if (response && response.ok) {
                await cache.put(request, response.clone());
            }
            return response;
        } catch {
            const cached = await cache.match(request);
            if (cached) return cached;

            if (request.mode === 'navigate') {
                const fallback = await cache.match(`${BASE_PATH}index.html`);
                if (fallback) return fallback;
            }

            return new Response('Offline', {
                status: 503,
                statusText: 'Offline'
            });
        }
    })());
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
                    client.postMessage({ type: 'NOTIFICATION_CLICK', action: event.action });
                    return client.focus();
                }
            }
            if (self.clients.openWindow) {
                return self.clients.openWindow(BASE_PATH);
            }
            return null;
        })
    );
});
