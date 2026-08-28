/**
 * 表示言語の切り替え。
 *
 * 文言はすべて locales/ の辞書に集約し、画面側は data-i18n 属性で参照する。
 * 英語だけは予備として同梱し、それ以外は選ばれたときに読み込む
 * （言語が増えても起動時に読む量が変わらないようにするため）。
 *
 * 辞書に無いキーは英語→キー名の順に読み替えるので、
 * 訳が一部抜けていても画面は壊れない。
 */

import en from './locales/en.js';

/**
 * 選択肢として並べる言語。
 * label はその言語自身の表記（自分の言語を探しやすくするため）。
 * 並びは英語名のアルファベット順。
 */
export const LOCALES = [
  { code: 'ar', label: 'العربية', dir: 'rtl' },
  { code: 'zh-Hans', label: '简体中文', dir: 'ltr' },
  { code: 'zh-Hant', label: '繁體中文', dir: 'ltr' },
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'fr', label: 'Français', dir: 'ltr' },
  { code: 'de', label: 'Deutsch', dir: 'ltr' },
  { code: 'hi', label: 'हिन्दी', dir: 'ltr' },
  { code: 'id', label: 'Bahasa Indonesia', dir: 'ltr' },
  { code: 'it', label: 'Italiano', dir: 'ltr' },
  { code: 'ja', label: '日本語', dir: 'ltr' },
  { code: 'ko', label: '한국어', dir: 'ltr' },
  { code: 'pt-BR', label: 'Português (Brasil)', dir: 'ltr' },
  { code: 'es', label: 'Español', dir: 'ltr' },
  { code: 'th', label: 'ไทย', dir: 'ltr' },
  { code: 'vi', label: 'Tiếng Việt', dir: 'ltr' },
];

const FALLBACK = 'en';

/** 読み込み済みの辞書。英語は最初から入れておく。 */
const catalogs = new Map([[FALLBACK, en]]);

let current = FALLBACK;
const listeners = new Set();

/** {name} 形式の差し込みを埋める。 */
function format(template, params) {
  return template.replace(/\{(\w+)\}/g, (all, name) => (name in params ? String(params[name]) : all));
}

/** 文言を引く。未知のキーはそのまま返すので、外部の拡張は生の文字列も使える。 */
export function t(key, params = null) {
  const template = catalogs.get(current)?.[key] ?? catalogs.get(FALLBACK)?.[key] ?? key;
  return params ? format(template, params) : template;
}

export function getLocale() {
  return current;
}

/** 対応している言語か（辞書を読み込んでいるかどうかとは別）。 */
export function isSupported(code) {
  return LOCALES.some((locale) => locale.code === code);
}

export function localeInfo(code = current) {
  return LOCALES.find((locale) => locale.code === code) ?? LOCALES.find((l) => l.code === FALLBACK);
}

/** 右から左に書く言語か。 */
export function isRtl(code = current) {
  return localeInfo(code).dir === 'rtl';
}

/**
 * 辞書を読み込む。読み込めなければ false（英語のまま動かす）。
 * ファイル名は言語コードを小文字にしたもの。
 */
export async function loadCatalog(code) {
  if (catalogs.has(code)) return true;
  if (!isSupported(code)) return false;
  try {
    const module = await import(`./locales/${code.toLowerCase()}.js`);
    catalogs.set(code, module.default);
    return true;
  } catch {
    return false;
  }
}

/** 言語を切り替える。切り替わったときだけ true を返す。 */
export async function setLocale(code) {
  if (!isSupported(code) || code === current) return false;
  if (!(await loadCatalog(code))) return false;
  current = code;
  for (const fn of listeners) fn(code);
  return true;
}

/** 言語が変わったときに呼ばれる処理を登録する。 */
export function onLocaleChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 中国語は文字（簡体・繁体）で選ぶ。地域しか分からない場合は地域から推測する。 */
function resolveChinese(tag) {
  if (tag.includes('hant')) return 'zh-Hant';
  if (tag.includes('hans')) return 'zh-Hans';
  const parts = tag.split('-');
  return parts.some((part) => part === 'tw' || part === 'hk' || part === 'mo') ? 'zh-Hant' : 'zh-Hans';
}

/** 言語タグを、対応している言語コードに読み替える。合うものが無ければ null。 */
export function normalizeTag(tag) {
  const lower = String(tag).toLowerCase().replace(/_/g, '-');
  const base = lower.split('-')[0];

  if (base === 'zh') return resolveChinese(lower);
  if (base === 'pt') return 'pt-BR'; // ポルトガル語はブラジル向けの訳だけ用意している
  if (base === 'in') return 'id'; // 古い Android / Java でのインドネシア語の表記

  const exact = LOCALES.find((locale) => locale.code.toLowerCase() === lower);
  if (exact) return exact.code;
  const byBase = LOCALES.find((locale) => locale.code.toLowerCase() === base);
  return byBase?.code ?? null;
}

/**
 * 利用者の言語を推定する。
 * 対応していない言語のときは、いちばん通じやすい英語にする。
 */
export function detectLocale(languages = globalThis.navigator?.languages ?? []) {
  for (const tag of languages) {
    const code = normalizeTag(tag);
    if (code) return code;
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
    // 編集面だけは dir="ltr" を保つ（index.html で指定済み）。
    // 行番号や強調表示の位置合わせが、書字方向に左右されないようにするため。
    document.documentElement.dir = localeInfo().dir;
  }
}

/** 読み込み済みの辞書（テストと整合性チェック用）。 */
export function loadedCatalogs() {
  return catalogs;
}
