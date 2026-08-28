import test from 'node:test';
import assert from 'node:assert/strict';

import { History } from '../src/core/history.js';

const state = (text, caret = text.length) => ({ text, selectionStart: caret, selectionEnd: caret });

test('初期状態では戻せない', () => {
  const h = new History();
  h.reset(state('a'));
  assert.equal(h.canUndo, false);
  assert.equal(h.canRedo, false);
  assert.equal(h.undo(), null);
});

test('記録して戻す / やり直す', () => {
  const h = new History();
  h.reset(state('a'));
  h.record(state('ab'), { key: null });
  h.record(state('abc'), { key: null });
  assert.equal(h.undo().text, 'ab');
  assert.equal(h.undo().text, 'a');
  assert.equal(h.canUndo, false);
  assert.equal(h.redo().text, 'ab');
  assert.equal(h.redo().text, 'abc');
  assert.equal(h.canRedo, false);
});

test('連続した同種の入力は 1 手にまとまる', () => {
  const h = new History();
  h.reset(state(''));
  h.record(state('a'), { key: 'insertText', now: 1000 });
  h.record(state('ab'), { key: 'insertText', now: 1100 });
  h.record(state('abc'), { key: 'insertText', now: 1200 });
  assert.equal(h.stack.length, 2);
  assert.equal(h.undo().text, '');
});

test('時間が空くと別の手になる', () => {
  const h = new History();
  h.reset(state(''));
  h.record(state('a'), { key: 'insertText', now: 1000 });
  h.record(state('ab'), { key: 'insertText', now: 9000 });
  assert.equal(h.stack.length, 3);
  assert.equal(h.undo().text, 'a');
});

test('種類が変わると別の手になる', () => {
  const h = new History();
  h.reset(state(''));
  h.record(state('ab'), { key: 'insertText', now: 1000 });
  h.record(state('a'), { key: 'deleteContentBackward', now: 1050 });
  assert.equal(h.stack.length, 3);
});

test('戻した後に編集すると、やり直し分は消える', () => {
  const h = new History();
  h.reset(state('a'));
  h.record(state('ab'), { key: null });
  h.record(state('abc'), { key: null });
  h.undo();
  h.record(state('abX'), { key: null });
  assert.equal(h.canRedo, false);
  assert.deepEqual(h.stack.map((s) => s.text), ['a', 'ab', 'abX']);
});

test('内容が同じならカーソル位置だけ更新する', () => {
  const h = new History();
  h.reset(state('abc', 0));
  const recorded = h.record(state('abc', 2), { key: null });
  assert.equal(recorded, false);
  assert.equal(h.stack.length, 1);
  assert.equal(h.current.selectionStart, 2);
});

test('戻した直後の入力は前の手にまとめない', () => {
  const h = new History();
  h.reset(state(''));
  h.record(state('a'), { key: 'insertText', now: 1000 });
  h.undo();
  h.record(state('b'), { key: 'insertText', now: 1100 });
  assert.equal(h.undo().text, '');
});

test('上限を超えると古い履歴から捨てる', () => {
  const h = new History({ limit: 5 });
  h.reset(state('0'));
  for (let i = 1; i <= 20; i++) h.record(state(String(i)), { key: null });
  assert.equal(h.stack.length, 5);
  assert.equal(h.current.text, '20');
  assert.equal(h.stack[0].text, '16');
});

test('総量の上限でも履歴を捨てる', () => {
  const h = new History({ budget: 50 });
  h.reset(state(''));
  for (let i = 0; i < 20; i++) h.record(state('x'.repeat(10) + i), { key: null });
  assert.ok(h.stack.length <= 6, `実際: ${h.stack.length}`);
  assert.equal(h.current.text.endsWith('19'), true);
});
