import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { looksBinary } from '../src/core/binary.js';
import { decodeText, detectEncoding } from '../src/core/encoding.js';
import { encodeText } from '../src/core/encoder.js';

/** Judges the bytes the same way opening a file does. */
function judge(bytes) {
  const detected = detectEncoding(bytes);
  return looksBinary(bytes, decodeText(bytes, detected.encoding), detected.encoding);
}

const utf8 = (s) => new TextEncoder().encode(s);

test('a PNG is seen as binary', () => {
  const png = new Uint8Array(readFileSync(new URL('../assets/icon-192.png', import.meta.url)));
  assert.equal(judge(png).binary, true);
});

test('ordinary text is not', () => {
  const cases = [
    utf8('こんにちは、世界\n設定ファイルです。'),
    utf8('{"key": "value"}\n'),
    utf8('# comment\nkey=value\npath=/usr/bin\n'), // a config file with no extension
    utf8('@echo off\r\nset PATH=%PATH%;C:\\bin\r\n'), // a .bat file
    encodeText('日本語のテキストです。\r\n設定です。', 'shift_jis').bytes,
    encodeText('日本語のテキストです。', 'euc-jp').bytes,
    new Uint8Array(readFileSync(new URL('../src/main.js', import.meta.url))),
  ];
  for (const bytes of cases) {
    assert.equal(judge(bytes).binary, false, new TextDecoder().decode(bytes).slice(0, 20));
  }
});

test('UTF-16 text is text, NUL bytes and all', () => {
  for (const encoding of ['utf-16le', 'utf-16be']) {
    const bytes = encodeText('UTF-16 の日本語テキストです。', encoding, { bom: true }).bytes;
    assert.equal(judge(bytes).binary, false, encoding);
  }
});

test('an empty file is not binary', () => {
  assert.equal(judge(new Uint8Array(0)).binary, false);
});

test('a coloured terminal log, escape characters and all, is text', () => {
  assert.equal(judge(utf8('\u001b[31mERROR\u001b[0m 失敗しました\n')).binary, false);
});

test('a NUL byte means binary', () => {
  const bytes = new Uint8Array([...utf8('text'), 0x00, ...utf8('more')]);
  const result = looksBinary(bytes, 'text\u0000more', 'utf-8');
  assert.equal(result.binary, true);
  assert.equal(result.reason, 'nul');
});

test('plenty of control characters means binary', () => {
  const text = 'a\u0001\u0002\u0003\u0004\u0005b';
  assert.equal(looksBinary(utf8('abc'), text, 'utf-8').reason, 'control');
});

test('a text full of replacement characters means binary', () => {
  const text = `abc${'\ufffd'.repeat(20)}`;
  const result = looksBinary(utf8('abc'), text, 'utf-8');
  assert.equal(result.binary, true);
  assert.equal(result.reason, 'broken');
});

test('every reason has a string to show for it', async () => {
  const en = (await import('../src/i18n/locales/en.js')).default;
  for (const reason of ['nul', 'control', 'broken']) {
    const key = `file.binaryReason${reason[0].toUpperCase()}${reason.slice(1)}`;
    assert.ok(key in en, `${key} is missing from the catalog`);
  }
});
