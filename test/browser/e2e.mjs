/**
 * The app, driven end to end in a real browser.
 *
 *   npm run test:browser
 *
 * Needs Playwright (`npm i -D playwright`, then `npx playwright install chromium`).
 * This covers what the unit tests cannot see:
 *   - search highlights sitting exactly over the text, to within a pixel
 *   - line numbers lining up with the lines
 *   - encodings surviving a round trip (the downloaded bytes are read back)
 *   - starting offline, and taking a file from Android's "share" menu
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, devices, firefox, webkit } from 'playwright';

import { encodeText } from '../../src/core/encoder.js';

const PORT = 8137;
const BASE = `http://localhost:${PORT}/`;
const WORK = mkdtempSync(join(tmpdir(), 'justtext-e2e-'));

/**
 * Which browser to drive. Set JUSTTEXT_BROWSER=firefox and so on.
 * Defaults to chromium.
 */
const BROWSERS = { chromium, firefox, webkit };
const BROWSER_NAME = process.env.JUSTTEXT_BROWSER ?? 'chromium';
const browserType = BROWSERS[BROWSER_NAME];
if (!browserType) {
  console.error(`No such browser: ${BROWSER_NAME} (chromium / firefox / webkit)`);
  process.exit(2);
}

/**
 * The device to pretend to be. Firefox supports neither isMobile nor
 * deviceScaleFactor, so there only the screen size is matched.
 */
function phone(extra = {}) {
  const base = BROWSER_NAME === 'firefox'
    ? { viewport: { width: 412, height: 915 } }
    : { ...devices['Pixel 7'] };
  return { ...base, ...extra };
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`);
};

/**
 * Dismisses the "your last edits are still here" dialog on start-up.
 * Restoring has a section of its own, so here it is only got out of the way.
 */
async function dismissDraft(target) {
  const visible = await target.locator('#draftDialog').isVisible().catch(() => false);
  if (!visible) return;
  // Discarding only marks the rows now; closing the dialog is what applies it.
  await target.click('#draftDiscardAll');
  await target.waitForTimeout(150);
  await target.click('#draftLater');
  await target.waitForTimeout(300);
}

/**
 * Every draft the store holds, newest first, as plain text.
 * Drafts are keyed per session now, so the whole store is what matters.
 */
function readDraftTexts(target) {
  return target.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('justtext', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const all = await new Promise((resolve) => {
      const request = db.transaction('drafts', 'readonly').objectStore('drafts').getAll();
      request.onsuccess = () => resolve(request.result ?? []);
      request.onerror = () => resolve([]);
    });
    db.close();
    return all.sort((a, b) => (b.at ?? 0) - (a.at ?? 0)).map((draft) => draft.text);
  });
}

/* ---------- The server ---------- */

const server = spawn(process.execPath, [join(import.meta.dirname, '../../scripts/serve.js'), String(PORT)], {
  stdio: 'ignore',
});
const stopServer = () => server.kill();
process.on('exit', stopServer);

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return;
    } catch {
      /* Not up yet. */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('the server never came up');
}
await waitForServer();

/* ---------- Files to test with ---------- */

const sjisPath = join(WORK, 'sample-sjis.json');
writeFileSync(sjisPath, encodeText('{\r\n  "設定": "日本語の設定ファイル",\r\n  "値": 42\r\n}\r\n', 'shift_jis').bytes);

/* ---------- The run itself ---------- */

const browser = await browserType.launch();
const context = await browser.newContext(phone({ acceptDownloads: true, locale: 'en-US' }));
const page = await context.newPage();

/**
 * Harmless complaints from the browser itself do not count as errors.
 * interactive-widget is for Android's soft keyboard; browsers that do not know
 * it simply skip it, but WebKit writes it to the console as an error.
 */
const HARMLESS = [/interactive-widget/i];
const isHarmless = (text) => HARMLESS.some((pattern) => pattern.test(text));

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' && !isHarmless(m.text())) errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => { window.confirm = () => true; });

check('the page loads', (await page.title()) === 'InBrowser JustText');
check('nothing errors on start-up', errors.length === 0, errors.join(' | '));
check('the search panel starts closed', !(await page.locator('#searchPanel').isVisible()));
check('the drop overlay starts hidden', !(await page.locator('#dropOverlay').isVisible()));

/* ---------- Typing, and the status bar ---------- */

const sample = ['{', '  "name": "テスト",', '  "items": [1, 2, 3],', '  "note": "foo bar foo"', '}'].join('\n');
await page.fill('#input', sample);
// The status is redrawn on the next frame, so wait for the text, not for a timeout.
const statusUpdated = await page
  .waitForFunction(
    (expected) => document.querySelector('#statusCount').textContent === expected,
    `5 lines / ${sample.length} chars`,
    { timeout: 5000 },
  )
  .then(() => true)
  .catch(() => false);
check('the line and character counts are shown', statusUpdated, await page.textContent('#statusCount'));

// Selecting swaps the totals for how much is picked out.
await page.evaluate(() => {
  const ta = document.querySelector('#input');
  ta.focus();
  ta.setSelectionRange(0, 6);
  ta.dispatchEvent(new Event('select', { bubbles: true }));
});
await page.waitForTimeout(250);
check('a selection is counted instead', (await page.textContent('#statusCount')).startsWith('6 chars'), await page.textContent('#statusCount'));
await page.evaluate(() => {
  const ta = document.querySelector('#input');
  ta.setSelectionRange(0, sample_length_probe());
  function sample_length_probe() { return ta.value.indexOf('items'); }
  ta.dispatchEvent(new Event('select', { bubbles: true }));
});
await page.waitForTimeout(250);
check('and a selection over lines says how many', (await page.textContent('#statusCount')).includes('lines'), await page.textContent('#statusCount'));
await page.evaluate(() => {
  const ta = document.querySelector('#input');
  ta.setSelectionRange(0, 0);
  ta.dispatchEvent(new Event('select', { bubbles: true }));
});
await page.waitForTimeout(250);
check('the unsaved mark appears', await page.locator('#dirtyMark').isVisible());

// The mark also says whether a crash would cost anything.
const draftKept = await page
  .waitForFunction(() => document.querySelector('#dirtyMark').dataset.draft === 'kept', null, { timeout: 5000 })
  .then(() => true)
  .catch(() => false);
check('and says the work is being kept on the device', draftKept, await page.getAttribute('#dirtyMark', 'data-draft'));
check('with wording a reader can hover or hear', ((await page.getAttribute('#dirtyMark', 'title')) ?? '').length > 0);

/* ---------- Find and replace ---------- */

await page.click('#btnSearch');
await page.fill('#searchQuery', 'foo');
await page.waitForTimeout(250);
check('the number of matches is shown', (await page.textContent('#searchCount')).includes('2'));
check('the matches are highlighted', (await page.locator('#highlightLayer mark').count()) === 2);

const metrics = await page.evaluate(() => {
  const ta = document.querySelector('#input');
  const layer = document.querySelector('#highlightLayer');
  const a = getComputedStyle(ta);
  const b = getComputedStyle(layer);
  return {
    same: a.font === b.font && a.lineHeight === b.lineHeight && a.padding === b.padding
      && a.whiteSpace === b.whiteSpace && a.tabSize === b.tabSize && a.letterSpacing === b.letterSpacing,
    layerWidth: layer.getBoundingClientRect().width,
    taClientWidth: ta.clientWidth,
  };
});
check('the mirror layer sets type exactly like the textarea', metrics.same, JSON.stringify(metrics));
check('the mirror layer wraps at the same width', Math.abs(metrics.layerWidth - metrics.taClientWidth) < 0.5);

await page.click('#btnFindNext');
await page.waitForTimeout(150);
check('the current match stands out', (await page.locator('#highlightLayer mark.current').count()) === 1);
check('the counter reads n / m', (await page.textContent('#searchCount')) === '1 / 2');

/* Does the highlight sit exactly over the characters it marks? */
const overlap = await page.evaluate(() => {
  const ta = document.querySelector('#input');
  const mark = document.querySelector('#highlightLayer mark.current');
  const rect = mark.getBoundingClientRect();
  // Measure the same position in the text through an element set in the same type.
  const probe = document.createElement('div');
  const cs = getComputedStyle(ta);
  for (const prop of ['fontFamily', 'fontSize', 'lineHeight', 'letterSpacing', 'padding', 'whiteSpace', 'overflowWrap', 'tabSize']) {
    probe.style[prop] = cs[prop];
  }
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.style.width = `${ta.clientWidth}px`;
  probe.style.boxSizing = 'border-box';
  const index = ta.value.indexOf('foo');
  probe.innerHTML = `${ta.value.slice(0, index).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}<span id="p">foo</span>`;
  ta.parentElement.append(probe);
  const probeRect = probe.querySelector('#p').getBoundingClientRect();
  const base = probe.getBoundingClientRect();
  probe.remove();
  return {
    dx: Math.abs((rect.left - ta.getBoundingClientRect().left) - (probeRect.left - base.left)),
    dy: Math.abs((rect.top - ta.getBoundingClientRect().top) - (probeRect.top - base.top)),
    width: Math.abs(rect.width - probeRect.width),
  };
});
check('the highlight lands on the characters', overlap.dx < 1 && overlap.dy < 1 && overlap.width < 1, JSON.stringify(overlap));

/* Replacing touches only the match that is selected. */
await page.click('#btnFindNext');
await page.waitForTimeout(150);
check('moves to the next match', (await page.textContent('#searchCount')) === '2 / 2');
await page.fill('#searchReplace', 'ZZZ');
await page.click('#btnReplace');
await page.waitForTimeout(250);
check('only the selected match is replaced', (await page.inputValue('#input')).includes('"foo bar ZZZ"'));

await page.fill('#searchReplace', 'BAZ');
await page.click('#btnReplaceAll');
await page.waitForTimeout(250);
check('replaces every match', (await page.inputValue('#input')).includes('"BAZ bar ZZZ"'));

await page.check('#optRegex');
await page.fill('#searchQuery', '(\\d), (\\d)');
await page.fill('#searchReplace', '$2-$1');
await page.click('#btnReplaceAll');
await page.waitForTimeout(250);
check('a back-reference is expanded', (await page.inputValue('#input')).includes('[2-1, 3]'));

await page.fill('#searchQuery', '[');
await page.waitForTimeout(250);
check('a broken pattern is reported', (await page.textContent('#searchError')).length > 0);
await page.uncheck('#optRegex');
await page.fill('#searchQuery', '');
await page.click('#btnSearchClose');
await page.waitForTimeout(150);
check('closing the search clears the highlights', (await page.locator('#highlightLayer mark').count()) === 0);

/* ---------- Undo and redo ---------- */

await page.click('#btnUndo');
await page.click('#btnUndo');
await page.click('#btnUndo');
await page.waitForTimeout(200);
check('undo goes back', (await page.inputValue('#input')).includes('foo bar foo'));
await page.click('#btnRedo');
await page.waitForTimeout(150);
check('redo comes forward again', (await page.inputValue('#input')).includes('ZZZ'));

/* ---------- The keyboard ---------- */

await page.fill('#input', '');
await page.click('#input');
await page.keyboard.type('  indented');
await page.keyboard.press('Enter');
await page.waitForTimeout(150);
check('a new line keeps the indent', (await page.inputValue('#input')) === '  indented\n  ', JSON.stringify(await page.inputValue('#input')));
await page.keyboard.press('Tab');
await page.waitForTimeout(100);
check('Tab inserts spaces', (await page.inputValue('#input')).endsWith('    '), JSON.stringify(await page.inputValue('#input')));
await page.keyboard.press('Control+f');
await page.waitForTimeout(200);
check('Ctrl+F opens the search', await page.locator('#searchPanel').isVisible());
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
check('Esc closes it again', !(await page.locator('#searchPanel').isVisible()));

/* ---------- The key row ---------- */

/*
 * The whole point of the row is that a soft keyboard has no Tab and buries the
 * punctuation. So what matters is not only that it types, but that it never
 * takes focus away from the textarea — a keyboard that closes on every tap
 * would be worse than no row at all.
 */
await page.fill('#input', '');
await page.click('#input');
check('the key row is there', await page.locator('#keyBar').isVisible());
check('it holds a good spread of keys', (await page.locator('#keyBar .key').count()) >= 20);

await page.keyboard.type('a');
await page.click('#keyBar .key[data-key="tab"]');
await page.click('#keyBar .key[data-key="brace-open"]');
await page.waitForTimeout(200);
check('Tab and a symbol both type', (await page.inputValue('#input')) === 'a  {', JSON.stringify(await page.inputValue('#input')));
check('and focus never leaves the editor', (await page.evaluate(() => document.activeElement?.id)) === 'input');

// Tab follows the indent settings, like the Tab key does.
await page.click('#btnSettings');
await page.waitForTimeout(200);
await page.uncheck('#setInsertSpaces');
await page.click('#settingsClose');
await page.waitForTimeout(250);
await page.fill('#input', '');
await page.click('#input');
await page.click('#keyBar .key[data-key="tab"]');
await page.waitForTimeout(200);
check('Tab follows the indent setting', (await page.inputValue('#input')) === '\t', JSON.stringify(await page.inputValue('#input')));

// For a keyboard it is one stop with arrow keys inside, not two dozen stops.
const roving = await page.evaluate(() => {
  const keys = [...document.querySelectorAll('#keyBar .key')];
  return { stops: keys.filter((k) => k.tabIndex === 0).length, total: keys.length };
});
check('the row is a single tab stop', roving.stops === 1, JSON.stringify(roving));
await page.focus('#keyBar .key');
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(150);
check('and the arrow keys move along it', (await page.evaluate(() => document.activeElement?.dataset.key)) === 'brace-open', await page.evaluate(() => document.activeElement?.dataset.key));

await page.click('#btnSettings');
await page.waitForTimeout(200);
await page.check('#setInsertSpaces');
await page.uncheck('#setKeybar');
await page.click('#settingsClose');
await page.waitForTimeout(250);
check('the row can be turned off', !(await page.locator('#keyBar').isVisible()));
await page.click('#btnSettings');
await page.waitForTimeout(200);
await page.check('#setKeybar');
await page.click('#settingsClose');
await page.waitForTimeout(250);

/* ---------- Whole-line editing ---------- */

async function runTool(id) {
  await page.click('#btnTools');
  await page.waitForTimeout(250);
  await page.click(`.tool-item[data-id="${id}"]`);
  await page.waitForTimeout(350);
  return page.inputValue('#input');
}

async function caretAt(value, offset) {
  await page.fill('#input', value);
  await page.waitForTimeout(150);
  await page.evaluate((at) => {
    const ta = document.querySelector('#input');
    ta.focus();
    ta.setSelectionRange(at, at);
  }, offset);
  await page.waitForTimeout(100);
}

await caretAt('one\ntwo\nthree', 4);
check('duplicates the line at the caret', (await runTool('line.duplicate')) === 'one\ntwo\ntwo\nthree');
await caretAt('one\ntwo\nthree', 4);
check('deletes the line at the caret', (await runTool('line.delete')) === 'one\nthree');
await caretAt('one\ntwo\nthree', 4);
check('moves a line up', (await runTool('line.moveUp')) === 'two\none\nthree');
await caretAt('one\ntwo\nthree', 0);
check('moves a line down', (await runTool('line.moveDown')) === 'two\none\nthree');
await caretAt('one\ntwo', 0);
check('a move with nowhere to go changes nothing', (await runTool('line.moveUp')) === 'one\ntwo');
await caretAt('one\ntwo', 4);
check('a tab can be typed from the tools too', (await runTool('text.insertTab')) === 'one\n  two');

await page.fill('#input', '{"b":1,"a":{"d":2,"c":3}}');
await page.waitForTimeout(150);
check(
  'JSON keys can be put in order',
  JSON.parse(await runTool('json.sortKeys')) && (await page.inputValue('#input')).indexOf('"a"') < (await page.inputValue('#input')).indexOf('"b"'),
  await page.inputValue('#input'),
);

/*
 * Reformatting must never quietly change what the JSON says. JSON.parse rounds
 * numbers it cannot hold and keeps only the last of a repeated key, so the
 * commands stop and point at whatever is in the way instead.
 */
async function jsonRefuses(source, id) {
  await page.fill('#input', source);
  await page.waitForTimeout(150);
  const before = await page.inputValue('#input');
  await page.click('#btnTools');
  await page.waitForTimeout(250);
  await page.click(`.tool-item[data-id="${id}"]`);
  await page.waitForTimeout(400);
  return {
    unchanged: (await page.inputValue('#input')) === before,
    told: (await page.textContent('#toastArea')).trim(),
    caret: await page.evaluate(() => document.querySelector('#input').selectionStart),
  };
}

const bigNumber = await jsonRefuses('{"id":9007199254740993}', 'json.format2');
check('a number too big to hold stops the reformat', bigNumber.unchanged, JSON.stringify(bigNumber));
check('and the reader is told which one', bigNumber.told.includes('9007199254740993'), bigNumber.told);
check('with the caret put on it', bigNumber.caret === 6, String(bigNumber.caret));

const repeated = await jsonRefuses('{"a":1,"a":2}', 'json.minify');
check('a repeated key stops the reformat too', repeated.unchanged, JSON.stringify(repeated));
check('and is named', repeated.told.includes('"a"') || repeated.told.includes('a'), repeated.told);

const alsoSortKeys = await jsonRefuses('{"b":1,"id":123456789012345678901}', 'json.sortKeys');
check('sorting keys stops at the same things', alsoSortKeys.unchanged, JSON.stringify(alsoSortKeys));

const validating = await jsonRefuses('{"id":1e999}', 'json.validate');
check('validating reports it rather than calling the file fine', validating.told.includes('1e999'), validating.told);

// __proto__ is an ordinary key in JSON; rebuilding must not swallow it.
await page.fill('#input', '{"z":1,"__proto__":{"keep":true},"a":2}');
await page.waitForTimeout(150);
await page.click('#btnTools');
await page.waitForTimeout(250);
await page.click('.tool-item[data-id="json.sortKeys"]');
await page.waitForTimeout(400);
check('sorting keys keeps __proto__', (await page.inputValue('#input')).includes('__proto__'), await page.inputValue('#input'));

/* ---------- Opening a file: Shift_JIS with CRLF ---------- */

await page.setInputFiles('#filePicker', sjisPath);
await page.waitForTimeout(500);
check('the Shift_JIS is recognised', (await page.textContent('#statusEncoding')) === 'Shift_JIS');
check('the Japanese comes through unmangled', (await page.inputValue('#input')).includes('日本語の設定ファイル'));
check('the file name is shown', (await page.textContent('#fileName')) === 'sample-sjis.json');
check('the CRLF endings are detected', (await page.textContent('#statusNewline')) === 'CRLF');
check('a freshly opened file has no unsaved mark', !(await page.locator('#dirtyMark').isVisible()));

/* ---------- The tools ---------- */

await page.click('#btnTools');
await page.click('.tool-item[data-id="json.format2"]');
await page.waitForTimeout(300);
const formatted = await page.inputValue('#input');
check('formats JSON', formatted.startsWith('{\n  "') && JSON.parse(formatted)['設定'] === '日本語の設定ファイル');

await page.click('#btnTools');
await page.click('.tool-item[data-id="json.minify"]');
await page.waitForTimeout(300);
check('minifies JSON', !(await page.inputValue('#input')).includes('\n'));

await page.fill('#input', '{\n  "a": 1,\n  "b" 2\n}');
await page.waitForTimeout(150);
await page.click('#btnTools');
await page.click('.tool-item[data-id="json.validate"]');
await page.waitForTimeout(400);
check('broken JSON moves the caret to the error', (await page.evaluate(() => document.querySelector('#input').selectionStart)) === 18);
check('and says what went wrong', (await page.textContent('#toastArea')).includes('JSON'));

await page.fill('#input', 'c\na\nb');
await page.waitForTimeout(100);
await page.click('#btnTools');
await page.click('.tool-item[data-id="line.sortAsc"]');
await page.waitForTimeout(300);
check('sorts the lines', (await page.inputValue('#input')) === 'a\nb\nc');

/* ---------- Saving, by download ---------- */

await page.fill('#input', 'テスト保存\nsecond line');
await page.waitForTimeout(150);
await page.click('#btnSave');
await page.waitForTimeout(300);
await page.click('#saveRename');
check('the rename button numbers the copy', (await page.inputValue('#saveName')).includes('(1)'));
await page.fill('#saveName', 'output.txt');
await page.selectOption('#saveEncoding', 'shift_jis');
await page.selectOption('#saveNewline', 'crlf');
const [download] = await Promise.all([page.waitForEvent('download'), page.click('#saveConfirm')]);
const savedPath = join(WORK, 'output.txt');
await download.saveAs(savedPath);
check('the download carries the name given', download.suggestedFilename() === 'output.txt');
const savedBytes = readFileSync(savedPath);
check('it is written as Shift_JIS with CRLF', new TextDecoder('shift_jis').decode(savedBytes) === 'テスト保存\r\nsecond line');
await page.waitForTimeout(300);
check('the unsaved mark clears once saved', !(await page.locator('#dirtyMark').isVisible()));

/* ---------- Characters that cannot be saved stop the write ---------- */

async function openSaveWithLoss() {
  await page.click('#btnSave');
  await page.waitForTimeout(200);
  await page.fill('#saveName', 'ascii.txt');
  await page.selectOption('#saveEncoding', 'windows-1252');
  await page.click('#saveConfirm');
  await page.waitForTimeout(300);
}

await page.fill('#input', 'ABC漢字テスト');
await page.waitForTimeout(150);

// 1) Cancelling saves nothing and leaves the work unsaved.
await openSaveWithLoss();
check('it asks before writing anything', await page.locator('#lossDialog').isVisible());
check('and names the characters that would be lost', (await page.textContent('#lossChars')).includes('漢'), await page.textContent('#lossChars'));
await page.click('#lossDialog button[value="cancel"]');
await page.waitForTimeout(300);
check('cancelling writes nothing', await page.locator('#dirtyMark').isVisible(), 'the unsaved mark is still there');
check('and says so', (await page.textContent('#toastArea')).length > 0);

// 2) Switching to UTF-8 keeps every character.
await openSaveWithLoss();
const [dlUtf8] = await Promise.all([page.waitForEvent('download'), page.click('#lossDialog button[value="utf8"]')]);
await dlUtf8.saveAs(join(WORK, 'as-utf8.txt'));
await page.waitForTimeout(300);
check('saved as UTF-8, nothing is lost', readFileSync(join(WORK, 'as-utf8.txt'), 'utf-8') === 'ABC漢字テスト');
check('the unsaved mark clears', !(await page.locator('#dirtyMark').isVisible()));
check('the status bar now reads UTF-8', (await page.textContent('#statusEncoding')) === 'UTF-8');

// 3) Knowing the cost, the reader may still save with '?' in place.
await page.fill('#input', 'ABC漢字テスト');
await page.waitForTimeout(150);
await openSaveWithLoss();
const [dlReplace] = await Promise.all([page.waitForEvent('download'), page.click('#lossDialog button[value="replace"]')]);
await dlReplace.saveAs(join(WORK, 'as-ascii.txt'));
await page.waitForTimeout(300);
check('saves with ? where the characters were', readFileSync(join(WORK, 'as-ascii.txt'), 'latin1') === 'ABC?????');

/* ---------- Choosing where to save, and overwriting ---------- */

// Playwright cannot drive the File System Access API, so a stand-in handle is used.
await page.evaluate(() => {
  window.__written = null;
  window.__pickCount = 0;
  window.showSaveFilePicker = async (options) => {
    window.__pickCount++;
    return {
      name: options?.suggestedName ?? 'picked.txt',
      queryPermission: async () => 'granted',
      requestPermission: async () => 'granted',
      createWritable: async () => ({
        async write(data) {
          window.__written = [...new Uint8Array(await new Blob([data]).arrayBuffer())];
        },
        async close() {},
      }),
    };
  };
});

await page.fill('#input', 'picking a location テスト');
await page.waitForTimeout(150);
await page.click('#btnSave');
await page.waitForTimeout(200);
check('where supported, a location can be chosen', await page.locator('#savePick').isVisible());
check('with no handle held, overwriting is not offered', !(await page.locator('#saveOverwrite').isVisible()));
await page.fill('#saveName', 'picked.txt');
await page.selectOption('#saveEncoding', 'utf-8');
await page.selectOption('#saveNewline', 'lf');
await page.click('#savePick');
await page.waitForTimeout(400);
const written = await page.evaluate(() => window.__written);
check('the bytes reach the chosen file', new TextDecoder().decode(new Uint8Array(written)) === 'picking a location テスト', JSON.stringify(written?.length));
check('the unsaved mark clears after choosing a location', !(await page.locator('#dirtyMark').isVisible()));

await page.fill('#input', 'overwrite me');
await page.waitForTimeout(150);
await page.click('#btnSave');
await page.waitForTimeout(200);
check('once a handle is held, overwriting is offered', await page.locator('#saveOverwrite').isVisible());
await page.click('#saveOverwrite');
await page.waitForTimeout(400);
const overwritten = await page.evaluate(() => window.__written);
check('it writes over the same file', new TextDecoder().decode(new Uint8Array(overwritten)) === 'overwrite me');
check('overwriting never asks for the location again', (await page.evaluate(() => window.__pickCount)) === 1);
check('the unsaved mark clears after overwriting', !(await page.locator('#dirtyMark').isVisible()));

// Refusing the confirmation leaves the file alone.
await page.evaluate(() => { window.confirm = () => false; });
await page.fill('#input', 'this one is cancelled');
await page.waitForTimeout(150);
await page.click('#btnSave');
await page.waitForTimeout(200);
await page.click('#saveOverwrite');
await page.waitForTimeout(400);
check('refusing leaves the file untouched', new TextDecoder().decode(new Uint8Array(await page.evaluate(() => window.__written))) === 'overwrite me');
check('and the work stays unsaved', await page.locator('#dirtyMark').isVisible());
await page.evaluate(() => { window.confirm = () => true; });

/* ---------- The clipboard ---------- */

// Only Chromium will grant permission to read the clipboard.
// Elsewhere, all that can be checked is that writing was reported.
let clipboardReadable = false;
try {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  clipboardReadable = true;
} catch {
  /* This browser will not grant it. */
}
await page.fill('#input', 'copy test\nsecond line');
await page.waitForTimeout(150);
await page.click('#btnCopy');
await page.waitForTimeout(300);
if (clipboardReadable) {
  check('copies the whole document', (await page.evaluate(() => navigator.clipboard.readText())) === 'copy test\nsecond line');
}
check('and says it copied', (await page.textContent('#toastArea')).includes('Copied'));

await page.evaluate(() => {
  const ta = document.querySelector('#input');
  ta.focus();
  ta.setSelectionRange(0, 9);
});
await page.waitForTimeout(150);
await page.click('#btnCopy');
await page.waitForTimeout(300);
if (clipboardReadable) {
  check('copies just the selection', (await page.evaluate(() => navigator.clipboard.readText())) === 'copy test');
} else {
  check('says it copied the selection', (await page.textContent('#toastArea')).includes('Copied'));
}

/* ---------- Warning about a file that looks binary ---------- */

// Say yes to the unsaved-work question, no to the binary warning.
await page.evaluate(() => {
  window.__confirms = [];
  window.confirm = (message) => {
    window.__confirms.push(message);
    return !message.includes('binary');
  };
});
await page.setInputFiles('#filePicker', join(import.meta.dirname, '../../assets/icon-192.png'));
await page.waitForTimeout(500);
const asked = await page.evaluate(() => window.__confirms);
const binaryAsked = asked.find((m) => m.includes('binary')) ?? '';
check('a file that looks binary raises a warning', binaryAsked.length > 0, asked.join(' / ').slice(0, 80));
check('and saying no leaves it unopened', (await page.textContent('#fileName')) !== 'icon-192.png', await page.textContent('#fileName'));
await page.evaluate(() => { window.confirm = () => true; });

/* ---------- The encoding and line-ending controls look pressable ---------- */

const affordance = await page.evaluate(() => {
  const el = document.querySelector('#statusEncoding');
  return {
    tag: el.tagName,
    marker: getComputedStyle(el, '::after').content,
    border: getComputedStyle(el).borderTopWidth,
    title: el.title,
  };
});
check('the encoding is presented as a button', affordance.tag === 'BUTTON' && affordance.marker.includes('▾'), JSON.stringify(affordance));
check('and says what pressing it does', affordance.title.includes('tap'), affordance.title);

/* ---------- Help ---------- */

await page.click('#btnHelp');
await page.waitForTimeout(250);
check('the help screen links to the source', (await page.getAttribute('#helpSource', 'href')) === 'https://github.com/MasakiNiwa/InBrowser-JustText');
check('the link opens in a new tab, safely', (await page.getAttribute('#helpSource', 'rel'))?.includes('noopener'));
check('and it says what it is', ((await page.textContent('#helpSource')) ?? '').trim().length > 0);
check('the help screen shows the version', ((await page.textContent('#helpVersion')) ?? '').match(/\d+\.\d+\.\d+/) !== null);
await page.click('#helpClose');
await page.waitForTimeout(200);

/* ---------- Line numbers ---------- */

await page.fill('#input', Array.from({ length: 60 }, (_, i) => `line ${i + 1}`).join('\n'));
await page.click('#btnSettings');
await page.waitForTimeout(200);
await page.uncheck('#setWrap');
await page.click('#settingsClose');
await page.waitForTimeout(300);
check('turning wrapping off shows the line numbers', await page.locator('#gutter').isVisible());

const deltas = [];
const firstNumbers = [];
for (const scrollTop of [0, 100, 240, 900]) {
  const r = await page.evaluate(async (s) => {
    const ta = document.querySelector('#input');
    ta.scrollTop = s;
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const g = document.querySelector('#gutterInner');
    const cs = getComputedStyle(ta);
    return {
      scrollTop: ta.scrollTop,
      padTop: parseFloat(cs.paddingTop),
      lineHeight: parseFloat(cs.lineHeight),
      firstNumber: Number(g.textContent.split('\n')[0]),
      gutterTop: g.getBoundingClientRect().top,
      taBoxTop: ta.getBoundingClientRect().top,
    };
  }, scrollTop);
  firstNumbers.push(r.firstNumber);
  deltas.push(Math.abs(r.gutterTop - (r.taBoxTop + r.padTop + (r.firstNumber - 1) * r.lineHeight - r.scrollTop)));
}
check('at the top they start from 1', firstNumbers[0] === 1);
check('they line up with the text exactly', Math.max(...deltas) < 0.5, `worst drift ${Math.max(...deltas).toFixed(2)}px`);

await page.click('#statusPos');
await page.waitForTimeout(200);
await page.fill('#gotoLine', '42');
await page.click('#gotoDialog button[type="submit"]');
await page.waitForTimeout(300);
check('jumps to a line number', (await page.textContent('#statusPos')).startsWith('42 :'));

/* ---------- Reopening under another encoding ---------- */

await page.setInputFiles('#filePicker', sjisPath);
await page.waitForTimeout(400);
await page.click('#statusEncoding');
await page.waitForTimeout(200);
await page.selectOption('#reopenEncoding', 'euc-jp');
await page.click('#reopenDialog button[type="submit"]');
await page.waitForTimeout(300);
check('reopens under the encoding chosen', (await page.textContent('#statusEncoding')) === 'EUC-JP');
await page.click('#statusEncoding');
await page.selectOption('#reopenEncoding', 'shift_jis');
await page.click('#reopenDialog button[type="submit"]');
await page.waitForTimeout(300);
check('and back again to the original', (await page.inputValue('#input')).includes('日本語の設定ファイル'));

/* ---------- Settings ---------- */

await page.click('#btnSettings');
await page.waitForTimeout(150);
await page.check('#setWrap');
await page.selectOption('#setTabSize', '4');
await page.click('#fontLarger');
await page.selectOption('#setTheme', 'dark');
await page.click('#settingsClose');
await page.waitForTimeout(250);
check('turning wrapping back on hides the line numbers', !(await page.locator('#gutter').isVisible()));
check('the theme changes', (await page.getAttribute('html', 'data-theme')) === 'dark');

await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await dismissDraft(page);
check('the settings survive a reload', (await page.getAttribute('html', 'data-theme')) === 'dark');
check('so does the text size', (await page.evaluate(() => getComputedStyle(document.querySelector('#input')).fontSize)) === '17px');

/* ---------- After a save, nothing disagrees with the file ---------- */

// Even a brand-new document can be reopened once it has been saved.
await page.evaluate(() => { window.confirm = () => true; });
await page.click('#btnNew');
await page.waitForTimeout(200);
await page.fill('#input', 'freshly written');
await page.waitForTimeout(150);
await page.click('#btnSave');
await page.waitForTimeout(250);
await page.fill('#saveName', 'fresh.txt');
await page.selectOption('#saveEncoding', 'utf-8');
const [dlFresh] = await Promise.all([page.waitForEvent('download'), page.click('#saveConfirm')]);
await dlFresh.saveAs(join(WORK, 'fresh.txt'));
await page.waitForTimeout(300);
await page.click('#statusEncoding');
await page.waitForTimeout(250);
check('a newly saved document can be reopened by encoding', await page.locator('#reopenDialog').isVisible());
await page.selectOption('#reopenEncoding', 'utf-8');
await page.click('#reopenDialog button[type="submit"]');
await page.waitForTimeout(300);
check('and comes back exactly as saved', (await page.inputValue('#input')) === 'freshly written', await page.inputValue('#input'));

// Saving with '?' in place leaves file and screen different, and that must show.
await page.fill('#input', 'ABC漢字');
await page.waitForTimeout(150);
await page.click('#btnSave');
await page.waitForTimeout(250);
await page.fill('#saveName', 'lossy.txt');
await page.selectOption('#saveEncoding', 'windows-1252');
await page.click('#saveConfirm');
await page.waitForTimeout(300);
const [dlLossy] = await Promise.all([page.waitForEvent('download'), page.click('#lossDialog button[value="replace"]')]);
await dlLossy.saveAs(join(WORK, 'lossy.txt'));
await page.waitForTimeout(400);
check('a lossy save is reported as one', (await page.textContent('#toastArea')).includes('?'), (await page.textContent('#toastArea')).slice(0, 60));
check('and the unsaved mark stays on', await page.locator('#dirtyMark').isVisible(), 'because the file and the screen differ');
check('what is being edited is left alone', (await page.inputValue('#input')) === 'ABC漢字');
await page.click('#statusEncoding');
await page.waitForTimeout(250);
await page.selectOption('#reopenEncoding', 'windows-1252');
await page.click('#reopenDialog button[type="submit"]');
await page.waitForTimeout(300);
check('reopening shows what was actually written', (await page.inputValue('#input')) === 'ABC??', await page.inputValue('#input'));

/* ---------- Matches past the highlight cap ---------- */

const manyLines = Array.from({ length: 3300 }, (_, i) => `hit ${i}`).join('\n');
await page.fill('#input', manyLines);
await page.waitForTimeout(400);
// Start searching from past the cap of 3000 highlights.
await page.evaluate((text) => {
  const ta = document.querySelector('#input');
  const offset = text.split('\n').slice(0, 3100).join('\n').length;
  ta.focus();
  ta.setSelectionRange(offset, offset);
}, manyLines);
await page.click('#btnSearch');
await page.fill('#searchQuery', 'hit');
await page.waitForTimeout(600);
check('a count over the cap reads 3,000+', (await page.textContent('#searchCount')).includes('+'), await page.textContent('#searchCount'));
const positions = [];
for (let i = 0; i < 4; i++) {
  await page.click('#btnFindNext');
  await page.waitForTimeout(200);
  positions.push(await page.evaluate(() => document.querySelector('#input').selectionStart));
}
const advancing = positions.every((value, i) => i === 0 || value > positions[i - 1]);
check('"next" keeps moving past the cap', advancing, positions.join(' -> '));

// The selected match is not in the highlight list at all. Replacing must still work.
const selectedBeyondCap = await page.evaluate(() => {
  const ta = document.querySelector('#input');
  return { start: ta.selectionStart, word: ta.value.slice(ta.selectionStart, ta.selectionEnd) };
});
await page.fill('#searchReplace', 'REPLACED');
await page.click('#btnReplace');
await page.waitForTimeout(500);
const afterBeyondCap = await page.evaluate(
  (start) => document.querySelector('#input').value.slice(start, start + 8),
  selectedBeyondCap.start,
);
check(
  'a match past the cap can still be replaced',
  selectedBeyondCap.word === 'hit' && afterBeyondCap === 'REPLACED',
  `selected="${selectedBeyondCap.word}" after="${afterBeyondCap}"`,
);
await page.fill('#searchReplace', '');
await page.click('#btnSearchClose');

/* ---------- As a PWA: offline, and taking a shared file ---------- */

await page.evaluate(() => navigator.serviceWorker.ready);
await page.waitForTimeout(1200);
const cachedCount = await page.evaluate(async () => {
  const name = (await caches.keys()).find((n) => n.startsWith('justtext-app-'));
  return name ? (await (await caches.open(name)).keys()).length : 0;
});
check('the whole app is cached', cachedCount >= 20, `${cachedCount} entries`);

// Playwright cannot cut WebKit's connection off (reloading errors internally), so skip it.
if (BROWSER_NAME === 'webkit') {
  console.log('  --   skipped the offline checks: WebKit cannot be taken offline here');
} else {
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await dismissDraft(page);
  check('it starts with no connection', await page.locator('#input').isVisible());
  const offlineStatus = await page.evaluate(async () => {
    const ta = document.querySelector('#input');
    ta.value = 'edited offline';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    return document.querySelector('#statusCount').textContent;
  });
  check('and can still be edited', offlineStatus.includes('14 chars'), offlineStatus);
  // Only English ships with the app; the rest are fetched when chosen, so switching
  // language offline is what proves the other catalogs were cached too.
  await page.click('#btnSettings');
  await page.waitForTimeout(200);
  await page.selectOption('#setLanguage', 'ja');
  await page.waitForTimeout(500);
  check('another language can still be loaded offline', (await page.textContent('#btnOpen')) === '開く', await page.textContent('#btnOpen'));
  await page.selectOption('#setLanguage', 'en');
  await page.waitForTimeout(400);
  await page.click('#settingsClose');
  await page.waitForTimeout(200);
  await context.setOffline(false);
}

// Sharing into an app is a Chromium arrangement, used mostly on Android. WebKit
// never registers as a share target and cannot read the multipart body in the
// Service Worker, so there is nothing to check there.
if (BROWSER_NAME === 'webkit') {
  console.log('  --   skipped the share checks: WebKit is not a share target');
} else {
  const shared = await page.evaluate(async () => {
    const form = new FormData();
    form.append('file', new File(['{\n  "共有": "テスト"\n}\n'], '共有されたデータ.json', { type: 'application/json' }));
    const res = await fetch('./share-target', { method: 'POST', body: form, redirect: 'manual' });
    return res.type;
  });
  check('the Service Worker catches the shared POST', shared === 'opaqueredirect' || shared === 'basic');

  await page.goto(`${BASE}?share=1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  check('opening a shared file does not ask about a draft', !(await page.locator('#draftDialog').isVisible()));
  check('the shared file is what opens', (await page.inputValue('#input')).includes('"共有": "テスト"'));
  check('its name comes through as well', (await page.textContent('#fileName')) === '共有されたデータ.json');
  check('the share flag is cleared from the address', (await page.evaluate(() => location.search)) === '');
}

check('nothing errored anywhere in the run', errors.length === 0, errors.slice(0, 3).join(' | '));

/* ---------- Autosaving a draft, and getting it back ---------- */

/*
 * Drafts written before 0.4 all sat under one key, "current", and carried no
 * key of their own. Somebody updating with unsaved work has to be offered it,
 * so the key is read from the store rather than from the record.
 */
const legacyContext = await browser.newContext(phone({ locale: 'en-US' }));
const legacyPage = await legacyContext.newPage();
await legacyPage.goto(BASE, { waitUntil: 'networkidle' });
await legacyPage.waitForTimeout(600);
await legacyPage.evaluate(async () => {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('justtext', 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('drafts')) request.result.createObjectStore('drafts');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise((resolve) => {
    const transaction = db.transaction('drafts', 'readwrite');
    transaction.objectStore('drafts').put({
      name: 'from-an-older-version.txt',
      text: 'WORK FROM BEFORE THE UPDATE',
      savedText: '',
      encoding: 'utf-8',
      newline: 'lf',
      bom: false,
      bytes: null,
      untitled: false,
      at: Date.now(),
    }, 'current');
    transaction.oncomplete = resolve;
    transaction.onerror = resolve;
  });
  db.close();
});
await legacyPage.goto(BASE, { waitUntil: 'networkidle' });
await legacyPage.waitForTimeout(1100);
check('a draft from an older version is still offered', await legacyPage.locator('#draftDialog').isVisible());
check('and it is named', (await legacyPage.textContent('.draft-name')) === 'from-an-older-version.txt', await legacyPage.textContent('.draft-name'));
await legacyPage.click('.draft-pick');
await legacyPage.waitForTimeout(500);
check('and comes back whole', (await legacyPage.inputValue('#input')) === 'WORK FROM BEFORE THE UPDATE', await legacyPage.inputValue('#input'));
await legacyContext.close();

const draftContext = await browser.newContext(phone({ acceptDownloads: true, locale: 'en-US' }));
const draftPage = await draftContext.newPage();
const draftErrors = [];
draftPage.on('pageerror', (e) => draftErrors.push(e.message));
await draftPage.goto(BASE, { waitUntil: 'networkidle' });
await draftPage.waitForTimeout(300);
check('the first visit asks about nothing', !(await draftPage.locator('#draftDialog').isVisible()));

await draftPage.fill('#input', 'half-written');
await draftPage.waitForTimeout(2000); // give the autosave time to run

// Reopen, as though the device had closed the app on its own.
await draftPage.goto(BASE, { waitUntil: 'networkidle' });
await draftPage.waitForTimeout(700);
check('leftover work is offered back', await draftPage.locator('#draftDialog').isVisible());
check('and the row names the file', (await draftPage.textContent('.draft-name')).includes('untitled'), await draftPage.textContent('.draft-name'));
await draftPage.click('.draft-pick');
await draftPage.waitForTimeout(400);
check('the work comes back as it was', (await draftPage.inputValue('#input')) === 'half-written', await draftPage.inputValue('#input'));
check('and is still unsaved', await draftPage.locator('#dirtyMark').isVisible());
check('the restore is announced', (await draftPage.textContent('#toastArea')).length > 0);

// Discarding it means never being asked again.
await draftPage.fill('#input', 'written once more');
await draftPage.waitForTimeout(2000);
await draftPage.goto(BASE, { waitUntil: 'networkidle' });
await draftPage.waitForTimeout(700);
// Marking without closing the dialog leaves everything alone, so close it.
await draftPage.click('#draftDiscardAll');
await draftPage.waitForTimeout(200);
await draftPage.click('#draftLater');
await draftPage.waitForTimeout(400);
check('after discarding, it starts empty', (await draftPage.inputValue('#input')) === '');
await draftPage.goto(BASE, { waitUntil: 'networkidle' });
await draftPage.waitForTimeout(700);
check('and the discarded draft is gone for good', !(await draftPage.locator('#draftDialog').isVisible()));

// Deleting everything is an edit too, so an empty draft has to come back.
await draftPage.fill('#input', 'about to be deleted');
await draftPage.waitForTimeout(200);
await draftPage.click('#btnSave');
await draftPage.waitForTimeout(250);
await draftPage.fill('#saveName', 'to-empty.txt');
const [emptyBase] = await Promise.all([draftPage.waitForEvent('download'), draftPage.click('#saveConfirm')]);
await emptyBase.saveAs(join(WORK, 'to-empty.txt'));
await draftPage.waitForTimeout(300);
await draftPage.fill('#input', ''); // delete the lot, leaving unsaved work
await draftPage.waitForTimeout(2000);
await draftPage.goto(BASE, { waitUntil: 'networkidle' });
await draftPage.waitForTimeout(700);
check('an emptied document is still offered back', await draftPage.locator('#draftDialog').isVisible());
await draftPage.click('.draft-pick');
await draftPage.waitForTimeout(400);
check('and comes back empty', (await draftPage.inputValue('#input')) === '');
check('still marked unsaved', await draftPage.locator('#dirtyMark').isVisible());

// While the question is on screen, nothing may quietly delete the draft.
// This one is left in Japanese: the draft store has to carry non-ASCII intact.
await draftPage.fill('#input', '消えては困る内容');
await draftPage.waitForTimeout(2000);
await draftPage.goto(BASE, { waitUntil: 'networkidle' });
await draftPage.waitForTimeout(700);
check('the restore dialog is up', await draftPage.locator('#draftDialog').isVisible());
await draftPage.waitForTimeout(3000); // longer than the autosave interval
const draftStillThere = await readDraftTexts(draftPage);
check('the draft survives while the question waits', draftStillThere.includes('消えては困る内容'), JSON.stringify(draftStillThere));
await draftPage.click('.draft-pick');
await draftPage.waitForTimeout(400);
check('and can be restored after the wait', (await draftPage.inputValue('#input')) === '消えては困る内容');

// A successful save clears the draft there and then, without waiting.
await draftPage.click('#btnSave');
await draftPage.waitForTimeout(250);
await draftPage.fill('#saveName', 'synced.txt');
const [syncedSave] = await Promise.all([draftPage.waitForEvent('download'), draftPage.click('#saveConfirm')]);
await syncedSave.saveAs(join(WORK, 'synced.txt'));
await draftPage.waitForTimeout(400); // shorter than the autosave interval
const afterSave = await readDraftTexts(draftPage);
check('saving clears the draft immediately', afterSave.length === 0, JSON.stringify(afterSave).slice(0, 60));

/*
 * Opening a shared file must not throw away a draft nobody has been asked
 * about — and neither must working on that shared file afterwards. The session
 * writing the shared file's draft owns a key of its own, so editing it and
 * saving it both leave the earlier work exactly where it was.
 */
if (BROWSER_NAME !== 'webkit') {
  const shareIn = async (body, filename) => {
    await draftPage.evaluate(async ([text, name]) => {
      const form = new FormData();
      form.append('file', new File([text], name, { type: 'text/plain' }));
      await fetch('./share-target', { method: 'POST', body: form, redirect: 'manual' });
    }, [body, filename]);
    await draftPage.goto(`${BASE}?share=1`, { waitUntil: 'networkidle' });
    await draftPage.waitForTimeout(1200);
  };

  await draftPage.fill('#input', 'must survive the share');
  await draftPage.waitForTimeout(2000);
  await shareIn('the shared text', 'shared.txt');
  check('a shared launch asks nothing about the draft', !(await draftPage.locator('#draftDialog').isVisible()));
  check('and opens the shared file', (await draftPage.inputValue('#input')) === 'the shared text', await draftPage.inputValue('#input'));

  // Editing the shared file autosaves it — beside the earlier draft, not over it.
  await draftPage.fill('#input', 'the shared text, edited');
  await draftPage.waitForTimeout(2200);
  const afterShareEdit = await readDraftTexts(draftPage);
  check(
    'editing a shared file leaves the earlier draft alone',
    afterShareEdit.includes('must survive the share') && afterShareEdit.includes('the shared text, edited'),
    JSON.stringify(afterShareEdit),
  );

  // Saving it clears only its own draft.
  await draftPage.click('#btnSave');
  await draftPage.waitForTimeout(250);
  await draftPage.fill('#saveName', 'shared-out.txt');
  const [sharedSave] = await Promise.all([draftPage.waitForEvent('download'), draftPage.click('#saveConfirm')]);
  await sharedSave.saveAs(join(WORK, 'shared-out.txt'));
  await draftPage.waitForTimeout(500);
  const afterShareSave = await readDraftTexts(draftPage);
  check(
    'saving a shared file leaves the earlier draft alone',
    afterShareSave.length === 1 && afterShareSave[0] === 'must survive the share',
    JSON.stringify(afterShareSave),
  );

  await draftPage.goto(BASE, { waitUntil: 'networkidle' });
  await draftPage.waitForTimeout(900);
  check('the draft is still there afterwards', await draftPage.locator('#draftDialog').isVisible());
  await draftPage.click('.draft-pick');
  await draftPage.waitForTimeout(400);
  check('and can be recovered on the next plain launch', (await draftPage.inputValue('#input')) === 'must survive the share');
}

/*
 * Two tabs at once. Each writes under a key of its own, so neither can land on
 * the other's work — the failing case behind everything above.
 */
await draftPage.fill('#input', 'written in the first tab');
await draftPage.waitForTimeout(2200);

const secondTab = await draftContext.newPage();
await secondTab.goto(BASE, { waitUntil: 'networkidle' });
await secondTab.waitForTimeout(1200);
// The first tab is open and still autosaving, so its work is not left behind
// and must not be offered here: discarding it would take away the only copy
// that tab has until its next keystroke.
check('a live tab\'s draft is not offered to another tab', !(await secondTab.locator('#draftDialog').isVisible()));
await secondTab.fill('#input', 'written in the second tab');
await secondTab.waitForTimeout(2200);
const bothTabs = await readDraftTexts(secondTab);
check(
  'two tabs keep drafts of their own',
  bothTabs.includes('written in the first tab') && bothTabs.includes('written in the second tab'),
  JSON.stringify(bothTabs),
);
await secondTab.close();

// With both tabs gone, everything waiting shows up together in one list.
const waiting = (await readDraftTexts(draftPage)).length;
await draftPage.close();
const listTab = await draftContext.newPage();
listTab.on('pageerror', (e) => draftErrors.push(e.message));
await listTab.goto(BASE, { waitUntil: 'networkidle' });
await listTab.waitForTimeout(1300);
check('the list shows every draft that is waiting', (await listTab.locator('#draftList .draft-row').count()) === waiting, `${await listTab.locator('#draftList .draft-row').count()} of ${waiting}`);
check('each row names its file', ((await listTab.textContent('.draft-name')) ?? '').trim().length > 0);
check('and shows a line of what is in it', ((await listTab.textContent('.draft-preview')) ?? '').trim().length > 0);

// "Not now" is not a decision: everything stays exactly where it was.
await listTab.click('#draftLater');
await listTab.waitForTimeout(400);
check('"not now" keeps them all', (await readDraftTexts(listTab)).length === waiting);

// One row at a time can go, without touching the others.
await listTab.reload({ waitUntil: 'networkidle' });
await listTab.waitForTimeout(1300);
await listTab.click('#draftList .draft-row .draft-drop');
await listTab.click('#draftLater');
await listTab.waitForTimeout(600);
check('a single draft can be dropped on its own', (await readDraftTexts(listTab)).length === waiting - 1, JSON.stringify(await readDraftTexts(listTab)));

await listTab.reload({ waitUntil: 'networkidle' });
await listTab.waitForTimeout(1300);
await listTab.click('#draftDiscardAll');
await listTab.click('#draftLater');
await listTab.waitForTimeout(600);
check('and discarding all empties the store', (await readDraftTexts(listTab)).length === 0, JSON.stringify(await readDraftTexts(listTab)));

/*
 * How long a copy is kept is the reader's to set, and it is honoured before
 * anything is shown — never after. Expiring a draft the reader had just been
 * shown and chosen to keep would make a liar of the dialog.
 */
const seedDrafts = (target, rows) => target.evaluate(async (list) => {
  const db = await new Promise((resolve) => {
    const request = indexedDB.open('justtext', 1);
    request.onsuccess = () => resolve(request.result);
  });
  for (const [key, name, text, ageDays] of list) {
    await new Promise((resolve) => {
      const transaction = db.transaction('drafts', 'readwrite');
      transaction.objectStore('drafts').put({
        key, name, text, savedText: '', encoding: 'utf-8', newline: 'lf', bom: false,
        bytes: null, untitled: false, at: Date.now() - ageDays * 86400000,
      }, key);
      transaction.oncomplete = resolve;
      transaction.onerror = resolve;
    });
  }
  db.close();
}, rows);

const emptyDraftStore = (target) => target.evaluate(async () => {
  const db = await new Promise((resolve) => {
    const request = indexedDB.open('justtext', 1);
    request.onsuccess = () => resolve(request.result);
  });
  await new Promise((resolve) => {
    const transaction = db.transaction('drafts', 'readwrite');
    transaction.objectStore('drafts').clear();
    transaction.oncomplete = resolve;
    transaction.onerror = resolve;
  });
  db.close();
});

await emptyDraftStore(listTab);
await seedDrafts(listTab, [
  ['expired', 'ancient.txt', 'PAST ITS KEEPING', 31],
  ['current', 'recent.txt', 'STILL WELL WITHIN', 1],
]);
await listTab.goto(BASE, { waitUntil: 'networkidle' });
await listTab.waitForTimeout(1300);
check('an expired copy is gone before anything is offered', (await listTab.locator('#draftList .draft-row').count()) === 1, `${await listTab.locator('#draftList .draft-row').count()} rows`);
await listTab.click('#draftLater');
await listTab.waitForTimeout(600);
check('and "not now" keeps everything that was shown', (await readDraftTexts(listTab)).join() === 'STILL WELL WITHIN', JSON.stringify(await readDraftTexts(listTab)));

// A copy another tab is still writing to is spared whatever its age.
await seedDrafts(listTab, [['stale-live', 'held.txt', 'HELD BY A LIVE TAB', 40]]);
const holder = await draftContext.newPage();
holder.on('pageerror', (e) => draftErrors.push(e.message));
await holder.goto(BASE, { waitUntil: 'networkidle' });
await holder.waitForTimeout(1300);
await dismissDraft(holder);
// Make that tab own the aged key by restoring it, then keep it open.
await seedDrafts(holder, [['stale-live', 'held.txt', 'HELD BY A LIVE TAB', 40]]);
await holder.reload({ waitUntil: 'networkidle' });
await holder.waitForTimeout(1400);
const holderSaw = await holder.locator('#draftDialog').isVisible();
if (holderSaw) {
  await holder.click('.draft-pick');
  await holder.waitForTimeout(600);
}
await holder.fill('#input', 'HELD BY A LIVE TAB, STILL GOING');
await holder.waitForTimeout(2200);
await listTab.goto(BASE, { waitUntil: 'networkidle' });
await listTab.waitForTimeout(1400);
check(
  "a live tab's copy is not expired out from under it",
  (await readDraftTexts(listTab)).some((text) => text.startsWith('HELD BY A LIVE TAB')),
  JSON.stringify(await readDraftTexts(listTab)),
);
await holder.close();
await listTab.goto(BASE, { waitUntil: 'networkidle' });
await listTab.waitForTimeout(1300);
await dismissDraft(listTab);

/*
 * Discarding is deferred. On a phone the ✕ is easy to hit by accident, so
 * nothing leaves storage until the dialog is closed on it.
 */
await seedDrafts(listTab, [['undo-me', 'mistap.txt', 'ALMOST LOST', 0]]);
await listTab.goto(BASE, { waitUntil: 'networkidle' });
await listTab.waitForTimeout(1300);
await listTab.click('#draftList .draft-row .draft-drop');
await listTab.waitForTimeout(250);
check('the ✕ only marks the row', (await readDraftTexts(listTab)).includes('ALMOST LOST'));
check('and the row shows it is going', await listTab.locator('#draftList .draft-row.discarding').count() === 1);
await listTab.click('#draftList .draft-row .draft-drop');
await listTab.waitForTimeout(250);
check('tapping again takes it back', (await listTab.locator('#draftList .draft-row.discarding').count()) === 0);
await listTab.click('#draftDiscardAll');
await listTab.waitForTimeout(250);
check('"discard all" marks rather than deletes', (await readDraftTexts(listTab)).includes('ALMOST LOST'));
await listTab.click('#draftLater');
await listTab.waitForTimeout(700);
check('and the marks are applied on closing', (await readDraftTexts(listTab)).length === 0, JSON.stringify(await readDraftTexts(listTab)));

/* The same list, reachable from the tools menu without restarting. */
await seedDrafts(listTab, [['from-tools', 'from-tools.txt', 'REACHED FROM THE TOOLS MENU', 0]]);
await listTab.click('#btnTools');
await listTab.waitForTimeout(300);
await listTab.click('.tool-item[data-id="app.drafts"]');
await listTab.waitForTimeout(700);
check('the drafts can be opened from the tools menu', await listTab.locator('#draftDialog').isVisible());
await listTab.click('.draft-pick');
await listTab.waitForTimeout(700);
check('and restored there and then', (await listTab.inputValue('#input')) === 'REACHED FROM THE TOOLS MENU', await listTab.inputValue('#input'));

/* Keeping copies at all is the reader's choice, and so is deleting them now. */
await listTab.fill('#input', 'SOMETHING UNSAVED');
await listTab.waitForTimeout(2200);
check('a copy is kept while that is switched on', (await readDraftTexts(listTab)).length > 0);
await listTab.click('#btnSettings');
await listTab.waitForTimeout(300);
await listTab.uncheck('#setAutosave');
await listTab.waitForTimeout(800);
check('switching it off clears what was kept', (await readDraftTexts(listTab)).length === 0);
check('and the mark says nothing is being kept', (await listTab.getAttribute('#dirtyMark', 'data-draft')) === 'off');
await listTab.check('#setAutosave');
await listTab.waitForTimeout(500);
await listTab.selectOption('#setDraftKeep', '7');
await listTab.waitForTimeout(300);
check('the keeping time can be changed', (await listTab.inputValue('#setDraftKeep')) === '7');
listTab.once('dialog', (d) => d.accept());
await listTab.click('#clearDrafts');
await listTab.waitForTimeout(800);
check('and everything can be deleted on the spot', (await readDraftTexts(listTab)).length === 0);
await listTab.click('#settingsClose');
await listTab.waitForTimeout(300);
await listTab.evaluate(() => { document.querySelector('#input').value = ''; });


// Work that has been saved leaves no draft behind.
await listTab.fill('#input', 'this one gets saved');
await listTab.waitForTimeout(200);
await listTab.click('#btnSave');
await listTab.waitForTimeout(250);
await listTab.fill('#saveName', 'saved.txt');
const [draftDownload] = await Promise.all([listTab.waitForEvent('download'), listTab.click('#saveConfirm')]);
await draftDownload.saveAs(join(WORK, 'saved.txt'));
await listTab.waitForTimeout(2000);
await listTab.goto(BASE, { waitUntil: 'networkidle' });
await listTab.waitForTimeout(700);
check('saved work is never offered back', !(await listTab.locator('#draftDialog').isVisible()));
check('autosaving errored nowhere', draftErrors.length === 0, draftErrors.join(' | '));
await draftContext.close();

/* ---------- The interface language ---------- */

// The device's language decides, and anything not on offer falls to English.
const detection = [
  ['en-US', 'en', 'Open'],
  ['fr-FR', 'fr', 'Ouvrir'],
  ['de-DE', 'de', 'Öffnen'],
  ['es-ES', 'es', 'Abrir'],
  ['it-IT', 'it', 'Apri'],
  ['pt-BR', 'pt', 'Abrir'],
  ['zh-CN', 'zh-Hans', '打开'],
  ['zh-TW', 'zh-Hant', '開啟'],
  ['ko-KR', 'ko', '열기'],
  ['hi-IN', 'hi', 'खोलें'],
  ['id-ID', 'id', 'Buka'],
  ['vi-VN', 'vi', 'Mở'],
  ['th-TH', 'th', 'เปิด'],
  ['ar-EG', 'ar', 'فتح'],
  ['sv-SE', 'en', 'Open'],
  ['ru-RU', 'en', 'Open'],
];

const detectionResults = [];
for (const [browserLocale, expectedCode, expectedOpen] of detection) {
  const ctx = await browser.newContext(phone({ locale: browserLocale }));
  const p2 = await ctx.newPage();
  const localeErrors = [];
  p2.on('pageerror', (e) => localeErrors.push(e.message));
  p2.on('console', (m) => {
    if (m.type() === 'error' && !isHarmless(m.text())) localeErrors.push(m.text());
  });
  await p2.goto(BASE, { waitUntil: 'networkidle' });
  await p2.waitForTimeout(400);
  const r = await p2.evaluate(() => ({
    lang: document.documentElement.lang,
    dir: document.documentElement.dir,
    open: document.querySelector('#btnOpen span').textContent,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  detectionResults.push({
    tag: browserLocale,
    ok: r.lang === expectedCode && r.open === expectedOpen && r.overflow === 0 && localeErrors.length === 0,
    detail: `${r.lang} "${r.open}"${localeErrors.length ? ' ERR' : ''}`,
  });
  await ctx.close();
}
const failedLocales = detectionResults.filter((r) => !r.ok);
check(
  'the device language decides which one opens',
  failedLocales.length === 0,
  failedLocales.map((r) => `${r.tag}: ${r.detail}`).join(' / ') || `${detectionResults.length} languages checked`,
);

// A language not on offer opens in English.
const svContext = await browser.newContext(phone({ locale: 'sv-SE' }));
const svPage = await svContext.newPage();
await svPage.goto(BASE, { waitUntil: 'networkidle' });
await svPage.waitForTimeout(300);
check('an unsupported language opens in English', (await svPage.textContent('#fileName')) === 'untitled.txt');
await svContext.close();

// A language written right to left.
const arContext = await browser.newContext(phone({ locale: 'ar-EG' }));
const arPage = await arContext.newPage();
const arErrors = [];
arPage.on('pageerror', (e) => arErrors.push(e.message));
await arPage.goto(BASE, { waitUntil: 'networkidle' });
await arPage.waitForTimeout(400);
check('in Arabic the page reads right to left', (await arPage.getAttribute('html', 'dir')) === 'rtl');
check('but the editing surface stays left to right', (await arPage.getAttribute('#editor', 'dir')) === 'ltr');

await arPage.fill('#input', '{\n  "الاسم": "قيمة",\n  "items": ["foo", "bar", "foo"]\n}');
await arPage.click('#btnSearch');
await arPage.fill('#searchQuery', 'foo');
await arPage.waitForTimeout(300);
await arPage.click('#btnFindNext');
await arPage.waitForTimeout(300);
check('the match counter reads in the right order', (await arPage.textContent('#searchCount')) === '1 / 2');
check('and its digits are not reordered', (await arPage.evaluate(() => getComputedStyle(document.querySelector('#searchCount')).direction)) === 'ltr');

// The alignment must not care which way the page reads.
const rtlOverlap = await arPage.evaluate(() => {
  const ta = document.querySelector('#input');
  const mark = document.querySelector('#highlightLayer mark.current');
  const cs = getComputedStyle(ta);
  const probe = document.createElement('div');
  for (const prop of ['fontFamily', 'fontSize', 'lineHeight', 'letterSpacing', 'padding', 'whiteSpace', 'overflowWrap', 'tabSize', 'direction']) {
    probe.style[prop] = cs[prop];
  }
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.style.width = `${ta.clientWidth}px`;
  probe.style.boxSizing = 'border-box';
  const index = ta.value.indexOf('foo');
  probe.innerHTML = `${ta.value.slice(0, index).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}<span id="p">foo</span>`;
  ta.parentElement.append(probe);
  const probeRect = probe.querySelector('#p').getBoundingClientRect();
  const base = probe.getBoundingClientRect();
  const markRect = mark.getBoundingClientRect();
  const taRect = ta.getBoundingClientRect();
  probe.remove();
  return {
    dx: Math.abs((markRect.left - taRect.left) - (probeRect.left - base.left)),
    dy: Math.abs((markRect.top - taRect.top) - (probeRect.top - base.top)),
  };
});
check('the highlight still lands on the characters', rtlOverlap.dx < 1 && rtlOverlap.dy < 1, JSON.stringify(rtlOverlap));
check('nothing errors right to left', arErrors.length === 0, arErrors.join(' | '));
await arContext.close();

// Switching from the settings, and remembering the choice.
const enContext = await browser.newContext(phone({ locale: 'en-US' }));
const enPage = await enContext.newPage();
const enErrors = [];
enPage.on('pageerror', (e) => enErrors.push(e.message));
await enPage.goto(BASE, { waitUntil: 'networkidle' });
await enPage.waitForTimeout(300);

await enPage.fill('#input', 'one\ntwo');
await enPage.waitForTimeout(200);
check('the counts read in English', (await enPage.textContent('#statusCount')) === '2 lines / 7 chars', await enPage.textContent('#statusCount'));

await enPage.click('#btnTools');
await enPage.waitForTimeout(250);
check('so do the tool names', (await enPage.textContent('.tool-item[data-id="json.format2"]')).includes('Format JSON'));
await enPage.click('.tool-item[data-id="line.sortAsc"]');
await enPage.waitForTimeout(300);
check('and the tools work from there', (await enPage.inputValue('#input')) === 'one\ntwo');

// Every language is in the list.
await enPage.click('#btnSettings');
await enPage.waitForTimeout(250);
const options = await enPage.$$eval('#setLanguage option', (els) => els.map((e) => e.value));
check('the settings offer all 15 languages', options.length === 15, `${options.length}: ${options.join(', ')}`);
for (const code of ['en', 'fr', 'it', 'de', 'es', 'zh-Hans', 'zh-Hant', 'ja', 'ko', 'pt', 'hi', 'id', 'vi', 'th', 'ar']) {
  if (!options.includes(code)) check(`${code} is in the list`, false);
}

// Switching works from any language to any other.
await enPage.selectOption('#setLanguage', 'th');
await enPage.waitForTimeout(400);
check('switches to Thai', (await enPage.textContent('#btnOpen')) === 'เปิด', await enPage.textContent('#btnOpen'));
await enPage.selectOption('#setLanguage', 'ar');
await enPage.waitForTimeout(400);
check('switching to Arabic turns the page around', (await enPage.getAttribute('html', 'dir')) === 'rtl');
await enPage.selectOption('#setLanguage', 'ja');
await enPage.waitForTimeout(400);
check('the chosen language takes effect at once', (await enPage.textContent('#btnOpen')) === '開く', await enPage.textContent('#btnOpen'));
check('and the direction comes back with it', (await enPage.getAttribute('html', 'dir')) === 'ltr');
check('a dialog left open is retranslated too', (await enPage.textContent('#settingsTitle')) === '設定');
await enPage.click('#settingsClose');
await enPage.waitForTimeout(200);
check('the placeholder file name follows', (await enPage.textContent('#fileName')) === '無題.txt');
check('and the counts read in Japanese', (await enPage.textContent('#statusCount')) === '2 行 / 7 文字');

await enPage.reload({ waitUntil: 'networkidle' });
await enPage.waitForTimeout(400);
await dismissDraft(enPage);
check('the choice is remembered next time', (await enPage.textContent('#btnOpen')) === '開く');

await enPage.click('#btnSearch');
await enPage.fill('#searchQuery', 'zzz');
await enPage.waitForTimeout(250);
await enPage.click('#btnFindNext');
await enPage.waitForTimeout(300);
check('notifications speak the chosen language too', (await enPage.textContent('#toastArea')).includes('見つかりません'), await enPage.textContent('#toastArea'));

check('switching language errors nowhere', enErrors.length === 0, enErrors.join(' | '));
await enContext.close();

/* ---------- Tidying up ---------- */

await browser.close();
stopServer();

const failed = results.filter((r) => !r.ok);
console.log('-'.repeat(46));
console.log(`${BROWSER_NAME}: ${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) {
  console.log('failed:', failed.map((f) => f.name).join(' / '));
  process.exit(1);
}
