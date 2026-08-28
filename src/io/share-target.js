/**
 * Android の「共有」から受け取ったファイルの取り出し。
 *
 * Service Worker が share_target への POST を横取りして Cache API に置き、
 * ?share=1 付きでこのページへ戻してくる。ここではそれを回収する。
 */

const SHARE_CACHE = 'justtext-share';

/** URL に共有フラグが付いているか。 */
export function hasSharePayload(location = window.location) {
  return new URLSearchParams(location.search).has('share');
}

/** アドレスバーから共有フラグを消す（再読み込みで二重に開かないように）。 */
export function clearShareFlag() {
  const url = new URL(window.location.href);
  url.searchParams.delete('share');
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);
}

/**
 * 共有されたファイルを取り出す。取り出したら Cache からは消す。
 * 名前が分からない場合は name を null で返し、呼び出し側で既定名を付ける。
 * @returns {Promise<{name:string|null, bytes:Uint8Array}|null>}
 */
export async function takeSharedFile() {
  if (!('caches' in window)) return null;
  try {
    const cache = await caches.open(SHARE_CACHE);
    const keys = await cache.keys();
    if (keys.length === 0) return null;
    const request = keys[0];
    const response = await cache.match(request);
    await cache.delete(request);
    if (!response) return null;
    // ファイル名は非 ASCII を含むため URL エンコードして渡してある
    const encoded = response.headers.get('x-justtext-filename') || '';
    let name = null;
    try {
      if (encoded) name = decodeURIComponent(encoded);
    } catch {
      /* 壊れていれば呼び出し側の既定名に任せる */
    }
    const buffer = await response.arrayBuffer();
    return { name, bytes: new Uint8Array(buffer) };
  } catch {
    return null;
  }
}
