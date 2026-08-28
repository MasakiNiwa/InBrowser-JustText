import test from 'node:test';
import assert from 'node:assert/strict';

import { detectNewline, normalizeToLf, applyNewline } from '../src/core/newline.js';

test('改行コードを判定する', () => {
  assert.equal(detectNewline('a\nb\nc'), 'lf');
  assert.equal(detectNewline('a\r\nb\r\nc'), 'crlf');
  assert.equal(detectNewline('a\rb\rc'), 'cr');
  assert.equal(detectNewline('改行なし'), 'lf');
});

test('混在時は多数派を採る', () => {
  assert.equal(detectNewline('a\r\nb\r\nc\nd'), 'crlf');
  assert.equal(detectNewline('a\nb\nc\r\nd'), 'lf');
});

test('LF へ正規化する', () => {
  assert.equal(normalizeToLf('a\r\nb\rc\nd'), 'a\nb\nc\nd');
});

test('保存時に改行コードを戻せる', () => {
  assert.equal(applyNewline('a\nb', 'crlf'), 'a\r\nb');
  assert.equal(applyNewline('a\nb', 'cr'), 'a\rb');
  assert.equal(applyNewline('a\nb', 'lf'), 'a\nb');
});

test('正規化してから戻すと元に戻る', () => {
  const source = 'one\r\ntwo\r\nthree';
  const name = detectNewline(source);
  assert.equal(applyNewline(normalizeToLf(source), name), source);
});
