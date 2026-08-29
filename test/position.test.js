import test from 'node:test';
import assert from 'node:assert/strict';

import { LineIndex, expandToLines } from '../src/core/position.js';

const TEXT = 'abc\ndefgh\n\nxyz';

test('counts the lines', () => {
  assert.equal(new LineIndex(TEXT).lineCount, 4);
  assert.equal(new LineIndex('').lineCount, 1);
  assert.equal(new LineIndex('a\n').lineCount, 2);
});

test('turns an offset into a line and column', () => {
  const index = new LineIndex(TEXT);
  assert.deepEqual([index.lineAt(0), index.columnAt(0)], [1, 1]);
  assert.deepEqual([index.lineAt(3), index.columnAt(3)], [1, 4]);
  assert.deepEqual([index.lineAt(4), index.columnAt(4)], [2, 1]);
  assert.deepEqual([index.lineAt(10), index.columnAt(10)], [3, 1]);
  assert.deepEqual([index.lineAt(14), index.columnAt(14)], [4, 4]);
});

test('an offset out of range does not break it', () => {
  const index = new LineIndex(TEXT);
  assert.equal(index.lineAt(-5), 1);
  assert.equal(index.lineAt(9999), 4);
});

test('turns a line number into an offset', () => {
  const index = new LineIndex(TEXT);
  assert.equal(index.offsetAt(1), 0);
  assert.equal(index.offsetAt(2), 4);
  assert.equal(index.offsetAt(3), 10);
  assert.equal(index.offsetAt(4), 11);
  assert.equal(index.offsetAt(99), 11); // past the end lands on the last line
});

test('finds where a line starts and ends', () => {
  const index = new LineIndex(TEXT);
  assert.deepEqual(index.lineRange(1), { start: 0, end: 3 });
  assert.deepEqual(index.lineRange(2), { start: 4, end: 9 });
  assert.deepEqual(index.lineRange(3), { start: 10, end: 10 });
  assert.deepEqual(index.lineRange(4), { start: 11, end: 14 });
});

test('still finds the line in a large text', () => {
  const big = Array.from({ length: 50000 }, (_, i) => `line ${i}`).join('\n');
  const index = new LineIndex(big);
  assert.equal(index.lineCount, 50000);
  const offset = index.offsetAt(31337);
  assert.equal(index.lineAt(offset), 31337);
  assert.equal(big.slice(offset, offset + 10), 'line 31336');
});

test('widens a selection out to whole lines', () => {
  assert.deepEqual(expandToLines(TEXT, 5, 6), { start: 4, end: 9 });
  assert.deepEqual(expandToLines(TEXT, 0, 0), { start: 0, end: 3 });
  assert.deepEqual(expandToLines(TEXT, 5, 11), { start: 4, end: 14 });
});
