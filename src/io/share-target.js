/**
 * Picking up a file sent through Android's "share" menu.
 *
 * The Service Worker intercepts the POST to share_target, puts the file in the
 * Cache API and redirects here with ?share=1. This is where it gets collected.
 */

const SHARE_CACHE = 'justtext-share';

/** Whether the URL carries the share flag. */
export function hasSharePayload(location = window.location) {
  return new URLSearchParams(location.search).has('share');
}

/** Drops the share flag from the address bar, so a reload cannot re-open it. */
export function clearShareFlag() {
  const url = new URL(window.location.href);
  url.searchParams.delete('share');
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);
}

/**
 * Takes the shared file, removing it from the cache on the way out.
 * When the name did not come through, `name` is null and the caller supplies
 * one of its own.
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
    // File names can hold non-ASCII, so they travel URL-encoded.
    const encoded = response.headers.get('x-justtext-filename') || '';
    let name = null;
    try {
      if (encoded) name = decodeURIComponent(encoded);
    } catch {
      /* Malformed: let the caller name it instead. */
    }
    const buffer = await response.arrayBuffer();
    return { name, bytes: new Uint8Array(buffer) };
  } catch {
    return null;
  }
}
