/** Small helpers for working with the DOM. */

import { getLocale } from '../i18n/index.js';

export const $ = (selector, root = document) => root.querySelector(selector);

/** Escapes just enough to drop text into HTML safely. */
export function escapeHtml(str) {
  return str.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'));
}

/** Runs only the last call, `ms` after the calls stop. */
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

/** Runs at most once per animation frame. */
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
 * Formats a number with digit grouping.
 * The separator follows the interface language, but the digits stay Latin: the
 * line-number gutter cannot switch numeral systems, and these should match it.
 */
export function formatNumber(n) {
  try {
    return n.toLocaleString(`${getLocale()}-u-nu-latn`);
  } catch {
    return n.toLocaleString('en-US');
  }
}

/** Formats a byte count for people to read. */
export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
