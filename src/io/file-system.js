/**
 * A thin wrapper over the File System Access API.
 *
 * Where it exists — today that mostly means Chrome and Edge on a computer — the
 * reader can choose where a file goes and write over an existing one. Where it
 * does not, those options simply never appear; saving by download always works.
 */

/** Whether choosing a save location is possible here. */
export function canPickSaveLocation() {
  return typeof globalThis.showSaveFilePicker === 'function';
}

/** Whether this error just means the reader cancelled. */
function isAbort(error) {
  return error?.name === 'AbortError';
}

/**
 * Asks where to save. Returns null when the reader cancels.
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

/** Checks for write permission, asking the reader for it when needed. */
export async function ensureWritePermission(handle) {
  if (typeof handle?.queryPermission !== 'function') return true; // nothing here to ask with
  const options = { mode: 'readwrite' };
  if ((await handle.queryPermission(options)) === 'granted') return true;
  return (await handle.requestPermission(options)) === 'granted';
}

/**
 * Writes over the file behind a handle.
 * Returns false when permission is refused.
 */
export async function writeToHandle(handle, bytes) {
  if (!(await ensureWritePermission(handle))) return false;
  const writable = await handle.createWritable();
  try {
    await writable.write(bytes);
    // Only close() swaps the new contents in, so nothing is final until here.
    await writable.close();
  } catch (error) {
    // Failing partway through: throw the write away and leave the original alone.
    await writable.abort?.().catch(() => {});
    throw error;
  }
  return true;
}
