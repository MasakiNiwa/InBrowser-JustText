/*
 * InBrowser JustText — Service Worker
 *
 *  1. Caches the whole app, so it still starts with no connection.
 *  2. Catches the POST from Android's "share" menu, puts the file in the cache
 *     and sends the browser on to the app with ?share=1.
 */

const VERSION = 'v7';
const APP_CACHE = `justtext-app-${VERSION}`;
const SHARE_CACHE = 'justtext-share';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles/app.css',
  './assets/icon.svg',
  './src/main.js',
  './src/version.js',
  './src/core/binary.js',
  './src/core/encoding.js',
  './src/core/encoder.js',
  './src/core/newline.js',
  './src/core/search.js',
  './src/core/history.js',
  './src/core/position.js',
  './src/i18n/index.js',
  './src/i18n/locales/ar.js',
  './src/i18n/locales/de.js',
  './src/i18n/locales/en.js',
  './src/i18n/locales/es.js',
  './src/i18n/locales/fr.js',
  './src/i18n/locales/hi.js',
  './src/i18n/locales/id.js',
  './src/i18n/locales/it.js',
  './src/i18n/locales/ja.js',
  './src/i18n/locales/ko.js',
  './src/i18n/locales/pt.js',
  './src/i18n/locales/th.js',
  './src/i18n/locales/vi.js',
  './src/i18n/locales/zh-hans.js',
  './src/i18n/locales/zh-hant.js',
  './src/io/clipboard.js',
  './src/io/draft.js',
  './src/io/file-system.js',
  './src/io/open.js',
  './src/io/save.js',
  './src/io/share-target.js',
  './src/tools/registry.js',
  './src/tools/json-tools.js',
  './src/tools/text-tools.js',
  './src/ui/editor.js',
  './src/ui/search-panel.js',
  './src/ui/toast.js',
  './src/ui/keybar.js',
  './src/ui/keymap.js',
  './src/ui/settings.js',
  './src/util/dom.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_CACHE);
      // Added one at a time: with addAll, a single failure loses the lot.
      await Promise.all(
        APP_SHELL.map((path) => cache.add(new Request(path, { cache: 'reload' })).catch(() => {})),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('justtext-app-') && name !== APP_CACHE)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Puts the shared file in the cache, then hands over to the app. */
async function handleShare(request) {
  const target = new URL('./?share=1', self.registration.scope).href;
  try {
    const form = await request.formData();
    const files = form.getAll('file').filter((f) => f && typeof f.arrayBuffer === 'function');

    let blob;
    let name;
    if (files.length > 0) {
      blob = files[0];
      name = files[0].name || 'shared.txt';
    } else {
      const parts = ['title', 'text', 'url'].map((k) => form.get(k)).filter(Boolean);
      blob = new Blob([parts.join('\n')], { type: 'text/plain' });
      // Only text was shared. The app's language is unknown here, so the name stays neutral.
      name = 'shared.txt';
    }

    const cache = await caches.open(SHARE_CACHE);
    for (const key of await cache.keys()) await cache.delete(key);
    await cache.put(
      new Request(new URL('./__shared__', self.registration.scope)),
      new Response(blob, {
        headers: {
          'content-type': 'application/octet-stream',
          // Headers carry ASCII only, so a name in any other script travels encoded.
          'x-justtext-filename': encodeURIComponent(name),
        },
      }),
    );
  } catch {
    /* Even if nothing could be taken, still open the app. */
  }
  return Response.redirect(target, 303);
}

/** Page loads prefer the network and fall back to the cache. */
async function navigationHandler(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(APP_CACHE);
    return (
      (await cache.match(request)) ??
      (await cache.match('./index.html')) ??
      (await cache.match('./')) ??
      new Response('Offline', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } })
    );
  }
}

/** Assets come straight from the cache and are refreshed behind the scenes. */
async function assetHandler(request) {
  const cache = await caches.open(APP_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok && response.type === 'basic') cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached ?? (await network) ?? new Response('', { status: 504 });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    event.respondWith(handleShare(request));
    return;
  }
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigationHandler(request));
    return;
  }
  event.respondWith(assetHandler(request));
});
