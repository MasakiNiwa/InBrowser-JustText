import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createMatcher,
  escapeRegExp,
  expandReplacement,
  findAll,
  findNext,
  findPrev,
  prepareReplacement,
  replaceAll,
  replaceOne,
  SearchError,
  unescapeReplacement,
} from '../src/core/search.js';

const TEXT = 'foo bar Foo BAR foofoo';

test('a plain search ignores case by default', () => {
  const re = createMatcher({ query: 'foo' });
  assert.deepEqual(findAll(TEXT, re).matches, [
    { start: 0, end: 3 },
    { start: 8, end: 11 },
    { start: 16, end: 19 },
    { start: 19, end: 22 },
  ]);
});

test('case can be made to matter', () => {
  const re = createMatcher({ query: 'foo', caseSensitive: true });
  assert.equal(findAll(TEXT, re).matches.length, 3);
});

test('matches whole words only', () => {
  const re = createMatcher({ query: 'foo', wholeWord: true });
  assert.deepEqual(findAll(TEXT, re).matches, [
    { start: 0, end: 3 },
    { start: 8, end: 11 },
  ]);
});

test('whole-word search still works in Japanese', () => {
  const re = createMatcher({ query: '本', wholeWord: true });
  assert.equal(findAll('日本 本 ほん', re).matches.length >= 1, true);
});

test('a plain search takes regex metacharacters literally', () => {
  const re = createMatcher({ query: 'a.c' });
  assert.equal(findAll('abc a.c', re).matches.length, 1);
  assert.equal(escapeRegExp('a.c[$]'), 'a\\.c\\[\\$\\]');
});

test('searches by regular expression', () => {
  const re = createMatcher({ query: '\\d+', useRegex: true });
  assert.deepEqual(findAll('a12b345', re).matches, [
    { start: 1, end: 3 },
    { start: 4, end: 7 },
  ]);
});

test('a broken pattern raises a SearchError', () => {
  assert.throws(() => createMatcher({ query: '[', useRegex: true }), SearchError);
});

test('a pattern the u flag rejects still works', () => {
  const re = createMatcher({ query: '\\-', useRegex: true });
  assert.equal(findAll('a-b', re).matches.length, 1);
});

test('an empty query matches nothing at all', () => {
  assert.equal(createMatcher({ query: '' }), null);
  assert.deepEqual(findAll('abc', null).matches, []);
});

test('a zero-length match cannot loop forever', () => {
  const re = createMatcher({ query: 'a*', useRegex: true });
  const { matches } = findAll('bab', re);
  assert.ok(matches.length > 0 && matches.length < 10);
});

test('stops at the limit and says so', () => {
  const re = createMatcher({ query: 'a' });
  const result = findAll('a'.repeat(100), re, 10);
  assert.equal(result.matches.length, 10);
  assert.equal(result.truncated, true);
});

test('finds the next match, wrapping past the end', () => {
  const re = createMatcher({ query: 'foo' });
  assert.deepEqual(findNext(TEXT, re, 0), { start: 0, end: 3 });
  assert.deepEqual(findNext(TEXT, re, 3), { start: 8, end: 11 });
  assert.deepEqual(findNext(TEXT, re, 22), { start: 0, end: 3 });
  assert.equal(findNext(TEXT, re, 22, { wrap: false }), null);
});

test('finds the previous match, wrapping past the start', () => {
  const re = createMatcher({ query: 'foo' });
  assert.deepEqual(findPrev(TEXT, re, 11), { start: 8, end: 11 });
  assert.deepEqual(findPrev(TEXT, re, 0), { start: 19, end: 22 });
  assert.equal(findPrev(TEXT, re, 0, { wrap: false }), null);
});

test('replaces everything and counts as it goes', () => {
  const re = createMatcher({ query: 'foo' });
  const result = replaceAll(TEXT, re, 'X');
  assert.equal(result.count, 4);
  assert.equal(result.text, 'X bar X BAR XX');
});

test('nothing to replace leaves the text alone', () => {
  const re = createMatcher({ query: 'zzz' });
  const result = replaceAll(TEXT, re, 'X');
  assert.equal(result.count, 0);
  assert.equal(result.text, TEXT);
});

test('expands a back-reference', () => {
  const re = createMatcher({ query: '(\\w+)@(\\w+)', useRegex: true });
  const result = replaceAll('a@b c@d', re, prepareReplacement('$2:$1', true));
  assert.equal(result.text, 'b:a d:c');
  assert.equal(result.count, 2);
});

test('expands a named group', () => {
  const re = createMatcher({ query: '(?<key>\\w+)=(?<value>\\w+)', useRegex: true });
  const result = replaceAll('a=1', re, prepareReplacement('$<value>=$<key>', true));
  assert.equal(result.text, '1=a');
});

test('a plain replacement treats $ as a character', () => {
  const re = createMatcher({ query: 'x' });
  const result = replaceAll('x', re, prepareReplacement('$1', false));
  assert.equal(result.text, '$1');
});

test('a regex replacement reads \\n and its like as characters', () => {
  assert.equal(unescapeReplacement('a\\nb\\tc\\\\d'), 'a\nb\tc\\d');
  const re = createMatcher({ query: ',', useRegex: true });
  assert.equal(replaceAll('a,b', re, prepareReplacement('\\n', true)).text, 'a\nb');
});

test('expands $& and $$', () => {
  const m = /b(c)/d.exec('abcd');
  assert.equal(expandReplacement(m, '[$&]'), '[bc]');
  assert.equal(expandReplacement(m, '$$'), '$');
  assert.equal(expandReplacement(m, '<$1>'), '<c>');
  assert.equal(expandReplacement(m, '$`|$\''), 'a|d');
});

test('replaces a single match', () => {
  const re = createMatcher({ query: 'foo' });
  const result = replaceOne(TEXT, re, 'X', 8);
  assert.equal(result.text, 'foo bar X BAR foofoo');
  assert.equal(result.end, 9);
});

test('replacing one match fails when nothing matches there', () => {
  const re = createMatcher({ query: 'foo' });
  assert.equal(replaceOne(TEXT, re, 'X', 5), null);
});

test('positions hold up across several lines', () => {
  const text = 'line1\nline2\nline3';
  const re = createMatcher({ query: 'line' });
  assert.deepEqual(findAll(text, re).matches, [
    { start: 0, end: 4 },
    { start: 6, end: 10 },
    { start: 12, end: 16 },
  ]);
});

test('positions hold up around a surrogate pair', () => {
  const text = 'あ𩸽い𩸽う';
  const re = createMatcher({ query: '𩸽' });
  const { matches } = findAll(text, re);
  assert.equal(matches.length, 2);
  assert.equal(text.slice(matches[0].start, matches[0].end), '𩸽');
});
