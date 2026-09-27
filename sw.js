// Service worker: guarda todos os arquivos do app e serve do cache (cache-first).
// Para publicar uma atualização, rode `npm run bump`: ele troca VERSION por um hash
// do conteúdo. O navegador detecta que o sw.js mudou, instala o cache novo e
// apaga o antigo.

const VERSION = '1cbdd330c4';
const CACHE = `caderno-${VERSION}`;

const ASSETS = [
  './',
  './css/app.css',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './index.html',
  './js/app.js',
  './js/core/backup.js',
  './js/core/csv.js',
  './js/core/format.js',
  './js/core/pdf-report.js',
  './js/core/quiz-import.js',
  './js/core/review.js',
  './js/data/db.js',
  './js/sw-register.js',
  './js/ui/backup.js',
  './js/ui/common.js',
  './js/ui/dom.js',
  './js/ui/files.js',
  './js/ui/folder-form.js',
  './js/ui/folder.js',
  './js/ui/home.js',
  './js/ui/notebook-form.js',
  './js/ui/notebook.js',
  './js/ui/review.js',
  './js/ui/settings.js',
  './manifest.webmanifest',
  './vendor/jspdf.umd.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache: 'reload' ignora o cache HTTP para não guardar arquivos velhos
    await cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('caderno-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Navegação (abrir o app, qualquer #rota) → index.html do cache
    if (req.mode === 'navigate') {
      const page = await cache.match('./index.html');
      if (page) return page;
    }
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    return fetch(req);
  })());
});
