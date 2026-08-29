/**
 * Saving, by download.
 *
 * This path always writes a new file rather than replacing one, so whatever is
 * already on the device comes through untouched.
 */

import { encodeText } from '../core/encoder.js';
import { applyNewline } from '../core/newline.js';

/**
 * Builds the bytes to save.
 * @returns {{bytes:Uint8Array, unencodable:Map<string,number>}}
 */
export function buildFileBytes(text, { encoding = 'utf-8', bom = false, newline = 'lf' } = {}) {
  return encodeText(applyNewline(text, newline), encoding, { bom });
}

/** Guesses a MIME type from the extension, as a hint for the download. */
export function guessMimeType(filename) {
  const ext = filename.toLowerCase().split('.').pop();
  const map = {
    json: 'application/json',
    csv: 'text/csv',
    tsv: 'text/tab-separated-values',
    html: 'text/html',
    htm: 'text/html',
    css: 'text/css',
    js: 'text/javascript',
    md: 'text/markdown',
    xml: 'application/xml',
    svg: 'image/svg+xml',
    yaml: 'application/yaml',
    yml: 'application/yaml',
  };
  return map[ext] ?? 'text/plain';
}

/**
 * Hands bytes to the browser as a download.
 * On Android Chrome they land in the Downloads folder.
 */
export function downloadBytes(bytes, filename, mime = 'application/octet-stream') {
  // No charset: the bytes are to be handed over exactly as they are.
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking straight away stops the download from starting in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Makes a numbered name, as in "notes (1).json". */
export function suggestCopyName(filename) {
  const dot = filename.lastIndexOf('.');
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = dot > 0 ? filename.slice(dot) : '';
  const m = /^(.*) \((\d+)\)$/.exec(stem);
  if (m) return `${m[1]} (${Number(m[2]) + 1})${ext}`;
  return `${stem} (1)${ext}`;
}
