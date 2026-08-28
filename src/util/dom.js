/** DOM まわりの小さな道具。 */

import { getLocale } from '../i18n/index.js';

export const $ = (selector, root = document) => root.querySelector(selector);

/** HTML に埋め込める形へ最低限のエスケープをする。 */
export function escapeHtml(str) {
  return str.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'));
}

/** 末尾の呼び出しだけを ms 後に実行する。 */
export function debounce(fn, ms) {
  let timer = 0;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => clearTimeout(timer);
  wrapped.flush = (...args) => {
    clearTimeout(timer);
    fn(...args);
  };
  return wrapped;
}

/** 1 フレームにつき 1 回だけ実行する。 */
export function rafThrottle(fn) {
  let queued = false;
  let lastArgs = null;
  return (...args) => {
    lastArgs = args;
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      fn(...lastArgs);
    });
  };
}

/**
 * 数値を桁区切りで表示する。
 * 区切り記号は表示言語に合わせるが、数字そのものはアラビア数字に固定する
 * （行番号の桁は言語で変えられないため、そちらと見た目を揃える）。
 */
export function formatNumber(n) {
  try {
    return n.toLocaleString(`${getLocale()}-u-nu-latn`);
  } catch {
    return n.toLocaleString('en-US');
  }
}

/** バイト数を読みやすくする。 */
export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
