import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import ja from '../src/i18n/locales/ja.js';
import en from '../src/i18n/locales/en.js';
import { LOCALES, t, setLocale, getLocale, detectLocale, isSupported, isRtl, normalizeTag, loadCatalog } from '../src/i18n/index.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf-8');

/** すべての言語の辞書を読み込む。 */
async function allCatalogs() {
  const entries = await Promise.all(
    LOCALES.map(async ({ code }) => [code, (await import(`../src/i18n/locales/${code.toLowerCase()}.js`)).default]),
  );
  return new Map(entries);
}

/** HTML から data-i18n="キー" と、その要素の中身を取り出す。 */
function textKeysInHtml() {
  const found = [];
  const re = /<(\w+)([^>]*?)\sdata-i18n="([^"]+)"([^>]*)>([^<]*)<\/\1>/g;
  let m;
  while ((m = re.exec(html)) !== null) found.push({ key: m[3], text: m[5] });
  return found;
}

/** data-i18n-placeholder などの属性と、その隣に書かれている実際の値を取り出す。 */
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

test('画面に i18n キーが埋め込まれている', () => {
  assert.ok(textKeysInHtml().length > 40, '本文のキーが少なすぎます');
  assert.ok(attributeKeysInHtml().length > 8, '属性のキーが少なすぎます');
});

test('画面で使うキーはすべて辞書にある', () => {
  const keys = [...textKeysInHtml(), ...attributeKeysInHtml()].map((e) => e.key);
  const missing = keys.filter((key) => !(key in ja));
  assert.deepEqual(missing, [], `日本語の辞書に無いキー: ${missing.join(', ')}`);
});

test('HTML に直接書かれた文言が日本語の辞書と一致する', () => {
  // 既定の表示は HTML の文言、切り替え後は辞書の文言になるため、
  // ここがずれると言語を戻したときに表示が変わってしまう
  const mismatches = [];
  for (const { key, text } of [...textKeysInHtml(), ...attributeKeysInHtml()]) {
    const expected = ja[key];
    const actual = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    if (expected !== undefined && expected !== actual) {
      mismatches.push(`${key}: HTML="${actual}" 辞書="${expected}"`);
    }
  }
  assert.deepEqual(mismatches, [], mismatches.join('\n'));
});

test('すべての言語で同じキーが揃っている', async () => {
  const catalogs = await allCatalogs();
  const reference = Object.keys(en).sort();
  assert.ok(catalogs.size >= 15, `言語が ${catalogs.size} 件しかありません`);
  for (const [code, catalog] of catalogs) {
    assert.deepEqual(Object.keys(catalog).sort(), reference, `${code} のキーが英語とずれています`);
  }
});

test('訳が空文字になっていない', async () => {
  for (const [code, catalog] of await allCatalogs()) {
    for (const [key, value] of Object.entries(catalog)) {
      assert.equal(typeof value, 'string', `${code}/${key}`);
      assert.ok(value.trim().length > 0, `${code}/${key} が空です`);
    }
  }
});

test('差し込み記号が言語間で揃っている', async () => {
  const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const [code, catalog] of await allCatalogs()) {
    for (const key of Object.keys(en)) {
      assert.deepEqual(placeholders(catalog[key]), placeholders(en[key]), `${code}/${key} の {...} が英語と違います`);
    }
  }
});

test('英語のまま残っている訳が無い', async () => {
  // 翻訳漏れ（英語をそのまま貼っただけ）を洗い出す。
  // 固有名詞や記号だけの項目は、どの言語でも同じになるので除く。
  const skip = new Set(['group.json', 'search.regex', 'help.title', 'search.position',
    'newline.lf', 'newline.crlf', 'file.untitled']);
  // 英語とたまたま同じ綴りになるのが正しい組み合わせ
  const sameOnPurpose = new Set([
    'fr:toolbar.region', // フランス語でも Actions
    'de:group.text', // ドイツ語でも Text
    'it:group.file', // イタリア語では file をそのまま使う
    'fr:help.version', // フランス語でも Version
    'de:help.version', // ドイツ語でも Version
  ]);
  for (const [code, catalog] of await allCatalogs()) {
    if (code === 'en') continue;
    const copied = Object.keys(en).filter(
      (key) => !skip.has(key)
        && !sameOnPurpose.has(`${code}:${key}`)
        && catalog[key] === en[key]
        && /[A-Za-z]{4,}/.test(en[key]),
    );
    assert.deepEqual(copied, [], `${code} で英語のままのキー: ${copied.join(', ')}`);
  }
});

test('言語の一覧が整っている', () => {
  const codes = LOCALES.map((l) => l.code);
  assert.equal(new Set(codes).size, codes.length, '言語コードが重複しています');
  for (const locale of LOCALES) {
    assert.ok(locale.label.trim().length > 0, `${locale.code} の表示名がありません`);
    assert.ok(locale.dir === 'ltr' || locale.dir === 'rtl', `${locale.code} の書字方向が不正です`);
  }
  // 要望のあった主要言語がすべて入っていること
  for (const code of ['en', 'fr', 'it', 'de', 'es', 'zh-Hans', 'zh-Hant', 'ja', 'ko',
    'pt-BR', 'hi', 'id', 'vi', 'th', 'ar']) {
    assert.ok(codes.includes(code), `${code} がありません`);
  }
});

test('アラビア語は右から左と分かる', () => {
  assert.equal(isRtl('ar'), true);
  assert.equal(isRtl('en'), false);
  assert.equal(isRtl('ja'), false);
});

test('言語を切り替えると文言が変わる', async () => {
  assert.equal(await setLocale('ja'), true);
  assert.equal(getLocale(), 'ja');
  assert.equal(t('toolbar.open'), '開く');
  assert.equal(await setLocale('ko'), true);
  assert.equal(t('toolbar.open'), '열기');
  assert.equal(await setLocale('ko'), false, '同じ言語なら何も起きない');
  assert.equal(await setLocale('存在しない言語'), false);
  await setLocale('en');
});

test('差し込みが働く', async () => {
  await setLocale('ja');
  assert.equal(t('status.counts', { lines: 12, chars: 345 }), '12 行 / 345 文字');
  await setLocale('de');
  assert.equal(t('status.counts', { lines: 12, chars: 345 }), '12 Zeilen / 345 Zeichen');
  await setLocale('en');
});

test('辞書に無いキーはそのまま返す（外部拡張のため）', () => {
  assert.equal(t('外部ツールの名前'), '外部ツールの名前');
});

test('言語タグを対応言語に読み替える', () => {
  assert.equal(normalizeTag('ja-JP'), 'ja');
  assert.equal(normalizeTag('en'), 'en');
  assert.equal(normalizeTag('fr-CA'), 'fr');
  assert.equal(normalizeTag('pt'), 'pt-BR');
  assert.equal(normalizeTag('pt-PT'), 'pt-BR', 'ポルトガル語はブラジル向けの訳に寄せる');
  assert.equal(normalizeTag('in-ID'), 'id', '古い Android の表記');
  assert.equal(normalizeTag('id_ID'), 'id', '下線区切りでも読める');
  assert.equal(normalizeTag('sv-SE'), null, '未対応の言語は null');
});

test('中国語は簡体と繁体を書き分ける', () => {
  assert.equal(normalizeTag('zh'), 'zh-Hans');
  assert.equal(normalizeTag('zh-CN'), 'zh-Hans');
  assert.equal(normalizeTag('zh-SG'), 'zh-Hans');
  assert.equal(normalizeTag('zh-Hans-CN'), 'zh-Hans');
  assert.equal(normalizeTag('zh-TW'), 'zh-Hant');
  assert.equal(normalizeTag('zh-HK'), 'zh-Hant');
  assert.equal(normalizeTag('zh-Hant-TW'), 'zh-Hant');
});

test('利用者の言語を推定する', () => {
  assert.equal(detectLocale(['ja-JP', 'en-US']), 'ja');
  assert.equal(detectLocale(['th-TH']), 'th');
  assert.equal(detectLocale(['ar-EG', 'fr-FR']), 'ar');
  assert.equal(detectLocale(['sv-SE', 'de-DE']), 'de', '対応している方を選ぶ');
  assert.equal(detectLocale(['sv-SE']), 'en', '未対応の言語は英語にする');
  assert.equal(detectLocale([]), 'en');
  assert.equal(isSupported('vi'), true);
  assert.equal(isSupported('sv'), false);
});

test('未対応の言語の辞書は読み込まない', async () => {
  assert.equal(await loadCatalog('sv'), false);
});
