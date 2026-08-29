/**
 * The interface language.
 *
 * Every string lives in a catalog under locales/, and the markup points at one
 * through a data-i18n attribute. English ships with the app as the fallback;
 * every other catalog is fetched when it is chosen, so adding languages never
 * makes the app slower to start.
 *
 * A key missing from a catalog falls back to English, then to the key itself,
 * so a half-finished translation still leaves a working screen.
 */

import en from './locales/en.js';

/**
 * The languages on offer.
 * Each label is written in its own language, so people can find theirs without
 * reading any other. Ordered by English name.
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
  { code: 'pt', label: 'Português', dir: 'ltr' },
  { code: 'es', label: 'Español', dir: 'ltr' },
  { code: 'th', label: 'ไทย', dir: 'ltr' },
  { code: 'vi', label: 'Tiếng Việt', dir: 'ltr' },
];

const FALLBACK = 'en';

/** The catalogs loaded so far. English is there from the start. */
const catalogs = new Map([[FALLBACK, en]]);

let current = FALLBACK;
const listeners = new Set();

/** Fills in {name} placeholders. */
function format(template, params) {
  return template.replace(/\{(\w+)\}/g, (all, name) => (name in params ? String(params[name]) : all));
}

/** Looks a string up. An unknown key comes back as itself, so an add-on may pass plain text. */
export function t(key, params = null) {
  const template = catalogs.get(current)?.[key] ?? catalogs.get(FALLBACK)?.[key] ?? key;
  return params ? format(template, params) : template;
}

export function getLocale() {
  return current;
}

/** Whether the language is offered at all — not whether its catalog is loaded. */
export function isSupported(code) {
  return LOCALES.some((locale) => locale.code === code);
}

export function localeInfo(code = current) {
  return LOCALES.find((locale) => locale.code === code) ?? LOCALES.find((l) => l.code === FALLBACK);
}

/** Whether the language is written right to left. */
export function isRtl(code = current) {
  return localeInfo(code).dir === 'rtl';
}

/**
 * Loads a catalog, returning false when it cannot be fetched — in which case
 * the app carries on in English. The file is the language code, lower-cased.
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

/** Switches language, returning true only when something actually changed. */
export async function setLocale(code) {
  if (!isSupported(code) || code === current) return false;
  if (!(await loadCatalog(code))) return false;
  current = code;
  for (const fn of listeners) fn(code);
  return true;
}

/** Registers something to run whenever the language changes. */
export function onLocaleChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Chinese is chosen by script. With only a region to go on, the region decides. */
function resolveChinese(tag) {
  if (tag.includes('hant')) return 'zh-Hant';
  if (tag.includes('hans')) return 'zh-Hans';
  const parts = tag.split('-');
  return parts.some((part) => part === 'tw' || part === 'hk' || part === 'mo') ? 'zh-Hant' : 'zh-Hans';
}

/** Maps a language tag onto one of the offered codes, or null when none fits. */
export function normalizeTag(tag) {
  const lower = String(tag).toLowerCase().replace(/_/g, '-');
  const base = lower.split('-')[0];

  if (base === 'zh') return resolveChinese(lower);
  if (base === 'pt') return 'pt';
  if (base === 'in') return 'id'; // what older Android and Java call Indonesian

  const exact = LOCALES.find((locale) => locale.code.toLowerCase() === lower);
  if (exact) return exact.code;
  const byBase = LOCALES.find((locale) => locale.code.toLowerCase() === base);
  return byBase?.code ?? null;
}

/**
 * Works out which language to start in.
 * Anything not on offer falls to English, as the one most likely to be read.
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

/** Rewrites every element carrying a data-i18n attribute in the current language. */
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
    // The editing surface keeps dir="ltr" of its own (set in index.html), so
    // that line numbers and highlights line up whichever way the page reads.
    document.documentElement.dir = localeInfo().dir;
  }
}

/** The loaded catalogs, for the tests to check against each other. */
export function loadedCatalogs() {
  return catalogs;
}
