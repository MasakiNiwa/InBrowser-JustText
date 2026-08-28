import test from 'node:test';
import assert from 'node:assert/strict';

import { findErrorOffset, formatJson, minifyJson, parseJson, parseErrorOffset } from '../src/tools/json-tools.js';
import {
  indentLines,
  outdentLines,
  removeEmptyLines,
  sortLines,
  spacesToTabs,
  tabsToSpaces,
  trimTrailing,
  uniqueLines,
} from '../src/tools/text-tools.js';
import { listByGroup, listCommands, getCommand, runCommand } from '../src/tools/registry.js';

/* ---------- JSON ---------- */

test('JSON を整形する', () => {
  assert.equal(formatJson('{"a":[1,2]}', 2).text, '{\n  "a": [\n    1,\n    2\n  ]\n}');
  assert.equal(formatJson('{"a":1}', '\t').text, '{\n\t"a": 1\n}');
});

test('JSON を最小化する', () => {
  assert.equal(minifyJson('{\n  "a": 1\n}').text, '{"a":1}');
});

test('壊れた JSON はエラーとして扱う', () => {
  const result = parseJson('{"a": }');
  assert.equal(result.ok, false);
  assert.equal(typeof result.message, 'string');
  // 位置は取れないことがある（短い入力では V8 が position を付けない）
  assert.ok(result.offset === null || typeof result.offset === 'number');
});

test('エラー位置が壊れた箇所を正しく指す', () => {
  // V8 は "Unexpected token" 系では位置を出さないため、二分探索で補う
  const cases = [
    ['{"a": }', 6],
    ['{bad}', 1],
    ['{"a":1,}', 7],
    ['{"a" 1}', 5],
    ['{"a":[1,2,]}', 10],
    ['[1, 2, tru]', 10],
    ['{"a": "x" "b": 1}', 10],
    ['{"a":1} ゴミ', 8],
    ['{\n  "name": "テスト",\n  "値": ,\n}', 26],
  ];
  for (const [source, expected] of cases) {
    const result = parseJson(source);
    assert.equal(result.ok, false, `${source} は失敗するはず`);
    assert.equal(result.offset, expected, `${source} のエラー位置`);
  }
});

test('正しい JSON では位置探索を行わない', () => {
  assert.equal(findErrorOffset('{"a": 1}'), null);
});

test('途中で切れた JSON は末尾を指す', () => {
  const result = parseJson('{"a": [1, 2');
  assert.equal(result.ok, false);
  assert.ok(result.offset === null || result.offset >= 10);
});

test('エラーメッセージから位置を取り出す', () => {
  assert.equal(parseErrorOffset('Unexpected token } in JSON at position 42'), 42);
  assert.equal(parseErrorOffset('位置の情報なし'), null);
});

test('整形しても値は変わらない', () => {
  const source = '{"n":1.5,"s":"あ","b":true,"nul":null,"arr":[1,{"x":2}]}';
  assert.deepEqual(JSON.parse(formatJson(source, 2).text), JSON.parse(source));
  assert.equal(minifyJson(formatJson(source, 4).text).text, source);
});

/* ---------- テキスト整形 ---------- */

test('行末の空白を削除する', () => {
  assert.equal(trimTrailing('a  \nb\t\nc'), 'a\nb\nc');
  assert.equal(trimTrailing('  先頭は残す  '), '  先頭は残す');
});

test('空行を削除する', () => {
  assert.equal(removeEmptyLines('a\n\n  \nb'), 'a\nb');
});

test('行を並べ替える', () => {
  assert.equal(sortLines('c\na\nb'), 'a\nb\nc');
  assert.equal(sortLines('c\na\nb', { descending: true }), 'c\nb\na');
  assert.equal(sortLines('item10\nitem9\nitem1', { numeric: true }), 'item1\nitem9\nitem10');
});

test('重複行を削除する（順序は保つ）', () => {
  assert.equal(uniqueLines('b\na\nb\nc\na'), 'b\na\nc');
});

test('タブと空白を相互に変換する', () => {
  assert.equal(tabsToSpaces('\ta', 2), '  a');
  assert.equal(tabsToSpaces('\ta', 4), '    a');
  assert.equal(spacesToTabs('    a  b', 2), '\t\ta  b'); // 行頭だけ変換する
});

test('インデントの増減', () => {
  assert.equal(indentLines('a\nb', '  '), '  a\n  b');
  assert.equal(outdentLines('  a\n\tb\nc', '  '), 'a\nb\nc');
  assert.equal(outdentLines(' a', '  '), 'a'); // 半端な空白も 1 段として扱う
});

/* ---------- 登録簿 ---------- */

test('コマンドが登録されている', () => {
  assert.ok(listCommands().length >= 10);
  assert.ok(getCommand('json.format2'));
  assert.equal(getCommand('存在しない'), undefined);
});

test('グループごとに並べられる', () => {
  const groups = listByGroup();
  assert.ok(groups.length >= 2);
  for (const group of groups) {
    assert.ok(group.commands.length > 0);
    assert.ok(group.label);
  }
});

test('未登録のコマンドを実行するとエラー', async () => {
  await assert.rejects(() => runCommand('未登録', {}), /未登録/);
});

/** テスト用の最小限の文脈。 */
function makeContext(text, selection = null) {
  return {
    text,
    settings: { tabSize: 2, insertSpaces: true },
    indentUnit: () => '  ',
    notes: [],
    getText() {
      return this.text;
    },
    setText(next) {
      this.text = next;
    },
    getSelection() {
      return selection ?? { start: 0, end: this.text.length };
    },
    setSelection() {},
    notify(message) {
      this.notes.push(message);
    },
    applyToSelectedLines(fn) {
      const sel = this.getSelection();
      const before = this.text.slice(sel.start, sel.end);
      this.text = this.text.slice(0, sel.start) + fn(before) + this.text.slice(sel.end);
    },
  };
}

test('登録簿ごしに JSON 整形を実行できる', async () => {
  const ctx = makeContext('{"a":1}');
  await runCommand('json.format2', ctx);
  assert.equal(ctx.text, '{\n  "a": 1\n}');
  assert.equal(ctx.notes.length, 1);
});

test('壊れた JSON では内容を変えずに知らせる', async () => {
  const ctx = makeContext('{壊れている}');
  await runCommand('json.validate', ctx);
  assert.equal(ctx.text, '{壊れている}');
  assert.match(ctx.notes[0], /JSON エラー/);
});

test('行の整形は選択範囲だけに効く', async () => {
  const ctx = makeContext('a\nc\nb\nz', { start: 2, end: 5 });
  await runCommand('line.sortAsc', ctx);
  assert.equal(ctx.text, 'a\nb\nc\nz');
});
