/**
 * File System Access API のごく薄い包み。
 *
 * 対応している環境（今のところ主にパソコンの Chrome / Edge）では、
 * 保存先を選んで既存のファイルへ上書きできる。
 * 対応していない環境では何も生えないだけで、ダウンロード保存は常に使える。
 */

/** 保存先を選ぶ操作が使えるか。 */
export function canPickSaveLocation() {
  return typeof globalThis.showSaveFilePicker === 'function';
}

/** 利用者が操作を取り消したことを表すエラーか。 */
function isAbort(error) {
  return error?.name === 'AbortError';
}

/**
 * 保存先を選んでもらう。取り消されたら null。
 * @returns {Promise<FileSystemFileHandle|null>}
 */
export async function pickSaveLocation({ suggestedName, mime = 'text/plain', extension }) {
  const options = { suggestedName };
  if (extension) {
    options.types = [{ description: suggestedName, accept: { [mime]: [extension] } }];
  }
  try {
    return await globalThis.showSaveFilePicker(options);
  } catch (error) {
    if (isAbort(error)) return null;
    throw error;
  }
}

/** 書き込みの許可を確かめる。必要なら利用者に尋ねる。 */
export async function ensureWritePermission(handle) {
  if (typeof handle?.queryPermission !== 'function') return true; // 確認の仕組みが無い環境
  const options = { mode: 'readwrite' };
  if ((await handle.queryPermission(options)) === 'granted') return true;
  return (await handle.requestPermission(options)) === 'granted';
}

/**
 * 掴んでいるファイルへ書き込む（上書き）。
 * 許可が下りなければ false を返す。
 */
export async function writeToHandle(handle, bytes) {
  if (!(await ensureWritePermission(handle))) return false;
  const writable = await handle.createWritable();
  try {
    await writable.write(bytes);
    // close() で初めて元のファイルと入れ替わる。ここまで来て初めて確定させる。
    await writable.close();
  } catch (error) {
    // 途中で失敗したときは書き込みを捨てて、元のファイルをそのまま残す
    await writable.abort?.().catch(() => {});
    throw error;
  }
  return true;
}
