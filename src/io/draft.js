/**
 * 編集中の内容の自動保存（下書き）。
 *
 * タブが突然閉じたり、OS がアプリを終了させたりしても編集内容が消えないよう、
 * IndexedDB に控えを取り、次の起動時に復元するか尋ねる。
 * あくまで保険なので、保存できない環境（プライベートモードや容量不足）でも
 * 本体の動作には影響しないよう、失敗は黙って諦める。
 */

const DB_NAME = 'justtext';
const DB_VERSION = 1;
const STORE = 'drafts';
const KEY = 'current';

/** 一度でも失敗したら、以降は試さない（毎回の失敗で重くしないため）。 */
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
 * 保存庫を開いて操作する。
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
 * 下書きを書き出す。
 * @param {{name:string, text:string, savedText:string, encoding:string,
 *          newline:string, bom:boolean, bytes:Uint8Array, untitled:boolean}} draft
 * @returns {Promise<boolean>} 保存できたか
 */
export async function saveDraft(draft) {
  const { ok } = await withStore('readwrite', (store) => store.put({ ...draft, at: Date.now() }, KEY));
  return ok;
}

/** 残っている下書きを読む。無ければ null。 */
export async function loadDraft() {
  const { ok, value } = await withStore('readonly', (store) => store.get(KEY));
  return ok ? (value ?? null) : null;
}

/** 下書きを消す。 */
export async function clearDraft() {
  const { ok } = await withStore('readwrite', (store) => store.delete(KEY));
  return ok;
}
