/**
 * ファイルの読み込み。
 * バイト列は保持しておき、あとから文字コードを指定して読み直せるようにする。
 */

import { detectEncoding, decodeText } from '../core/encoding.js';
import { detectNewline, normalizeToLf } from '../core/newline.js';

/** 大きすぎるファイルは警告する目安（バイト）。 */
export const LARGE_FILE_BYTES = 8 * 1024 * 1024;

/**
 * バイト列からドキュメントを組み立てる。
 * @param {Uint8Array} bytes
 * @param {string} name ファイル名
 * @param {string} [forcedEncoding] 指定があれば判別せずその文字コードで読む
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
  };
}

/** File / Blob を読み込んでドキュメントにする。 */
export async function readFile(file, forcedEncoding) {
  const buffer = await file.arrayBuffer();
  return buildDocument(new Uint8Array(buffer), file.name || '無題.txt', forcedEncoding);
}

/** 空のドキュメント。 */
export function emptyDocument(name = '無題.txt') {
  return {
    name,
    bytes: new Uint8Array(0),
    encoding: 'utf-8',
    bom: false,
    newline: 'lf',
    detectionReason: 'new',
    text: '',
  };
}
