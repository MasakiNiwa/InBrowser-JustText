import test from 'node:test';
import assert from 'node:assert/strict';

import { History } from '../src/core/history.js';

const state = (text, caret = text.length) => ({ text, selectionStart: caret, selectionEnd: caret });

test('a fresh history has nothing to undo', () => {
  const h = new History();
  h.reset(state('a'));
  assert.equal(h.canUndo, false);
  assert.equal(h.canRedo, false);
  assert.equal(h.undo(), null);
});

test('records, undoes and redoes', () => {
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

test('a run of the same input collapses into one step', () => {
  const h = new History();
  h.reset(state(''));
  h.record(state('a'), { key: 'insertText', now: 1000 });
  h.record(state('ab'), { key: 'insertText', now: 1100 });
  h.record(state('abc'), { key: 'insertText', now: 1200 });
  assert.equal(h.stack.length, 2);
  assert.equal(h.undo().text, '');
});

test('a pause starts a new step', () => {
  const h = new History();
  h.reset(state(''));
  h.record(state('a'), { key: 'insertText', now: 1000 });
  h.record(state('ab'), { key: 'insertText', now: 9000 });
  assert.equal(h.stack.length, 3);
  assert.equal(h.undo().text, 'a');
});

test('a different kind of input starts a new step', () => {
  const h = new History();
  h.reset(state(''));
  h.record(state('ab'), { key: 'insertText', now: 1000 });
  h.record(state('a'), { key: 'deleteContentBackward', now: 1050 });
  assert.equal(h.stack.length, 3);
});

test('editing after an undo throws the redos away', () => {
  const h = new History();
  h.reset(state('a'));
  h.record(state('ab'), { key: null });
  h.record(state('abc'), { key: null });
  h.undo();
  h.record(state('abX'), { key: null });
  assert.equal(h.canRedo, false);
  assert.deepEqual(h.stack.map((s) => s.text), ['a', 'ab', 'abX']);
});

test('unchanged text only moves the caret', () => {
  const h = new History();
  h.reset(state('abc', 0));
  const recorded = h.record(state('abc', 2), { key: null });
  assert.equal(recorded, false);
  assert.equal(h.stack.length, 1);
  assert.equal(h.current.selectionStart, 2);
});

test('typing right after an undo does not join the step before it', () => {
  const h = new History();
  h.reset(state(''));
  h.record(state('a'), { key: 'insertText', now: 1000 });
  h.undo();
  h.record(state('b'), { key: 'insertText', now: 1100 });
  assert.equal(h.undo().text, '');
});

test('the oldest steps go once the limit is passed', () => {
  const h = new History({ limit: 5 });
  h.reset(state('0'));
  for (let i = 1; i <= 20; i++) h.record(state(String(i)), { key: null });
  assert.equal(h.stack.length, 5);
  assert.equal(h.current.text, '20');
  assert.equal(h.stack[0].text, '16');
});

test('the size budget drops steps too', () => {
  const h = new History({ budget: 50 });
  h.reset(state(''));
  for (let i = 0; i < 20; i++) h.record(state('x'.repeat(10) + i), { key: null });
  assert.ok(h.stack.length <= 6, `actually ${h.stack.length}`);
  assert.equal(h.current.text.endsWith('19'), true);
});
