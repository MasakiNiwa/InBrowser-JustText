import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { looksBinary } from '../src/core/binary.js';
import { decodeText, detectEncoding } from '../src/core/encoding.js';
import { encodeText } from '../src/core/encoder.js';

/** ファイルを開いたときと同じ手順で判定する。 */
function judge(bytes) {
  const detected = detectEncoding(bytes);
  return looksBinary(bytes, decodeText(bytes, detected.encoding), detected.encoding);
}

const utf8 = (s) => new TextEncoder().encode(s);

test('PNG 画像はバイナリと判定する', () => {
  const png = new Uint8Array(readFileSync(new URL('../assets/icon-192.png', import.meta.url)));
  assert.equal(judge(png).binary, true);
});

test('普通のテキストはバイナリと判定しない', () => {
  const cases = [
    utf8('こんにちは、世界\n設定ファイルです。'),
    utf8('{"key": "value"}\n'),
    utf8('# コメント\nkey=value\npath=/usr/bin\n'), // 拡張子なしの設定ファイル想定
    utf8('@echo off\r\nset PATH=%PATH%;C:\\bin\r\n'), // .bat 想定
    encodeText('日本語のテキストです。\r\n設定です。', 'shift_jis').bytes,
    encodeText('日本語のテキストです。', 'euc-jp').bytes,
    new Uint8Array(readFileSync(new URL('../src/main.js', import.meta.url))),
  ];
  for (const bytes of cases) {
    assert.equal(judge(bytes).binary, false, new TextDecoder().decode(bytes).slice(0, 20));
  }
});

test('UTF-16 のテキストは NUL があってもバイナリ扱いしない', () => {
  for (const encoding of ['utf-16le', 'utf-16be']) {
    const bytes = encodeText('UTF-16 の日本語テキストです。', encoding, { bom: true }).bytes;
    assert.equal(judge(bytes).binary, false, encoding);
  }
});

test('空ファイルはバイナリ扱いしない', () => {
  assert.equal(judge(new Uint8Array(0)).binary, false);
});

test('端末の色付きログ（エスケープ文字入り）は許容する', () => {
  assert.equal(judge(utf8('\u001b[31mERROR\u001b[0m 失敗しました\n')).binary, false);
});

test('NUL バイトを含むとバイナリと判定する', () => {
  const bytes = new Uint8Array([...utf8('text'), 0x00, ...utf8('more')]);
  const result = looksBinary(bytes, 'text\u0000more', 'utf-8');
  assert.equal(result.binary, true);
  assert.equal(result.reason, 'nul');
});

test('制御文字が多いとバイナリと判定する', () => {
  const text = 'a\u0001\u0002\u0003\u0004\u0005b';
  assert.equal(looksBinary(utf8('abc'), text, 'utf-8').reason, 'control');
});

test('置換文字だらけならバイナリと判定する', () => {
  const text = `abc${'\ufffd'.repeat(20)}`;
  const result = looksBinary(utf8('abc'), text, 'utf-8');
  assert.equal(result.binary, true);
  assert.equal(result.reason, 'broken');
});

test('判定の理由には対応する文言のキーがある', async () => {
  const ja = (await import('../src/i18n/locales/ja.js')).default;
  for (const reason of ['nul', 'control', 'broken']) {
    const key = `file.binaryReason${reason[0].toUpperCase()}${reason.slice(1)}`;
    assert.ok(key in ja, `${key} が辞書にありません`);
  }
});
