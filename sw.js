/*
 * InBrowser JustText — Service Worker
 *
 *  1. アプリ一式をキャッシュしてオフラインでも起動できるようにする
 *  2. Android の「共有」から POST されたファイルを受け取り、
 *     Cache に置いてから ?share=1 付きでアプリへ転送する
 */

const VERSION = 'v4';
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
  './src/i18n/locales/pt-br.js',
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
  './src/ui/keymap.js',
  './src/ui/settings.js',
  './src/util/dom.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_CACHE);
      // 1 つでも失敗すると全体が入らなくなるので、個別に入れる
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

/** 共有されたファイルを Cache に預けてからアプリへ転送する。 */
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
      // 本文だけが共有されたとき。画面の言語が分からないので中立な名前にする
      name = 'shared.txt';
    }

    const cache = await caches.open(SHARE_CACHE);
    for (const key of await cache.keys()) await cache.delete(key);
    await cache.put(
      new Request(new URL('./__shared__', self.registration.scope)),
      new Response(blob, {
        headers: {
          'content-type': 'application/octet-stream',
          // ヘッダは ASCII しか運べないので日本語ファイル名は URL エンコードする
          'x-justtext-filename': encodeURIComponent(name),
        },
      }),
    );
  } catch {
    /* 受け取れなくてもアプリは開く */
  }
  return Response.redirect(target, 303);
}

/** 画面の読み込みは新しい方を優先し、繋がらなければキャッシュを返す。 */
async function navigationHandler(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(APP_CACHE);
    return (
      (await cache.match(request)) ??
      (await cache.match('./index.html')) ??
      (await cache.match('./')) ??
      new Response('オフラインです', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } })
    );
  }
}

/** 部品はキャッシュを即返しつつ、裏で更新する。 */
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
