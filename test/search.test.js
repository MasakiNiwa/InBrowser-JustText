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

test('プレーン検索は大文字小文字を区別しない（既定）', () => {
  const re = createMatcher({ query: 'foo' });
  assert.deepEqual(findAll(TEXT, re).matches, [
    { start: 0, end: 3 },
    { start: 8, end: 11 },
    { start: 16, end: 19 },
    { start: 19, end: 22 },
  ]);
});

test('大文字小文字を区別できる', () => {
  const re = createMatcher({ query: 'foo', caseSensitive: true });
  assert.equal(findAll(TEXT, re).matches.length, 3);
});

test('単語単位で検索できる', () => {
  const re = createMatcher({ query: 'foo', wholeWord: true });
  assert.deepEqual(findAll(TEXT, re).matches, [
    { start: 0, end: 3 },
    { start: 8, end: 11 },
  ]);
});

test('単語単位は日本語でも破綻しない', () => {
  const re = createMatcher({ query: '本', wholeWord: true });
  assert.equal(findAll('日本 本 ほん', re).matches.length >= 1, true);
});

test('プレーン検索では正規表現のメタ文字をそのまま扱う', () => {
  const re = createMatcher({ query: 'a.c' });
  assert.equal(findAll('abc a.c', re).matches.length, 1);
  assert.equal(escapeRegExp('a.c[$]'), 'a\\.c\\[\\$\\]');
});

test('正規表現モードで検索できる', () => {
  const re = createMatcher({ query: '\\d+', useRegex: true });
  assert.deepEqual(findAll('a12b345', re).matches, [
    { start: 1, end: 3 },
    { start: 4, end: 7 },
  ]);
});

test('不正な正規表現は SearchError になる', () => {
  assert.throws(() => createMatcher({ query: '[', useRegex: true }), SearchError);
});

test('u フラグと相容れないパターンでも動く', () => {
  const re = createMatcher({ query: '\\-', useRegex: true });
  assert.equal(findAll('a-b', re).matches.length, 1);
});

test('空文字の検索条件は null', () => {
  assert.equal(createMatcher({ query: '' }), null);
  assert.deepEqual(findAll('abc', null).matches, []);
});

test('空マッチでも無限ループしない', () => {
  const re = createMatcher({ query: 'a*', useRegex: true });
  const { matches } = findAll('bab', re);
  assert.ok(matches.length > 0 && matches.length < 10);
});

test('件数の上限で打ち切られる', () => {
  const re = createMatcher({ query: 'a' });
  const result = findAll('a'.repeat(100), re, 10);
  assert.equal(result.matches.length, 10);
  assert.equal(result.truncated, true);
});

test('次を検索する / 末尾で先頭に戻る', () => {
  const re = createMatcher({ query: 'foo' });
  assert.deepEqual(findNext(TEXT, re, 0), { start: 0, end: 3 });
  assert.deepEqual(findNext(TEXT, re, 3), { start: 8, end: 11 });
  assert.deepEqual(findNext(TEXT, re, 22), { start: 0, end: 3 });
  assert.equal(findNext(TEXT, re, 22, { wrap: false }), null);
});

test('前を検索する / 先頭で末尾に戻る', () => {
  const re = createMatcher({ query: 'foo' });
  assert.deepEqual(findPrev(TEXT, re, 11), { start: 8, end: 11 });
  assert.deepEqual(findPrev(TEXT, re, 0), { start: 19, end: 22 });
  assert.equal(findPrev(TEXT, re, 0, { wrap: false }), null);
});

test('すべて置換して件数を返す', () => {
  const re = createMatcher({ query: 'foo' });
  const result = replaceAll(TEXT, re, 'X');
  assert.equal(result.count, 4);
  assert.equal(result.text, 'X bar X BAR XX');
});

test('置換対象が無ければ元のまま', () => {
  const re = createMatcher({ query: 'zzz' });
  const result = replaceAll(TEXT, re, 'X');
  assert.equal(result.count, 0);
  assert.equal(result.text, TEXT);
});

test('正規表現の後方参照を展開する', () => {
  const re = createMatcher({ query: '(\\w+)@(\\w+)', useRegex: true });
  const result = replaceAll('a@b c@d', re, prepareReplacement('$2:$1', true));
  assert.equal(result.text, 'b:a d:c');
  assert.equal(result.count, 2);
});

test('名前付きグループを展開する', () => {
  const re = createMatcher({ query: '(?<key>\\w+)=(?<value>\\w+)', useRegex: true });
  const result = replaceAll('a=1', re, prepareReplacement('$<value>=$<key>', true));
  assert.equal(result.text, '1=a');
});

test('プレーン置換では $ を文字として扱う', () => {
  const re = createMatcher({ query: 'x' });
  const result = replaceAll('x', re, prepareReplacement('$1', false));
  assert.equal(result.text, '$1');
});

test('正規表現モードの置換文字列で \\n などを解釈する', () => {
  assert.equal(unescapeReplacement('a\\nb\\tc\\\\d'), 'a\nb\tc\\d');
  const re = createMatcher({ query: ',', useRegex: true });
  assert.equal(replaceAll('a,b', re, prepareReplacement('\\n', true)).text, 'a\nb');
});

test('$& と $$ を展開する', () => {
  const m = /b(c)/d.exec('abcd');
  assert.equal(expandReplacement(m, '[$&]'), '[bc]');
  assert.equal(expandReplacement(m, '$$'), '$');
  assert.equal(expandReplacement(m, '<$1>'), '<c>');
  assert.equal(expandReplacement(m, '$`|$\''), 'a|d');
});

test('1 件だけ置換する', () => {
  const re = createMatcher({ query: 'foo' });
  const result = replaceOne(TEXT, re, 'X', 8);
  assert.equal(result.text, 'foo bar X BAR foofoo');
  assert.equal(result.end, 9);
});

test('位置が一致しなければ 1 件置換は失敗する', () => {
  const re = createMatcher({ query: 'foo' });
  assert.equal(replaceOne(TEXT, re, 'X', 5), null);
});

test('複数行のテキストでも位置がずれない', () => {
  const text = 'line1\nline2\nline3';
  const re = createMatcher({ query: 'line' });
  assert.deepEqual(findAll(text, re).matches, [
    { start: 0, end: 4 },
    { start: 6, end: 10 },
    { start: 12, end: 16 },
  ]);
});

test('サロゲートペアを含む文字列でも位置が正しい', () => {
  const text = 'あ𩸽い𩸽う';
  const re = createMatcher({ query: '𩸽' });
  const { matches } = findAll(text, re);
  assert.equal(matches.length, 2);
  assert.equal(text.slice(matches[0].start, matches[0].end), '𩸽');
});
