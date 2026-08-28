/**
 * 保存（ダウンロード）。
 *
 * 上書き保存はせず、必ず新しいファイルとして書き出す。
 * 元ファイルを壊さないので、端末側のファイルは常に安全に残る。
 */

import { encodeText } from '../core/encoder.js';
import { applyNewline } from '../core/newline.js';

/**
 * 保存するバイト列を作る。
 * @returns {{bytes:Uint8Array, unencodable:Map<string,number>}}
 */
export function buildFileBytes(text, { encoding = 'utf-8', bom = false, newline = 'lf' } = {}) {
  return encodeText(applyNewline(text, newline), encoding, { bom });
}

/** 拡張子から MIME タイプを推測する（ダウンロード時のヒント）。 */
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
 * バイト列をダウンロードさせる。
 * Android Chrome ではダウンロードフォルダに保存される。
 */
export function downloadBytes(bytes, filename, mime = 'application/octet-stream') {
  // charset を付けない: 実体のバイト列をそのまま渡したいため
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 直後に revoke するとダウンロードが始まらない環境があるので少し待つ
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** 「〜 (1).json」のように連番を付けたファイル名を作る。 */
export function suggestCopyName(filename) {
  const dot = filename.lastIndexOf('.');
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = dot > 0 ? filename.slice(dot) : '';
  const m = /^(.*) \((\d+)\)$/.exec(stem);
  if (m) return `${m[1]} (${Number(m[2]) + 1})${ext}`;
  return `${stem} (1)${ext}`;
}
