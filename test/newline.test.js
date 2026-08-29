import test from 'node:test';
import assert from 'node:assert/strict';

import { detectNewline, normalizeToLf, applyNewline } from '../src/core/newline.js';

test('detects the line ending', () => {
  assert.equal(detectNewline('a\nb\nc'), 'lf');
  assert.equal(detectNewline('a\r\nb\r\nc'), 'crlf');
  assert.equal(detectNewline('a\rb\rc'), 'cr');
  assert.equal(detectNewline('no line breaks at all'), 'lf');
});

test('mixed endings go with the majority', () => {
  assert.equal(detectNewline('a\r\nb\r\nc\nd'), 'crlf');
  assert.equal(detectNewline('a\nb\nc\r\nd'), 'lf');
});

test('normalises to LF', () => {
  assert.equal(normalizeToLf('a\r\nb\rc\nd'), 'a\nb\nc\nd');
});

test('puts the original endings back when saving', () => {
  assert.equal(applyNewline('a\nb', 'crlf'), 'a\r\nb');
  assert.equal(applyNewline('a\nb', 'cr'), 'a\rb');
  assert.equal(applyNewline('a\nb', 'lf'), 'a\nb');
});

test('normalising and putting back is a round trip', () => {
  const source = 'one\r\ntwo\r\nthree';
  const name = detectNewline(source);
  assert.equal(applyNewline(normalizeToLf(source), name), source);
});
