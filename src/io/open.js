/**
 * Reading files in.
 * The raw bytes are kept, so the file can be re-read later under a different
 * encoding if the guess was wrong.
 */

import { detectEncoding, decodeText } from '../core/encoding.js';
import { detectNewline, normalizeToLf } from '../core/newline.js';

/** Past this many bytes, a file is big enough to warn about. */
export const LARGE_FILE_BYTES = 8 * 1024 * 1024;

/**
 * Builds a document out of bytes.
 * @param {Uint8Array} bytes
 * @param {string} name the file name
 * @param {string} [forcedEncoding] read as this instead of guessing
 */
export function buildDocument(bytes, name, forcedEncoding) {
  const detected = forcedEncoding
    ? { encoding: forcedEncoding, bom: false, reason: 'manual' }
    : detectEncoding(bytes);
  const raw = decodeText(bytes, detected.encoding);
  const newline = detectNewline(raw);
  return {
    name,
    bytes,
    encoding: detected.encoding,
    bom: detected.bom,
    newline,
    detectionReason: detected.reason,
    text: normalizeToLf(raw),
    /** The File System Access handle, when there is one, for writing over it. */
    handle: null,
    /** Whether the name is still a placeholder, free to change with the language. */
    untitled: false,
  };
}

/**
 * Reads a File or Blob into a document.
 * @param {File|Blob} file
 * @param {string} fallbackName name to use for a Blob that has none
 */
export async function readFile(file, { forcedEncoding, fallbackName = 'untitled.txt' } = {}) {
  const buffer = await file.arrayBuffer();
  return buildDocument(new Uint8Array(buffer), file.name || fallbackName, forcedEncoding);
}

/** An empty document. */
export function emptyDocument(name) {
  return {
    name,
    bytes: new Uint8Array(0),
    encoding: 'utf-8',
    bom: false,
    newline: 'lf',
    detectionReason: 'new',
    text: '',
    handle: null,
    untitled: true,
  };
}
