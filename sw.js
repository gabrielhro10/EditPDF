// Service worker: deja la app disponible sin conexión.
//  - El shell (HTML, CSS, JS, manifest, iconos) va en una caché versionada: sube SHELL_VERSION
//    al publicar cambios para que los usuarios descarguen los archivos nuevos.
//  - Las librerías del CDN llevan la versión en la URL, así que se guardan una vez y no caducan.
const SHELL_VERSION = 'v1';
const SHELL_CACHE = `editpdf-shell-${SHELL_VERSION}`;
const LIB_CACHE = 'editpdf-libs';

const SHELL_URLS = [
    './',
    './index.html',
    './manifest.webmanifest',
    './css/app.css',
    './js/core.js',
    './js/pdfio.js',
    './js/export.js',
    './js/compress.js',
    './js/dialogs.js',
    './js/editor.js',
    './js/app.js',
    './icons/icon.svg',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-512.png',
    './icons/apple-touch-icon.png'
];

// Mantener en sincronía con las etiquetas <script> de index.html y con PDFJS_WORKER en js/pdfio.js.
const LIB_URLS = [
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.2/Sortable.min.js'
];

const CDN_HOSTS = ['cdnjs.cloudflare.com'];
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        // cache: 'reload' evita que GitHub Pages devuelva una copia vieja de la caché HTTP.
        const shell = await caches.open(SHELL_CACHE);
        await shell.addAll(SHELL_URLS.map((url) => new Request(url, { cache: 'reload' })));

        // Si el CDN falla ahora no se aborta la instalación: se reintenta al usarlas.
        const libs = await caches.open(LIB_CACHE);
        await Promise.allSettled(LIB_URLS.map(async (url) => {
            if (await libs.match(url)) return;
            await libs.add(new Request(url, { mode: 'cors', credentials: 'omit' }));
        }));

        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(names
            .filter((name) => name.startsWith('editpdf-shell-') && name !== SHELL_CACHE)
            .map((name) => caches.delete(name)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (CDN_HOSTS.includes(url.hostname)) {
        event.respondWith(cdnCacheFirst(request.url, event));
    } else if (url.origin === self.location.origin) {
        event.respondWith(request.mode === 'navigate'
            ? networkFirst(request, event)
            : staleWhileRevalidate(request, event));
    }
    // Resto: lo gestiona el navegador.
});

// Siempre se pide con mode 'cors': una respuesta opaca se contabiliza en la cuota con ~7 MB de relleno.
async function cdnCacheFirst(url, event) {
    const cache = await caches.open(LIB_CACHE);
    const cached = await cache.match(url, { ignoreVary: true });
    if (cached) return cached;

    const response = await fetch(new Request(url, { mode: 'cors', credentials: 'omit' }));
    if (response.ok) event.waitUntil(cache.put(url, response.clone()));
    return response;
}

// El HTML se pide primero a la red para que las versiones nuevas lleguen en cuanto hay
// conexión; sin red (o con red muy lenta) se usa la copia guardada.
async function networkFirst(request, event) {
    const cache = await caches.open(SHELL_CACHE);
    try {
        const response = await Promise.race([
            fetch(request),
            new Promise((_, reject) => setTimeout(reject, NETWORK_TIMEOUT_MS))
        ]);
        if (response.ok) event.waitUntil(cache.put(request, response.clone()));
        return response;
    } catch (error) {
        return (await cache.match(request, { ignoreSearch: true }))
            || (await cache.match('./index.html'))
            || Response.error();
    }
}

async function staleWhileRevalidate(request, event) {
    const cache = await caches.open(SHELL_CACHE);
    const cached = await cache.match(request, { ignoreSearch: true });
    const update = fetch(request).then((response) => {
        if (response.ok) cache.put(request, response.clone());
        return response;
    });

    if (cached) {
        event.waitUntil(update.catch(() => {}));
        return cached;
    }
    return update;
}
