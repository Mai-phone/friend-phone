const AIOS_VERSION = '20260620-paro-format-v1';
const AIOS_CACHE = `aios-pwa-shell-${AIOS_VERSION}`;
const AIOS_CORE = [
    './',
    './index.html',
    './dist.html',
    `./manifest.webmanifest?v=${AIOS_VERSION}`,
    './assets/icon-180.png',
    './assets/icon-192.png',
    './assets/icon-512.png'
];

function isFreshFirstAsset(request, url) {
    const destination = request.destination || '';
    if (destination === 'script' || destination === 'style') return true;
    return /\.(?:js|css)$/i.test(url.pathname || '');
}

function cacheResponse(request, response) {
    if (!response || !response.ok) return Promise.resolve();
    const copy = response.clone();
    return caches.open(AIOS_CACHE).then(cache => cache.put(request, copy));
}

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(AIOS_CACHE)
            .then(cache => Promise.allSettled(AIOS_CORE.map(url => cache.add(url))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys
                .filter(key => key !== AIOS_CACHE && key.startsWith('aios-pwa-shell-'))
                .map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (!request || request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== location.origin) return;

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then(response => {
                    event.waitUntil(cacheResponse(request, response).catch(() => {}));
                    return response;
                })
                .catch(() => caches.match(request).then(cached => cached || caches.match('./index.html')))
        );
        return;
    }

    if (isFreshFirstAsset(request, url)) {
        event.respondWith(
            fetch(request, { cache: 'reload' })
                .then(response => {
                    event.waitUntil(cacheResponse(request, response).catch(() => {}));
                    return response;
                })
                .catch(() => caches.match(request).then(cached => cached || Response.error()))
        );
        return;
    }

    event.respondWith(
        caches.match(request).then(cached => {
            const network = fetch(request).then(response => {
                if (response && response.ok) event.waitUntil(cacheResponse(request, response).catch(() => {}));
                return response;
            }).catch(() => cached);
            return cached || network;
        })
    );
});

self.addEventListener('notificationclick', event => {
    const data = event.notification && event.notification.data || {};
    const contactId = data.contactId || '';
    event.notification.close();
    event.waitUntil((async () => {
        const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
        const targetUrl = contactId ? `./?notificationChat=${encodeURIComponent(contactId)}` : './';
        for (const client of allClients) {
            if (!client || !client.url || !client.url.startsWith(self.location.origin)) continue;
            if (contactId && client.postMessage) client.postMessage({ type: 'open-chat', contactId });
            if (client.focus) await client.focus();
            return;
        }
        if (clients.openWindow) await clients.openWindow(targetUrl);
    })());
});

self.addEventListener('message', event => {
    const data = event && event.data || {};
    if (!data || data.type !== 'show-notification') return;
    const title = data.title || '新消息';
    const options = Object.assign({
        body: '发来了新消息',
        icon: './assets/icon-192.png',
        badge: './assets/icon-192.png',
        silent: false,
        renotify: true,
        data: {}
    }, data.options || {});
    event.waitUntil(self.registration.showNotification(title, options));
});
