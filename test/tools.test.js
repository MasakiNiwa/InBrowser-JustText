import test from 'node:test';
import assert from 'node:assert/strict';

import {
  findErrorOffset,
  findLossyRewrite,
  formatJson,
  minifyJson,
  numberSurvives,
  parseJson,
  scanJson,
  sortJsonKeys,
} from '../src/tools/json-tools.js';
import {
  deleteLines,
  duplicateLines,
  indentLines,
  moveLines,
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

test('sorts every object\'s keys, all the way down', () => {
  const sorted = JSON.parse(sortJsonKeys('{"b":1,"a":{"d":2,"c":[{"f":3,"e":4}]}}').text);
  assert.deepEqual(Object.keys(sorted), ['a', 'b']);
  assert.deepEqual(Object.keys(sorted.a), ['c', 'd']);
  assert.deepEqual(Object.keys(sorted.a.c[0]), ['e', 'f']);
});

test('sorting keys changes nothing about the value', () => {
  const source = '{"b":1,"a":[3,1,2],"c":{"z":null,"y":true}}';
  assert.deepEqual(JSON.parse(sortJsonKeys(source).text), JSON.parse(source));
  // Arrays keep their order; only object keys move.
  assert.deepEqual(JSON.parse(sortJsonKeys(source).text).a, [3, 1, 2]);
});

test('sorting broken JSON reports the failure instead', () => {
  const result = sortJsonKeys('{"a":}');
  assert.equal(result.ok, false);
  assert.equal(typeof result.offset, 'number');
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

/* ---------- Rewrites that would change the data ---------- */

/*
 * Reformatting goes through JSON.parse, which rounds numbers it cannot hold and
 * keeps only the last of a repeated key — both without a word. For a text
 * editor that is data loss, so the commands have to see it coming.
 */

test('a number literal that survives a double is recognised', () => {
  for (const literal of ['0', '0.0', '1', '1.0', '1e0', '100', '1e2', '1.50', '0.1',
    '-12345', '3.14159', '9007199254740992', '1e308', '-1.7976931348623157e308']) {
    assert.equal(numberSurvives(literal), true, literal);
  }
});

test('and one that does not is caught', () => {
  for (const literal of [
    '9007199254740993', // one past what a double can count to
    '123456789012345678901234567890',
    '0.1234567890123456789', // more digits than a double carries
    '1e999', // overflows to Infinity, which is written out as null
    '-1e999',
    '1e-999', // underflows to zero
    // JavaScript can tell -0 from 0, but writes both out as 0.
    '-0',
    '-0.0',
    '-0e0',
  ]) {
    assert.equal(numberSurvives(literal), false, literal);
  }
});

test('an unsafe number stops a rewrite, and says which one', () => {
  const lossy = findLossyRewrite('{"id":9007199254740993}');
  assert.equal(lossy.reason, 'number');
  assert.equal(lossy.detail, '9007199254740993');
  assert.equal('{"id":9007199254740993}'.slice(lossy.offset, lossy.offset + 16), '9007199254740993');
});

test('a repeated key stops a rewrite, at whichever level it is on', () => {
  assert.deepEqual(
    { reason: findLossyRewrite('{"a":1,"a":2}').reason, detail: findLossyRewrite('{"a":1,"a":2}').detail },
    { reason: 'duplicateKey', detail: 'a' },
  );
  assert.equal(findLossyRewrite('{"outer":{"b":1,"b":2}}').detail, 'b');
  // The same name in different objects is not a repeat.
  assert.equal(findLossyRewrite('{"a":{"x":1},"b":{"x":2}}'), null);
  // Nor is a repeated value.
  assert.equal(findLossyRewrite('[1,1,1]'), null);
});

test('ordinary JSON is left free to be rewritten', () => {
  for (const source of ['{}', '[]', '{"a":1,"b":[1,2,{"c":null}]}', '"text"', '3.14', 'null']) {
    assert.equal(findLossyRewrite(source), null, source);
  }
});

test('broken JSON is reported as broken, not as unsafe', () => {
  // The syntax error is the thing worth saying; it has its own message.
  assert.equal(findLossyRewrite('{"a":}'), null);
  assert.equal(findErrorOffset('{"a":}'), 5);
});

test('the scan finds every number, and the first repeated key', () => {
  const scan = scanJson('{"a":1,"b":[2,3.5],"a":4}');
  assert.equal(scan.error, null);
  assert.equal(scan.numbers.length, 4);
  assert.equal(scan.duplicateKey.name, 'a');
});

test('sorting keys keeps __proto__, which a plain object would swallow', () => {
  // JSON.parse makes __proto__ an ordinary property; assigning it to a {} would
  // set the prototype instead, and the key would vanish from the output.
  const source = '{"z":1,"__proto__":{"keep":true},"a":2}';
  const sorted = sortJsonKeys(source, 0).text;
  assert.ok(sorted.includes('__proto__'), sorted);
  assert.deepEqual(Object.keys(JSON.parse(sorted)).sort(), ['__proto__', 'a', 'z']);
  assert.deepEqual(JSON.parse(sorted).__proto__, { keep: true });
});

test('formatting and minifying keep __proto__ as well', () => {
  const source = '{"__proto__":{"keep":true}}';
  assert.ok(formatJson(source, 2).text.includes('__proto__'));
  assert.equal(minifyJson(source).text, source);
});

/* ---------- Whole-line edits ---------- */

test('duplicates the line the caret is on', () => {
  const r = duplicateLines('a\nb\nc', 2, 2);
  assert.equal(r.text, 'a\nb\nb\nc');
  // The caret follows the copy, so typing straight away edits the new line.
  assert.deepEqual([r.start, r.end], [4, 4]);
});

test('duplicates every line a selection touches', () => {
  const r = duplicateLines('a\nb\nc', 1, 3);
  assert.equal(r.text, 'a\nb\na\nb\nc');
});

test('deletes the line the caret is on', () => {
  const r = deleteLines('a\nb\nc', 2, 2);
  assert.equal(r.text, 'a\nc');
  assert.deepEqual([r.start, r.end], [2, 2]);
});

test('deleting the last line takes the break before it', () => {
  const r = deleteLines('a\nb', 2, 2);
  assert.equal(r.text, 'a');
  assert.deepEqual([r.start, r.end], [1, 1]);
});

test('deleting the only line leaves nothing', () => {
  assert.equal(deleteLines('only', 1, 1).text, '');
});

test('moves a line up and down', () => {
  const up = moveLines('a\nb\nc', 2, 2, 'up');
  assert.equal(up.text, 'b\na\nc');
  assert.deepEqual([up.start, up.end], [0, 0]);

  const down = moveLines('a\nb\nc', 0, 0, 'down');
  assert.equal(down.text, 'b\na\nc');
  assert.deepEqual([down.start, down.end], [2, 2]);
});

test('a move that has nowhere to go reports back', () => {
  assert.equal(moveLines('a\nb', 0, 0, 'up'), null);
  assert.equal(moveLines('a\nb', 2, 2, 'down'), null);
});

test('moving carries a whole selection with it', () => {
  const r = moveLines('a\nb\nc\nd', 2, 5, 'down');
  assert.equal(r.text, 'a\nd\nb\nc');
  assert.equal(r.text.slice(r.start, r.end), 'b\nc');
});

test('moving down then up puts the text back', () => {
  const source = 'one\ntwo\nthree';
  const down = moveLines(source, 0, 0, 'down');
  const back = moveLines(down.text, down.start, down.end, 'up');
  assert.equal(back.text, source);
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
