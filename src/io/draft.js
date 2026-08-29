/**
 * Autosaved drafts of whatever is being edited.
 *
 * A copy is kept in IndexedDB so that a tab closing on its own, or the OS
 * killing the app, does not take the work with it; on the next launch the
 * reader is asked whether to restore it. This is only ever a safety net, so
 * when it cannot be written — private browsing, no room left — it gives up
 * quietly rather than getting in the way.
 */

const DB_NAME = 'justtext';
const DB_VERSION = 1;
const STORE = 'drafts';
const KEY = 'current';

/** After one failure, stop trying: repeated failures only cost time. */
let unavailable = false;

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error('IndexedDB is unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('blocked'));
  });
}

/**
 * Opens the store and runs one transaction against it.
 * @returns {Promise<{ok:boolean, value?:any}>}
 */
async function withStore(mode, run) {
  if (unavailable) return { ok: false };
  let db;
  try {
    db = await openDatabase();
  } catch {
    unavailable = true;
    return { ok: false };
  }
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = run(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve({ ok: true, value: request?.result });
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } catch {
    return { ok: false };
  } finally {
    db.close();
  }
}

/**
 * Writes the draft out.
 * @param {{name:string, text:string, savedText:string, encoding:string,
 *          newline:string, bom:boolean, bytes:Uint8Array, untitled:boolean}} draft
 * @returns {Promise<boolean>} whether it was stored
 */
export async function saveDraft(draft) {
  const { ok } = await withStore('readwrite', (store) => store.put({ ...draft, at: Date.now() }, KEY));
  return ok;
}

/** Reads back a leftover draft, or null when there is none. */
export async function loadDraft() {
  const { ok, value } = await withStore('readonly', (store) => store.get(KEY));
  return ok ? (value ?? null) : null;
}

/** Deletes the draft. */
export async function clearDraft() {
  const { ok } = await withStore('readwrite', (store) => store.delete(KEY));
  return ok;
}
