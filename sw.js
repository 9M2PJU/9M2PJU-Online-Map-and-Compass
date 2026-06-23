const APP_CACHE = '9m2pju-map-compass-app-v1';
const RUNTIME_CACHE = '9m2pju-map-compass-runtime-v1';

const APP_SHELL = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.webmanifest',
    './icons/icon.svg',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/maskable-192.png',
    './icons/maskable-512.png',
    './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(APP_CACHE)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys
                    .filter(key => ![APP_CACHE, RUNTIME_CACHE].includes(key))
                    .map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const { request } = event;

    if (request.method !== 'GET') {
        return;
    }

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then(response => {
                    const copy = response.clone();
                    caches.open(APP_CACHE).then(cache => cache.put('./index.html', copy));
                    return response;
                })
                .catch(() => caches.match('./index.html'))
        );
        return;
    }

    const url = new URL(request.url);
    const sameOrigin = url.origin === self.location.origin;

    if (sameOrigin) {
        event.respondWith(
            caches.match(request)
                .then(cached => cached || fetch(request).then(response => {
                    const copy = response.clone();
                    caches.open(APP_CACHE).then(cache => cache.put(request, copy));
                    return response;
                }))
        );
        return;
    }

    event.respondWith(
        fetch(request)
            .then(response => {
                const copy = response.clone();
                caches.open(RUNTIME_CACHE).then(cache => cache.put(request, copy));
                return response;
            })
            .catch(() => caches.match(request))
    );
});
