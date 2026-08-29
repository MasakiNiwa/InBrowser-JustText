import test from 'node:test';
import assert from 'node:assert/strict';

import { findErrorOffset, formatJson, minifyJson, parseJson } from '../src/tools/json-tools.js';
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
import { setLocale } from '../src/i18n/index.js';

// A couple of checks read the wording of a notification, so pin the language.
await setLocale('en');

/* ---------- JSON ---------- */

test('formats JSON', () => {
  assert.equal(formatJson('{"a":[1,2]}', 2).text, '{\n  "a": [\n    1,\n    2\n  ]\n}');
  assert.equal(formatJson('{"a":1}', '\t').text, '{\n\t"a": 1\n}');
});

test('minifies JSON', () => {
  assert.equal(minifyJson('{\n  "a": 1\n}').text, '{"a":1}');
});

test('broken JSON comes back as a failure', () => {
  const result = parseJson('{"a": }');
  assert.equal(result.ok, false);
  assert.equal(typeof result.message, 'string');
  // There is not always a position to give: V8 omits one for short inputs.
  assert.ok(result.offset === null || typeof result.offset === 'number');
});

test('the reported offset points at what is actually wrong', () => {
  // V8 gives no position for its "Unexpected token" errors, so the scanner fills that in.
  const cases = [
    ['{"a": }', 6],
    ['{bad}', 1],
    ['{"a":1,}', 7],
    ['{"a" 1}', 5],
    ['{"a":[1,2,]}', 10],
    ['[1, 2, tru]', 7], // points at the start of the broken word
    ['{"a": "x" "b": 1}', 10],
    ['{"a":1} ゴミ', 8],
    ['{\n  "name": "テスト",\n  "値": ,\n}', 26],
  ];
  for (const [source, expected] of cases) {
    const result = parseJson(source);
    assert.equal(result.ok, false, `${source} should have failed`);
    assert.equal(result.offset, expected, `error offset for ${source}`);
  }
});

test('valid JSON is never scanned for an error', () => {
  assert.equal(findErrorOffset('{"a": 1}'), null);
});

test('JSON cut off partway points at the end', () => {
  const result = parseJson('{"a": [1, 2');
  assert.equal(result.ok, false);
  assert.ok(result.offset === null || result.offset >= 10);
});

test('each kind of breakage is located', () => {
  const cases = [
    ['{"a": "閉じていない', 13], // an unterminated string points at the end
    ['{"a": 01}', 7], // not how a number is written
    ['{"a": .5}', 6], // a number cannot open with a decimal point
    ['[1,]', 3], // one comma too many
    ['{"a": tru}', 6], // the word stops short
    ['{"a": "\u0001"}', 7], // a raw control character inside a string
    ['{"a": "\\q"}', 8], // an escape nobody knows; points after the backslash
  ];
  for (const [source, expected] of cases) {
    assert.equal(findErrorOffset(source), expected, `error offset for ${JSON.stringify(source)}`);
    assert.equal(parseJson(source).ok, false, `${JSON.stringify(source)} should have failed`);
  }
});

test('valid JSON yields no offset', () => {
  const valid = [
    '{"a": [1, 2, {"b": null}], "c": true}',
    '[]',
    '{}',
    '"文字列だけ"',
    '-1.5e10',
    '  {"空白に囲まれている": 1}  ',
    '{"エスケープ": "改行\\nとタブ\\tと\\u3042"}',
  ];
  for (const source of valid) {
    assert.equal(findErrorOffset(source), null, `${source} should be valid`);
    assert.equal(parseJson(source).ok, true, `${source} should parse`);
  }
});

test('the scanner and JSON.parse never disagree', () => {
  // Both have to call the same inputs broken and the same ones valid.
  const samples = [
    '{}', '[]', '{"a":1}', '{"a":}', '[1,2,]', 'null', 'nul', '"x"', '"x', '1e', '1e5',
    '{"a":"b"}{', '[[[]]]', '{"a": [1, {"b": [true, false, null]}]}', '', '   ', 'tru',
  ];
  for (const source of samples) {
    let parsed = true;
    try {
      JSON.parse(source);
    } catch {
      parsed = false;
    }
    assert.equal(findErrorOffset(source) === null, parsed, `verdict on ${JSON.stringify(source)}`);
  }
});

test('formatting leaves the value itself alone', () => {
  const source = '{"n":1.5,"s":"あ","b":true,"nul":null,"arr":[1,{"x":2}]}';
  assert.deepEqual(JSON.parse(formatJson(source, 2).text), JSON.parse(source));
  assert.equal(minifyJson(formatJson(source, 4).text).text, source);
});

/* ---------- Tidying text ---------- */

test('strips trailing whitespace', () => {
  assert.equal(trimTrailing('a  \nb\t\nc'), 'a\nb\nc');
  assert.equal(trimTrailing('  leading kept  '), '  leading kept');
});

test('removes blank lines', () => {
  assert.equal(removeEmptyLines('a\n\n  \nb'), 'a\nb');
});

test('sorts lines', () => {
  assert.equal(sortLines('c\na\nb'), 'a\nb\nc');
  assert.equal(sortLines('c\na\nb', { descending: true }), 'c\nb\na');
  assert.equal(sortLines('item10\nitem9\nitem1', { numeric: true }), 'item1\nitem9\nitem10');
});

test('drops repeated lines, keeping the order', () => {
  assert.equal(uniqueLines('b\na\nb\nc\na'), 'b\na\nc');
});

test('converts between tabs and spaces', () => {
  assert.equal(tabsToSpaces('\ta', 2), '  a');
  assert.equal(tabsToSpaces('\ta', 4), '    a');
  assert.equal(spacesToTabs('    a  b', 2), '\t\ta  b'); // only the indent is touched
});

test('indents and outdents', () => {
  assert.equal(indentLines('a\nb', '  '), '  a\n  b');
  assert.equal(outdentLines('  a\n\tb\nc', '  '), 'a\nb\nc');
  assert.equal(outdentLines(' a', '  '), 'a'); // a part-width indent still counts as one step
});

/* ---------- The register ---------- */

test('the commands are registered', () => {
  assert.ok(listCommands().length >= 10);
  assert.ok(getCommand('json.format2'));
  assert.equal(getCommand('no.such.command'), undefined);
});

test('groups the commands for the menu', () => {
  const groups = listByGroup();
  assert.ok(groups.length >= 2);
  for (const group of groups) {
    assert.ok(group.commands.length > 0);
    assert.ok(group.label);
  }
});

test('running an unknown command raises', async () => {
  await assert.rejects(() => runCommand('no.such.command', {}), /no\.such\.command/);
});

/** The smallest context the commands will accept. */
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

test('JSON formatting runs through the register', async () => {
  const ctx = makeContext('{"a":1}');
  await runCommand('json.format2', ctx);
  assert.equal(ctx.text, '{\n  "a": 1\n}');
  assert.equal(ctx.notes.length, 1);
});

test('broken JSON is reported without touching the text', async () => {
  const ctx = makeContext('{broken}');
  await runCommand('json.validate', ctx);
  assert.equal(ctx.text, '{broken}');
  assert.match(ctx.notes[0], /JSON error/);
});

test('a line command only touches the selection', async () => {
  const ctx = makeContext('a\nc\nb\nz', { start: 2, end: 5 });
  await runCommand('line.sortAsc', ctx);
  assert.equal(ctx.text, 'a\nb\nc\nz');
});
