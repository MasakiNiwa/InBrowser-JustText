/**
 * 表示言語の切り替え。
 *
 * 文言はすべて locales/ の辞書に集約し、画面側は data-i18n 属性で参照する。
 * 言語を足すときは locales/xx.js を作り、下の LOCALES と CATALOGS、
 * それに sw.js の APP_SHELL に追加すれば良い。
 *
 * 辞書に無いキーは英語→キー名の順に読み替えるので、
 * 訳が一部抜けていても画面は壊れない。
 */

import ja from './locales/ja.js';
import en from './locales/en.js';

/** 選択肢として並べる言語。label はその言語自身の表記にする。 */
export const LOCALES = [
  { code: 'ja', label: '日本語' },
  { code: 'en', label: 'English' },
];

const CATALOGS = { ja, en };
const FALLBACK = 'en';

let current = 'ja';
const listeners = new Set();

/** {name} 形式の差し込みを埋める。 */
function format(template, params) {
  return template.replace(/\{(\w+)\}/g, (all, name) => (name in params ? String(params[name]) : all));
}

/** 文言を引く。未知のキーはそのまま返すので、外部の拡張は生の文字列も使える。 */
export function t(key, params = null) {
  const template = CATALOGS[current]?.[key] ?? CATALOGS[FALLBACK]?.[key] ?? key;
  return params ? format(template, params) : template;
}

export function getLocale() {
  return current;
}

export function hasLocale(code) {
  return Object.hasOwn(CATALOGS, code);
}

/** 言語を切り替える。変わったときだけ true を返す。 */
export function setLocale(code) {
  if (!hasLocale(code) || code === current) return false;
  current = code;
  for (const fn of listeners) fn(code);
  return true;
}

/** 言語が変わったときに呼ばれる処理を登録する。 */
export function onLocaleChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * 利用者の言語を推定する。
 * 対応していない言語のときは、日本語より通じやすい英語に寄せる。
 */
export function detectLocale(languages = globalThis.navigator?.languages ?? []) {
  for (const tag of languages) {
    const code = String(tag).toLowerCase().split('-')[0];
    if (hasLocale(code)) return code;
  }
  return FALLBACK;
}

const ATTRIBUTE_KEYS = [
  ['data-i18n-placeholder', 'placeholder'],
  ['data-i18n-title', 'title'],
  ['data-i18n-aria-label', 'aria-label'],
];

/** data-i18n 属性の付いた要素を、今の言語の文言で書き換える。 */
export function applyTranslations(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const [attribute, target] of ATTRIBUTE_KEYS) {
    for (const el of root.querySelectorAll(`[${attribute}]`)) {
      el.setAttribute(target, t(el.getAttribute(attribute)));
    }
  }
  if (root === document || root === document.documentElement) {
    document.documentElement.lang = current;
  }
}

/** 辞書そのもの（テストと整合性チェック用）。 */
export function catalogs() {
  return CATALOGS;
}
