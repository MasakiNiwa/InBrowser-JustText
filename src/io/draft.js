/**
 * Autosaved drafts of whatever is being edited.
 *
 * A copy is kept in IndexedDB so that a tab closing on its own, or the OS
 * killing the app, does not take the work with it; on the next launch the
 * reader is asked whether to restore it. This is only ever a safety net, so
 * when it cannot be written — private browsing, no room left — it gives up
 * quietly rather than getting in the way.
 *
 * Every draft is stored under a key of its own, and a session only ever writes
 * to the one key it owns. That is what keeps two tabs, or a file arriving from
 * the share menu, from writing over work that nobody has been asked about yet.
 */

const DB_NAME = 'justtext';
const DB_VERSION = 1;
const STORE = 'drafts';

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
 * Writes a draft out under the given key.
 * @param {string} key the writing session's own key
 * @param {{name:string, text:string, savedText:string, encoding:string,
 *          newline:string, bom:boolean, bytes:Uint8Array, untitled:boolean}} draft
 * @returns {Promise<boolean>} whether it was stored
 */
export async function saveDraft(key, draft) {
  const { ok } = await withStore('readwrite', (store) => store.put({ ...draft, key, at: Date.now() }, key));
  return ok;
}

/** Reads one draft back, or null when that key holds nothing. */
export async function loadDraft(key) {
  const { ok, value } = await withStore('readonly', (store) => store.get(key));
  return ok ? (value ?? null) : null;
}

/** Deletes one draft. */
export async function clearDraft(key) {
  const { ok } = await withStore('readwrite', (store) => store.delete(key));
  return ok;
}

/**
 * Every draft that is still around, newest first.
 * Each carries the `key` it is stored under, so the caller can act on it.
 *
 * The key is read from the store rather than from the record, because drafts
 * written before 0.4 hold no key of their own — they all sat under "current".
 * Somebody updating with unsaved work must still be offered it.
 */
export async function listDrafts() {
  const rows = [];
  const { ok } = await withStore('readonly', (store) => {
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const draft = cursor.value;
      if (draft && typeof draft.text === 'string') {
        rows.push({ ...draft, key: typeof draft.key === 'string' ? draft.key : String(cursor.key) });
      }
      cursor.continue();
    };
    return request;
  });
  if (!ok) return [];
  return rows.sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
}

/**
 * Deletes drafts older than the cut-off, so that one nobody ever came back for
 * does not sit in storage indefinitely.
 *
 * @param {number} cutoff drafts last touched before this are dropped
 * @param {Set<string>} [keep] keys to leave alone whatever their age — the ones
 *   another open tab is still writing to
 * @returns {Promise<string[]>} the keys that were dropped
 */
export async function dropDraftsBefore(cutoff, keep = new Set()) {
  const stale = (await listDrafts()).filter(
    (draft) => (draft.at ?? 0) < cutoff && !keep.has(draft.key),
  );
  for (const draft of stale) await clearDraft(draft.key);
  return stale.map((draft) => draft.key);
}
