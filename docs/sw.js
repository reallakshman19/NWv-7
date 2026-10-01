/* Service Worker for News & Weather App */
const CACHE_PREFIX = 'news-weather-app-';
const CACHE_NAME = 'news-weather-app-v3-20261001';
const BASE_PATH = './';

const PRECACHE_URLS = [
    BASE_PATH,
    `${BASE_PATH}index.html`,
    `${BASE_PATH}vite.svg`,
    `${BASE_PATH}manifest.json`
];

async function fetchFresh(request) {
    return fetch(request, { cache: 'no-store' });
}

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        await Promise.all(PRECACHE_URLS.map(async (url) => {
            const response = await fetch(url, { cache: 'reload' });
            if (!response.ok) {
                throw new Error(`Failed to precache ${url}: ${response.status}`);
            }
            await cache.put(url, response.clone());
        }));
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const cacheNames = await caches.keys();
        const hadPreviousAppCache = cacheNames.some(
            (cacheName) => cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME
        );

        await Promise.all(
            cacheNames.map((cacheName) => {
                if (cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME) {
                    return caches.delete(cacheName);
                }
                return Promise.resolve();
            })
        );

        await self.clients.claim();

        if (hadPreviousAppCache) {
            const windowClients = await self.clients.matchAll({
                type: 'window',
                includeUncontrolled: true,
            });
            await Promise.all(windowClients.map(async (client) => {
                if (!client.url.startsWith(self.registration.scope) || !('navigate' in client)) {
                    return;
                }
                try {
                    await client.navigate(client.url);
                } catch {
                    // A client can disappear during activation; another navigation will use v3.
                }
            }));
        }
    })());
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // Do not hijack third-party requests. Let the browser handle them directly.
    if (url.origin !== self.location.origin || request.method !== 'GET') {
        return;
    }

    event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);

        try {
            const response = await fetchFresh(request);
            if (response && response.ok) {
                await cache.put(request, response.clone());
            }
            return response;
        } catch {
            const cached = await cache.match(request);
            if (cached) {
                return cached;
            }

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
