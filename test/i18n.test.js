import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import en from '../src/i18n/locales/en.js';
import { LOCALES, t, setLocale, getLocale, detectLocale, isSupported, isRtl, normalizeTag, loadCatalog } from '../src/i18n/index.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf-8');

/** Loads every catalog. */
async function allCatalogs() {
  const entries = await Promise.all(
    LOCALES.map(async ({ code }) => [code, (await import(`../src/i18n/locales/${code.toLowerCase()}.js`)).default]),
  );
  return new Map(entries);
}

/** Pulls out every data-i18n key in the HTML, with the text written beside it. */
function textKeysInHtml() {
  const found = [];
  const re = /<(\w+)([^>]*?)\sdata-i18n="([^"]+)"([^>]*)>([^<]*)<\/\1>/g;
  let m;
  while ((m = re.exec(html)) !== null) found.push({ key: m[3], text: m[5] });
  return found;
}

/** The same for the attribute keys, with the real attribute written beside each. */
function attributeKeysInHtml() {
  const found = [];
  for (const [dataAttr, realAttr] of [
    ['data-i18n-placeholder', 'placeholder'],
    ['data-i18n-title', 'title'],
    ['data-i18n-aria-label', 'aria-label'],
  ]) {
    const re = new RegExp(`${dataAttr}="([^"]+)"\\s+${realAttr}="([^"]*)"`, 'g');
    let m;
    while ((m = re.exec(html)) !== null) found.push({ key: m[1], text: m[2] });
  }
  return found;
}

test('the markup carries i18n keys', () => {
  assert.ok(textKeysInHtml().length > 40, 'too few keys on elements');
  assert.ok(attributeKeysInHtml().length > 8, 'too few keys on attributes');
});

test('every key the markup uses is in the catalog', () => {
  const keys = [...textKeysInHtml(), ...attributeKeysInHtml()].map((e) => e.key);
  const missing = keys.filter((key) => !(key in en));
  assert.deepEqual(missing, [], `missing from the English catalog: ${missing.join(', ')}`);
});

test('the text written into the HTML matches the English catalog', () => {
  // Before the JavaScript runs, the screen shows what is in the HTML; after it,
  // what is in the catalog. English is the fallback, so any difference here
  // would make the screen visibly change under an English reader.
  const mismatches = [];
  for (const { key, text } of [...textKeysInHtml(), ...attributeKeysInHtml()]) {
    const expected = en[key];
    const actual = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    if (expected !== undefined && expected !== actual) {
      mismatches.push(`${key}: HTML="${actual}" catalog="${expected}"`);
    }
  }
  assert.deepEqual(mismatches, [], mismatches.join('\n'));
});

test('every language carries the same keys', async () => {
  const catalogs = await allCatalogs();
  const reference = Object.keys(en).sort();
  assert.ok(catalogs.size >= 15, `only ${catalogs.size} languages found`);
  for (const [code, catalog] of catalogs) {
    assert.deepEqual(Object.keys(catalog).sort(), reference, `${code} has drifted from English`);
  }
});

test('no translation is left empty', async () => {
  for (const [code, catalog] of await allCatalogs()) {
    for (const [key, value] of Object.entries(catalog)) {
      assert.equal(typeof value, 'string', `${code}/${key}`);
      assert.ok(value.trim().length > 0, `${code}/${key} is empty`);
    }
  }
});

test('the placeholders line up across languages', async () => {
  const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const [code, catalog] of await allCatalogs()) {
    for (const key of Object.keys(en)) {
      assert.deepEqual(placeholders(catalog[key]), placeholders(en[key]), `${code}/${key} uses different {...} than English`);
    }
  }
});

test('nothing was left sitting in English', async () => {
  // Catches a translation that is really just the English pasted over.
  // Names and symbols read the same everywhere, so they are excused.
  const skip = new Set(['group.json', 'search.regex', 'help.title', 'search.position',
    'newline.lf', 'newline.crlf', 'file.untitled']);
  // These genuinely are spelt the same as the English.
  const sameOnPurpose = new Set([
    'fr:toolbar.region', // French says Actions too
    'de:group.text', // German says Text too
    'it:group.file', // Italian borrows file as it is
    'fr:help.version', // French says Version too
    'de:help.version', // German says Version too
  ]);
  for (const [code, catalog] of await allCatalogs()) {
    if (code === 'en') continue;
    const copied = Object.keys(en).filter(
      (key) => !skip.has(key)
        && !sameOnPurpose.has(`${code}:${key}`)
        && catalog[key] === en[key]
        && /[A-Za-z]{4,}/.test(en[key]),
    );
    assert.deepEqual(copied, [], `still in English under ${code}: ${copied.join(', ')}`);
  }
});

test('the language list holds together', () => {
  const codes = LOCALES.map((l) => l.code);
  assert.equal(new Set(codes).size, codes.length, 'a language code appears twice');
  for (const locale of LOCALES) {
    assert.ok(locale.label.trim().length > 0, `${locale.code} has no label`);
    assert.ok(locale.dir === 'ltr' || locale.dir === 'rtl', `${locale.code} has no writing direction`);
  }
  // Every language the app set out to cover is here.
  for (const code of ['en', 'fr', 'it', 'de', 'es', 'zh-Hans', 'zh-Hant', 'ja', 'ko',
    'pt', 'hi', 'id', 'vi', 'th', 'ar']) {
    assert.ok(codes.includes(code), `${code} is missing`);
  }
});

test('Arabic is known to read right to left', () => {
  assert.equal(isRtl('ar'), true);
  assert.equal(isRtl('en'), false);
  assert.equal(isRtl('ja'), false);
});

test('switching language changes the strings', async () => {
  assert.equal(await setLocale('ja'), true);
  assert.equal(getLocale(), 'ja');
  assert.equal(t('toolbar.open'), '開く');
  assert.equal(await setLocale('ko'), true);
  assert.equal(t('toolbar.open'), '열기');
  assert.equal(await setLocale('ko'), false, 'switching to the same language does nothing');
  assert.equal(await setLocale('no-such-language'), false);
  await setLocale('en');
});

test('placeholders are filled in', async () => {
  await setLocale('ja');
  assert.equal(t('status.counts', { lines: 12, chars: 345 }), '12 行 / 345 文字');
  await setLocale('de');
  assert.equal(t('status.counts', { lines: 12, chars: 345 }), '12 Zeilen / 345 Zeichen');
  await setLocale('en');
});

test('an unknown key comes back as itself, for add-ons to use', () => {
  assert.equal(t('Some external tool'), 'Some external tool');
});

test('maps language tags onto the languages on offer', () => {
  assert.equal(normalizeTag('ja-JP'), 'ja');
  assert.equal(normalizeTag('en'), 'en');
  assert.equal(normalizeTag('fr-CA'), 'fr');
  assert.equal(normalizeTag('pt'), 'pt');
  assert.equal(normalizeTag('pt-PT'), 'pt', 'every region of Portuguese reads the same catalog');
  assert.equal(normalizeTag('in-ID'), 'id', 'what older Android calls Indonesian');
  assert.equal(normalizeTag('id_ID'), 'id', 'an underscore separator is read too');
  assert.equal(normalizeTag('sv-SE'), null, 'a language not on offer gives null');
});

test('Chinese is split into simplified and traditional', () => {
  assert.equal(normalizeTag('zh'), 'zh-Hans');
  assert.equal(normalizeTag('zh-CN'), 'zh-Hans');
  assert.equal(normalizeTag('zh-SG'), 'zh-Hans');
  assert.equal(normalizeTag('zh-Hans-CN'), 'zh-Hans');
  assert.equal(normalizeTag('zh-TW'), 'zh-Hant');
  assert.equal(normalizeTag('zh-HK'), 'zh-Hant');
  assert.equal(normalizeTag('zh-Hant-TW'), 'zh-Hant');
});

test('works out which language to start in', () => {
  assert.equal(detectLocale(['ja-JP', 'en-US']), 'ja');
  assert.equal(detectLocale(['th-TH']), 'th');
  assert.equal(detectLocale(['ar-EG', 'fr-FR']), 'ar');
  assert.equal(detectLocale(['sv-SE', 'de-DE']), 'de', 'takes the first one on offer');
  assert.equal(detectLocale(['sv-SE']), 'en', 'anything else falls back to English');
  assert.equal(detectLocale([]), 'en');
  assert.equal(isSupported('vi'), true);
  assert.equal(isSupported('sv'), false);
});

test('no catalog is fetched for a language not on offer', async () => {
  assert.equal(await loadCatalog('sv'), false);
});
