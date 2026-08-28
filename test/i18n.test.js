import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import ja from '../src/i18n/locales/ja.js';
import en from '../src/i18n/locales/en.js';
import { LOCALES, t, setLocale, getLocale, detectLocale, hasLocale, catalogs } from '../src/i18n/index.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf-8');

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

test('すべての言語で同じキーが揃っている', () => {
  const reference = Object.keys(ja).sort();
  for (const { code } of LOCALES) {
    const catalog = catalogs()[code];
    assert.ok(catalog, `${code} の辞書がありません`);
    assert.deepEqual(Object.keys(catalog).sort(), reference, `${code} のキーが日本語とずれています`);
  }
});

test('訳が空文字になっていない', () => {
  for (const { code } of LOCALES) {
    for (const [key, value] of Object.entries(catalogs()[code])) {
      assert.equal(typeof value, 'string', `${code}/${key}`);
      assert.ok(value.length > 0, `${code}/${key} が空です`);
    }
  }
});

test('差し込み記号が言語間で揃っている', () => {
  const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const key of Object.keys(ja)) {
    assert.deepEqual(placeholders(en[key]), placeholders(ja[key]), `${key} の {...} が英語と日本語で違います`);
  }
});

test('言語を切り替えると文言が変わる', () => {
  setLocale('ja');
  assert.equal(getLocale(), 'ja');
  assert.equal(t('toolbar.open'), '開く');
  assert.equal(setLocale('en'), true);
  assert.equal(t('toolbar.open'), 'Open');
  assert.equal(setLocale('en'), false, '同じ言語なら何も起きない');
  assert.equal(setLocale('存在しない言語'), false);
  setLocale('ja');
});

test('差し込みが働く', () => {
  setLocale('ja');
  assert.equal(t('status.counts', { lines: 12, chars: 345 }), '12 行 / 345 文字');
  setLocale('en');
  assert.equal(t('status.counts', { lines: 12, chars: 345 }), '12 lines / 345 chars');
  setLocale('ja');
});

test('辞書に無いキーはそのまま返す（外部拡張のため）', () => {
  assert.equal(t('外部ツールの名前'), '外部ツールの名前');
});

test('利用者の言語を推定する', () => {
  assert.equal(detectLocale(['ja-JP', 'en-US']), 'ja');
  assert.equal(detectLocale(['en-GB']), 'en');
  assert.equal(detectLocale(['fr-FR', 'de']), 'en', '未対応の言語は英語に寄せる');
  assert.equal(detectLocale([]), 'en');
  assert.equal(hasLocale('ja'), true);
  assert.equal(hasLocale('xx'), false);
});
