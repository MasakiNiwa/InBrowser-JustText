/**
 * ブラウザでの通し確認。
 *
 *   npm run test:browser
 *
 * Playwright が必要（`npm i -D playwright` と `npx playwright install chromium`）。
 * 単体テスト（npm test）では見られない、次のような部分を確認する。
 *   - 検索ハイライトが本文と 1px もずれずに重なるか
 *   - 行番号が本文の行と揃うか
 *   - 文字コードを保ったまま読み書きできるか（ダウンロードの中身を検証）
 *   - オフライン起動と、Android の「共有」からの受け取り
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
 * どのブラウザで確かめるか。JUSTTEXT_BROWSER=firefox のように指定する。
 * 既定は chromium。
 */
const BROWSERS = { chromium, firefox, webkit };
const BROWSER_NAME = process.env.JUSTTEXT_BROWSER ?? 'chromium';
const browserType = BROWSERS[BROWSER_NAME];
if (!browserType) {
  console.error(`知らないブラウザです: ${BROWSER_NAME}（chromium / firefox / webkit）`);
  process.exit(2);
}

/**
 * 端末の設定。Firefox は isMobile / deviceScaleFactor に対応しないため、
 * 画面の大きさだけ合わせる。
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
 * 起動時に出る「前回の続きがあります」を閉じる。
 * 復元そのものは専用の節で確かめるので、ここでは邪魔にならないよう破棄する。
 */
async function dismissDraft(target) {
  const visible = await target.locator('#draftDialog').isVisible().catch(() => false);
  if (!visible) return;
  await target.click('#draftDialog button[value="discard"]');
  await target.waitForTimeout(200);
}

/* ---------- 配信サーバ ---------- */

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
      /* まだ起動していない */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('サーバが起動しませんでした');
}
await waitForServer();

/* ---------- 試験用ファイル ---------- */

const sjisPath = join(WORK, 'sample-sjis.json');
writeFileSync(sjisPath, encodeText('{\r\n  "設定": "日本語の設定ファイル",\r\n  "値": 42\r\n}\r\n', 'shift_jis').bytes);

/* ---------- 本体 ---------- */

const browser = await browserType.launch();
const context = await browser.newContext(phone({ acceptDownloads: true, locale: 'ja-JP' }));
const page = await context.newPage();

/**
 * ブラウザ自身が出す無害な注意はエラーとして数えない。
 * interactive-widget は Android のソフトキーボード向けの指定で、
 * 知らないブラウザは読み飛ばすだけだが WebKit は console にエラーとして書く。
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

check('ページが読み込める', (await page.title()) === 'InBrowser JustText');
check('起動時にエラーが出ない', errors.length === 0, errors.join(' | '));
check('起動時は検索パネルが閉じている', !(await page.locator('#searchPanel').isVisible()));
check('起動時はドロップ表示が出ていない', !(await page.locator('#dropOverlay').isVisible()));

/* ---------- 入力とステータス ---------- */

const sample = ['{', '  "name": "テスト",', '  "items": [1, 2, 3],', '  "note": "foo bar foo"', '}'].join('\n');
await page.fill('#input', sample);
// 画面の更新は次の描画にまとめているので、待ち時間ではなく内容の変化を待つ
const statusUpdated = await page
  .waitForFunction(
    (expected) => document.querySelector('#statusCount').textContent === expected,
    `5 行 / ${sample.length} 文字`,
    { timeout: 5000 },
  )
  .then(() => true)
  .catch(() => false);
check('文字数と行数が表示される', statusUpdated, await page.textContent('#statusCount'));
check('未保存マークが出る', await page.locator('#dirtyMark').isVisible());

/* ---------- 検索 ---------- */

await page.click('#btnSearch');
await page.fill('#searchQuery', 'foo');
await page.waitForTimeout(250);
check('一致件数が出る', (await page.textContent('#searchCount')).includes('2'));
check('ハイライトが描画される', (await page.locator('#highlightLayer mark').count()) === 2);

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
check('鏡レイヤーの字送りが本文と一致', metrics.same, JSON.stringify(metrics));
check('鏡レイヤーの折り返し幅が一致', Math.abs(metrics.layerWidth - metrics.taClientWidth) < 0.5);

await page.click('#btnFindNext');
await page.waitForTimeout(150);
check('現在位置が強調される', (await page.locator('#highlightLayer mark.current').count()) === 1);
check('カウンタが n/m 表示', (await page.textContent('#searchCount')) === '1 / 2');

/* 一致した文字の上にハイライトが正確に重なっているか */
const overlap = await page.evaluate(() => {
  const ta = document.querySelector('#input');
  const mark = document.querySelector('#highlightLayer mark.current');
  const rect = mark.getBoundingClientRect();
  // 本文側で同じ位置を測るために、同じ内容・同じ字送りの計測要素を使う
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
check('ハイライトが文字と重なる', overlap.dx < 1 && overlap.dy < 1 && overlap.width < 1, JSON.stringify(overlap));

/* 選んだ一致だけを置換できるか */
await page.click('#btnFindNext');
await page.waitForTimeout(150);
check('次へ移動できる', (await page.textContent('#searchCount')) === '2 / 2');
await page.fill('#searchReplace', 'ZZZ');
await page.click('#btnReplace');
await page.waitForTimeout(250);
check('選択中の一致だけが置換される', (await page.inputValue('#input')).includes('"foo bar ZZZ"'));

await page.fill('#searchReplace', 'BAZ');
await page.click('#btnReplaceAll');
await page.waitForTimeout(250);
check('すべて置換できる', (await page.inputValue('#input')).includes('"BAZ bar ZZZ"'));

await page.check('#optRegex');
await page.fill('#searchQuery', '(\\d), (\\d)');
await page.fill('#searchReplace', '$2-$1');
await page.click('#btnReplaceAll');
await page.waitForTimeout(250);
check('正規表現の後方参照が効く', (await page.inputValue('#input')).includes('[2-1, 3]'));

await page.fill('#searchQuery', '[');
await page.waitForTimeout(250);
check('不正な正規表現を知らせる', (await page.textContent('#searchError')).length > 0);
await page.uncheck('#optRegex');
await page.fill('#searchQuery', '');
await page.click('#btnSearchClose');
await page.waitForTimeout(150);
check('検索を閉じるとハイライトも消える', (await page.locator('#highlightLayer mark').count()) === 0);

/* ---------- 元に戻す / やり直す ---------- */

await page.click('#btnUndo');
await page.click('#btnUndo');
await page.click('#btnUndo');
await page.waitForTimeout(200);
check('元に戻せる', (await page.inputValue('#input')).includes('foo bar foo'));
await page.click('#btnRedo');
await page.waitForTimeout(150);
check('やり直せる', (await page.inputValue('#input')).includes('ZZZ'));

/* ---------- キーボード操作 ---------- */

await page.fill('#input', '');
await page.click('#input');
await page.keyboard.type('  インデント');
await page.keyboard.press('Enter');
await page.waitForTimeout(150);
check('改行でインデントを引き継ぐ', (await page.inputValue('#input')) === '  インデント\n  ', JSON.stringify(await page.inputValue('#input')));
await page.keyboard.press('Tab');
await page.waitForTimeout(100);
check('Tab でスペースが入る', (await page.inputValue('#input')).endsWith('    '), JSON.stringify(await page.inputValue('#input')));
await page.keyboard.press('Control+f');
await page.waitForTimeout(200);
check('Ctrl+F で検索が開く', await page.locator('#searchPanel').isVisible());
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
check('Esc で検索が閉じる', !(await page.locator('#searchPanel').isVisible()));

/* ---------- ファイルを開く（Shift_JIS + CRLF） ---------- */

await page.setInputFiles('#filePicker', sjisPath);
await page.waitForTimeout(500);
check('Shift_JIS を判定して開く', (await page.textContent('#statusEncoding')) === 'Shift_JIS');
check('日本語が化けずに読める', (await page.inputValue('#input')).includes('日本語の設定ファイル'));
check('ファイル名が表示される', (await page.textContent('#fileName')) === 'sample-sjis.json');
check('CRLF を検出する', (await page.textContent('#statusNewline')) === 'CRLF');
check('読み込み直後は未保存マークなし', !(await page.locator('#dirtyMark').isVisible()));

/* ---------- ツール ---------- */

await page.click('#btnTools');
await page.click('.tool-item[data-id="json.format2"]');
await page.waitForTimeout(300);
const formatted = await page.inputValue('#input');
check('JSON を整形できる', formatted.startsWith('{\n  "') && JSON.parse(formatted)['設定'] === '日本語の設定ファイル');

await page.click('#btnTools');
await page.click('.tool-item[data-id="json.minify"]');
await page.waitForTimeout(300);
check('JSON を最小化できる', !(await page.inputValue('#input')).includes('\n'));

await page.fill('#input', '{\n  "a": 1,\n  "b" 2\n}');
await page.waitForTimeout(150);
await page.click('#btnTools');
await page.click('.tool-item[data-id="json.validate"]');
await page.waitForTimeout(400);
check('壊れた JSON でカーソルが該当位置へ動く', (await page.evaluate(() => document.querySelector('#input').selectionStart)) === 18);
check('エラーが通知される', (await page.textContent('#toastArea')).includes('JSON'));

await page.fill('#input', 'c\na\nb');
await page.waitForTimeout(100);
await page.click('#btnTools');
await page.click('.tool-item[data-id="line.sortAsc"]');
await page.waitForTimeout(300);
check('行を並べ替えられる', (await page.inputValue('#input')) === 'a\nb\nc');

/* ---------- 保存（ダウンロード） ---------- */

await page.fill('#input', 'テスト保存\nsecond line');
await page.waitForTimeout(150);
await page.click('#btnSave');
await page.waitForTimeout(300);
await page.click('#saveRename');
check('別名ボタンで連番が付く', (await page.inputValue('#saveName')).includes('(1)'));
await page.fill('#saveName', 'output.txt');
await page.selectOption('#saveEncoding', 'shift_jis');
await page.selectOption('#saveNewline', 'crlf');
const [download] = await Promise.all([page.waitForEvent('download'), page.click('#saveConfirm')]);
const savedPath = join(WORK, 'output.txt');
await download.saveAs(savedPath);
check('ダウンロード名が指定どおり', download.suggestedFilename() === 'output.txt');
const savedBytes = readFileSync(savedPath);
check('Shift_JIS・CRLF で保存される', new TextDecoder('shift_jis').decode(savedBytes) === 'テスト保存\r\nsecond line');
await page.waitForTimeout(300);
check('保存後に未保存マークが消える', !(await page.locator('#dirtyMark').isVisible()));

/* ---------- 保存できない文字があるときは、書き出す前に止める ---------- */

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

// 1) 取りやめれば、保存もされず未保存のままであること
await openSaveWithLoss();
check('保存前に確認が出る', await page.locator('#lossDialog').isVisible());
check('失われる文字が示される', (await page.textContent('#lossChars')).includes('漢'), await page.textContent('#lossChars'));
await page.click('#lossDialog button[value="cancel"]');
await page.waitForTimeout(300);
check('取りやめると保存されない', await page.locator('#dirtyMark').isVisible(), '未保存マークが残る');
check('取りやめを知らせる', (await page.textContent('#toastArea')).length > 0);

// 2) UTF-8 に切り替えれば、文字が失われないこと
await openSaveWithLoss();
const [dlUtf8] = await Promise.all([page.waitForEvent('download'), page.click('#lossDialog button[value="utf8"]')]);
await dlUtf8.saveAs(join(WORK, 'as-utf8.txt'));
await page.waitForTimeout(300);
check('UTF-8 で保存すれば文字が残る', readFileSync(join(WORK, 'as-utf8.txt'), 'utf-8') === 'ABC漢字テスト');
check('保存後は未保存マークが消える', !(await page.locator('#dirtyMark').isVisible()));
check('文字コード表示が UTF-8 に変わる', (await page.textContent('#statusEncoding')) === 'UTF-8');

// 3) 承知のうえなら ? に置き換えて保存できること
await page.fill('#input', 'ABC漢字テスト');
await page.waitForTimeout(150);
await openSaveWithLoss();
const [dlReplace] = await Promise.all([page.waitForEvent('download'), page.click('#lossDialog button[value="replace"]')]);
await dlReplace.saveAs(join(WORK, 'as-ascii.txt'));
await page.waitForTimeout(300);
check('承知すれば ? に置き換えて保存する', readFileSync(join(WORK, 'as-ascii.txt'), 'latin1') === 'ABC?????');

/* ---------- 保存先を選ぶ / 上書き保存（対応環境のみ） ---------- */

// File System Access API は Playwright から操作できないため、偽の掴み手を差し込んで確かめる
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

await page.fill('#input', '保存先を選ぶ試験');
await page.waitForTimeout(150);
await page.click('#btnSave');
await page.waitForTimeout(200);
check('対応環境では保存先を選べる', await page.locator('#savePick').isVisible());
check('掴んでいないうちは上書きは出さない', !(await page.locator('#saveOverwrite').isVisible()));
await page.fill('#saveName', 'picked.txt');
await page.selectOption('#saveEncoding', 'utf-8');
await page.selectOption('#saveNewline', 'lf');
await page.click('#savePick');
await page.waitForTimeout(400);
const written = await page.evaluate(() => window.__written);
check('選んだ先へ書き込まれる', new TextDecoder().decode(new Uint8Array(written)) === '保存先を選ぶ試験', JSON.stringify(written?.length));
check('保存後は未保存マークが消える（保存先指定）', !(await page.locator('#dirtyMark').isVisible()));

await page.fill('#input', '上書きの試験');
await page.waitForTimeout(150);
await page.click('#btnSave');
await page.waitForTimeout(200);
check('保存先を掴んだ後は上書きできる', await page.locator('#saveOverwrite').isVisible());
await page.click('#saveOverwrite');
await page.waitForTimeout(400);
const overwritten = await page.evaluate(() => window.__written);
check('同じ先へ上書きされる', new TextDecoder().decode(new Uint8Array(overwritten)) === '上書きの試験');
check('上書きでは選び直さない', (await page.evaluate(() => window.__pickCount)) === 1);
check('上書き後も未保存マークが消える', !(await page.locator('#dirtyMark').isVisible()));

// 確認で取り消したら書き換えないこと
await page.evaluate(() => { window.confirm = () => false; });
await page.fill('#input', '取り消される内容');
await page.waitForTimeout(150);
await page.click('#btnSave');
await page.waitForTimeout(200);
await page.click('#saveOverwrite');
await page.waitForTimeout(400);
check('確認を断れば上書きしない', new TextDecoder().decode(new Uint8Array(await page.evaluate(() => window.__written))) === '上書きの試験');
check('断った場合は未保存のまま', await page.locator('#dirtyMark').isVisible());
await page.evaluate(() => { window.confirm = () => true; });

/* ---------- クリップボード ---------- */

// クリップボードの読み出しを許可できるのは Chromium だけ。
// 他のブラウザでは「書き込めたか」だけを確かめる。
let clipboardReadable = false;
try {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  clipboardReadable = true;
} catch {
  /* 権限を与えられないブラウザ */
}
await page.fill('#input', 'コピーの試験\n2 行目');
await page.waitForTimeout(150);
await page.click('#btnCopy');
await page.waitForTimeout(300);
if (clipboardReadable) {
  check('全文をコピーできる', (await page.evaluate(() => navigator.clipboard.readText())) === 'コピーの試験\n2 行目');
}
check('コピーを知らせる', (await page.textContent('#toastArea')).includes('コピー'));

await page.evaluate(() => {
  const ta = document.querySelector('#input');
  ta.focus();
  ta.setSelectionRange(0, 6);
});
await page.waitForTimeout(150);
await page.click('#btnCopy');
await page.waitForTimeout(300);
if (clipboardReadable) {
  check('選択範囲だけコピーできる', (await page.evaluate(() => navigator.clipboard.readText())) === 'コピーの試験');
} else {
  check('選択範囲のコピーを知らせる', (await page.textContent('#toastArea')).includes('コピー'));
}

/* ---------- バイナリらしいファイルの警告 ---------- */

// 未保存の確認には「はい」、バイナリの警告には「いいえ」と答える
await page.evaluate(() => {
  window.__confirms = [];
  window.confirm = (message) => {
    window.__confirms.push(message);
    return !message.includes('バイナリ');
  };
});
await page.setInputFiles('#filePicker', join(import.meta.dirname, '../../assets/icon-192.png'));
await page.waitForTimeout(500);
const asked = await page.evaluate(() => window.__confirms);
const binaryAsked = asked.find((m) => m.includes('バイナリ')) ?? '';
check('バイナリらしいファイルは警告する', binaryAsked.length > 0, asked.join(' / ').slice(0, 80));
check('断れば読み込まない', (await page.textContent('#fileName')) !== 'icon-192.png', await page.textContent('#fileName'));
await page.evaluate(() => { window.confirm = () => true; });

/* ---------- 文字コード・改行コードが押せると分かること ---------- */

const affordance = await page.evaluate(() => {
  const el = document.querySelector('#statusEncoding');
  return {
    tag: el.tagName,
    marker: getComputedStyle(el, '::after').content,
    border: getComputedStyle(el).borderTopWidth,
    title: el.title,
  };
});
check('文字コードはボタンとして示される', affordance.tag === 'BUTTON' && affordance.marker.includes('▾'), JSON.stringify(affordance));
check('押せることが説明されている', affordance.title.includes('押す'), affordance.title);

/* ---------- 行番号 ---------- */

await page.fill('#input', Array.from({ length: 60 }, (_, i) => `line ${i + 1}`).join('\n'));
await page.click('#btnSettings');
await page.waitForTimeout(200);
await page.uncheck('#setWrap');
await page.click('#settingsClose');
await page.waitForTimeout(300);
check('折り返しオフで行番号が出る', await page.locator('#gutter').isVisible());

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
check('先頭では 1 行目から表示される', firstNumbers[0] === 1);
check('行番号が本文と正確に揃う', Math.max(...deltas) < 0.5, `最大ずれ ${Math.max(...deltas).toFixed(2)}px`);

await page.click('#statusPos');
await page.waitForTimeout(200);
await page.fill('#gotoLine', '42');
await page.click('#gotoDialog button[type="submit"]');
await page.waitForTimeout(300);
check('行へ移動できる', (await page.textContent('#statusPos')).startsWith('42 :'));

/* ---------- 文字コードを指定して開き直す ---------- */

await page.setInputFiles('#filePicker', sjisPath);
await page.waitForTimeout(400);
await page.click('#statusEncoding');
await page.waitForTimeout(200);
await page.selectOption('#reopenEncoding', 'euc-jp');
await page.click('#reopenDialog button[type="submit"]');
await page.waitForTimeout(300);
check('指定の文字コードで開き直せる', (await page.textContent('#statusEncoding')) === 'EUC-JP');
await page.click('#statusEncoding');
await page.selectOption('#reopenEncoding', 'shift_jis');
await page.click('#reopenDialog button[type="submit"]');
await page.waitForTimeout(300);
check('元の文字コードに戻せる', (await page.inputValue('#input')).includes('日本語の設定ファイル'));

/* ---------- 設定 ---------- */

await page.click('#btnSettings');
await page.waitForTimeout(150);
await page.check('#setWrap');
await page.selectOption('#setTabSize', '4');
await page.click('#fontLarger');
await page.selectOption('#setTheme', 'dark');
await page.click('#settingsClose');
await page.waitForTimeout(250);
check('折り返しを戻すと行番号が消える', !(await page.locator('#gutter').isVisible()));
check('テーマが切り替わる', (await page.getAttribute('html', 'data-theme')) === 'dark');

await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await dismissDraft(page);
check('設定が再読込後も残る', (await page.getAttribute('html', 'data-theme')) === 'dark');
check('文字サイズも残る', (await page.evaluate(() => getComputedStyle(document.querySelector('#input')).fontSize)) === '17px');

/* ---------- 保存したあとの状態が食い違わないこと ---------- */

// 新規の書類でも、保存すればその内容を開き直せる
await page.evaluate(() => { window.confirm = () => true; });
await page.click('#btnNew');
await page.waitForTimeout(200);
await page.fill('#input', '新しく作った内容');
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
check('新規保存後も文字コードを指定して開き直せる', await page.locator('#reopenDialog').isVisible());
await page.selectOption('#reopenEncoding', 'utf-8');
await page.click('#reopenDialog button[type="submit"]');
await page.waitForTimeout(300);
check('開き直しても保存した内容が出る', (await page.inputValue('#input')) === '新しく作った内容', await page.inputValue('#input'));

// ? に置き換えて保存したときは、手元とファイルの食い違いが分かること
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
check('? 置換保存では食い違いを知らせる', (await page.textContent('#toastArea')).includes('?'), (await page.textContent('#toastArea')).slice(0, 60));
check('? 置換保存では未保存マークが残る', await page.locator('#dirtyMark').isVisible(), '編集中の内容とファイルが違うため');
check('編集中の内容は書き換えない', (await page.inputValue('#input')) === 'ABC漢字');
await page.click('#statusEncoding');
await page.waitForTimeout(250);
await page.selectOption('#reopenEncoding', 'windows-1252');
await page.click('#reopenDialog button[type="submit"]');
await page.waitForTimeout(300);
check('開き直すと保存されたとおりの内容になる', (await page.inputValue('#input')) === 'ABC??', await page.inputValue('#input'));

/* ---------- 強調表示の上限を超えた一致でも移動が進むこと ---------- */

const manyLines = Array.from({ length: 3300 }, (_, i) => `hit ${i}`).join('\n');
await page.fill('#input', manyLines);
await page.waitForTimeout(400);
// 上限（3000 件）より後ろにカーソルを置いてから探し始める
await page.evaluate((text) => {
  const ta = document.querySelector('#input');
  const offset = text.split('\n').slice(0, 3100).join('\n').length;
  ta.focus();
  ta.setSelectionRange(offset, offset);
}, manyLines);
await page.click('#btnSearch');
await page.fill('#searchQuery', 'hit');
await page.waitForTimeout(600);
check('上限を超えた件数は 3,000+ と示す', (await page.textContent('#searchCount')).includes('+'), await page.textContent('#searchCount'));
const positions = [];
for (let i = 0; i < 4; i++) {
  await page.click('#btnFindNext');
  await page.waitForTimeout(200);
  positions.push(await page.evaluate(() => document.querySelector('#input').selectionStart));
}
const advancing = positions.every((value, i) => i === 0 || value > positions[i - 1]);
check('上限を超えた一致でも「次へ」が進む', advancing, positions.join(' → '));
await page.click('#btnSearchClose');

/* ---------- PWA: オフラインと共有受け取り ---------- */

await page.evaluate(() => navigator.serviceWorker.ready);
await page.waitForTimeout(1200);
const cachedCount = await page.evaluate(async () => {
  const name = (await caches.keys()).find((n) => n.startsWith('justtext-app-'));
  return name ? (await (await caches.open(name)).keys()).length : 0;
});
check('アプリ一式がキャッシュされる', cachedCount >= 20, `${cachedCount} 件`);

// WebKit は Playwright から通信断を再現できない（再読み込みが内部エラーになる）ため飛ばす
if (BROWSER_NAME === 'webkit') {
  console.log('  --   オフラインの確認は WebKit では再現できないため飛ばしました');
} else {
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await dismissDraft(page);
  check('オフラインでも起動する', await page.locator('#input').isVisible());
  const offlineStatus = await page.evaluate(async () => {
    const ta = document.querySelector('#input');
    ta.value = 'オフライン編集';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    return document.querySelector('#statusCount').textContent;
  });
  check('オフラインでも編集できる', offlineStatus.includes('7 文字'), offlineStatus);
  // 辞書は必要になったときに読み込むため、オフラインでも届くことを確かめる
  check('オフラインでも表示言語が保たれる', (await page.textContent('#btnOpen')) === '開く', await page.textContent('#btnOpen'));
  await context.setOffline(false);
}

// 共有ターゲットは Chromium 系（主に Android）だけの仕組みで、WebKit は
// そもそも共有先として登録されない。Service Worker 内で multipart を読めないため飛ばす。
if (BROWSER_NAME === 'webkit') {
  console.log('  --   共有の確認は WebKit が共有ターゲットに対応しないため飛ばしました');
} else {
  const shared = await page.evaluate(async () => {
    const form = new FormData();
    form.append('file', new File(['{\n  "共有": "テスト"\n}\n'], '共有されたデータ.json', { type: 'application/json' }));
    const res = await fetch('./share-target', { method: 'POST', body: form, redirect: 'manual' });
    return res.type;
  });
  check('共有 POST を Service Worker が受ける', shared === 'opaqueredirect' || shared === 'basic');

  await page.goto(`${BASE}?share=1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  check('共有で開いたときは復元を尋ねない', !(await page.locator('#draftDialog').isVisible()));
  check('共有されたファイルが開かれる', (await page.inputValue('#input')).includes('"共有": "テスト"'));
  check('ファイル名も引き継がれる', (await page.textContent('#fileName')) === '共有されたデータ.json');
  check('アドレスから share フラグが消える', (await page.evaluate(() => location.search)) === '');
}

check('通しでブラウザのエラーが出ない', errors.length === 0, errors.slice(0, 3).join(' | '));

/* ---------- 前回の編集内容の自動保存と復元 ---------- */

const draftContext = await browser.newContext(phone({ locale: 'ja-JP' }));
const draftPage = await draftContext.newPage();
const draftErrors = [];
draftPage.on('pageerror', (e) => draftErrors.push(e.message));
await draftPage.goto(BASE, { waitUntil: 'networkidle' });
await draftPage.waitForTimeout(300);
check('初回は復元を尋ねない', !(await draftPage.locator('#draftDialog').isVisible()));

await draftPage.fill('#input', '書きかけの内容');
await draftPage.waitForTimeout(2000); // 自動保存されるのを待つ

// 端末がアプリを終了させた状況を模して、開き直す
await draftPage.goto(BASE, { waitUntil: 'networkidle' });
await draftPage.waitForTimeout(700);
check('前回の続きがあれば尋ねる', await draftPage.locator('#draftDialog').isVisible());
check('どのファイルの続きか示す', (await draftPage.textContent('#draftBody')).includes('無題'), await draftPage.textContent('#draftBody'));
await draftPage.click('#draftDialog button[value="restore"]');
await draftPage.waitForTimeout(400);
check('前回の編集内容を復元できる', (await draftPage.inputValue('#input')) === '書きかけの内容', await draftPage.inputValue('#input'));
check('復元後も未保存のまま', await draftPage.locator('#dirtyMark').isVisible());
check('復元したことを知らせる', (await draftPage.textContent('#toastArea')).length > 0);

// 破棄を選べば、次からは尋ねない
await draftPage.fill('#input', 'もう一度書いた内容');
await draftPage.waitForTimeout(2000);
await draftPage.goto(BASE, { waitUntil: 'networkidle' });
await draftPage.waitForTimeout(700);
await draftPage.click('#draftDialog button[value="discard"]');
await draftPage.waitForTimeout(300);
check('破棄すれば空の状態で始まる', (await draftPage.inputValue('#input')) === '');
await draftPage.goto(BASE, { waitUntil: 'networkidle' });
await draftPage.waitForTimeout(700);
check('破棄した控えは残らない', !(await draftPage.locator('#draftDialog').isVisible()));

// 保存が済んだ内容は控えを残さない
await draftPage.fill('#input', '保存する内容');
await draftPage.waitForTimeout(200);
await draftPage.click('#btnSave');
await draftPage.waitForTimeout(250);
await draftPage.fill('#saveName', 'saved.txt');
const [draftDownload] = await Promise.all([draftPage.waitForEvent('download'), draftPage.click('#saveConfirm')]);
await draftDownload.saveAs(join(WORK, 'saved.txt'));
await draftPage.waitForTimeout(2000);
await draftPage.goto(BASE, { waitUntil: 'networkidle' });
await draftPage.waitForTimeout(700);
check('保存が済んでいれば復元を尋ねない', !(await draftPage.locator('#draftDialog').isVisible()));
check('自動保存でエラーが出ない', draftErrors.length === 0, draftErrors.join(' | '));
await draftContext.close();

/* ---------- 表示言語 ---------- */

// 端末の言語から自動で選ばれること（未対応の言語は英語になること）
const detection = [
  ['en-US', 'en', 'Open'],
  ['fr-FR', 'fr', 'Ouvrir'],
  ['de-DE', 'de', 'Öffnen'],
  ['es-ES', 'es', 'Abrir'],
  ['it-IT', 'it', 'Apri'],
  ['pt-BR', 'pt-BR', 'Abrir'],
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
  '端末の言語から表示言語が決まる',
  failedLocales.length === 0,
  failedLocales.map((r) => `${r.tag}: ${r.detail}`).join(' / ') || `${detectionResults.length} 言語を確認`,
);

// 未対応の言語は英語になること（日本語ではない）
const svContext = await browser.newContext(phone({ locale: 'sv-SE' }));
const svPage = await svContext.newPage();
await svPage.goto(BASE, { waitUntil: 'networkidle' });
await svPage.waitForTimeout(300);
check('未対応の言語は英語で開く', (await svPage.textContent('#fileName')) === 'untitled.txt');
await svContext.close();

// 右から左に書く言語（アラビア語）
const arContext = await browser.newContext(phone({ locale: 'ar-EG' }));
const arPage = await arContext.newPage();
const arErrors = [];
arPage.on('pageerror', (e) => arErrors.push(e.message));
await arPage.goto(BASE, { waitUntil: 'networkidle' });
await arPage.waitForTimeout(400);
check('アラビア語では画面が右から左になる', (await arPage.getAttribute('html', 'dir')) === 'rtl');
check('編集面だけは左から右のまま', (await arPage.getAttribute('#editor', 'dir')) === 'ltr');

await arPage.fill('#input', '{\n  "الاسم": "قيمة",\n  "items": ["foo", "bar", "foo"]\n}');
await arPage.click('#btnSearch');
await arPage.fill('#searchQuery', 'foo');
await arPage.waitForTimeout(300);
await arPage.click('#btnFindNext');
await arPage.waitForTimeout(300);
check('右から左でも件数が正しい向きで出る', (await arPage.textContent('#searchCount')) === '1 / 2');
check('右から左でも数字の並びが崩れない', (await arPage.evaluate(() => getComputedStyle(document.querySelector('#searchCount')).direction)) === 'ltr');

// 位置合わせが書字方向に影響されないこと
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
check('右から左でもハイライトが文字と重なる', rtlOverlap.dx < 1 && rtlOverlap.dy < 1, JSON.stringify(rtlOverlap));
check('右から左でもエラーが出ない', arErrors.length === 0, arErrors.join(' | '));
await arContext.close();

// 設定からの切り替えと、その保存
const enContext = await browser.newContext(phone({ locale: 'en-US' }));
const enPage = await enContext.newPage();
const enErrors = [];
enPage.on('pageerror', (e) => enErrors.push(e.message));
await enPage.goto(BASE, { waitUntil: 'networkidle' });
await enPage.waitForTimeout(300);

await enPage.fill('#input', 'one\ntwo');
await enPage.waitForTimeout(200);
check('件数表示も英語になる', (await enPage.textContent('#statusCount')) === '2 lines / 7 chars', await enPage.textContent('#statusCount'));

await enPage.click('#btnTools');
await enPage.waitForTimeout(250);
check('ツールの名前も英語になる', (await enPage.textContent('.tool-item[data-id="json.format2"]')).includes('Format JSON'));
await enPage.click('.tool-item[data-id="line.sortAsc"]');
await enPage.waitForTimeout(300);
check('英語のまま操作できる', (await enPage.inputValue('#input')) === 'one\ntwo');

// 一覧にすべての言語が並ぶこと
await enPage.click('#btnSettings');
await enPage.waitForTimeout(250);
const options = await enPage.$$eval('#setLanguage option', (els) => els.map((e) => e.value));
check('設定に 15 言語が並ぶ', options.length === 15, `${options.length} 件: ${options.join(', ')}`);
for (const code of ['en', 'fr', 'it', 'de', 'es', 'zh-Hans', 'zh-Hant', 'ja', 'ko', 'pt-BR', 'hi', 'id', 'vi', 'th', 'ar']) {
  if (!options.includes(code)) check(`${code} が一覧にある`, false);
}

// 何語からでも切り替えられること
await enPage.selectOption('#setLanguage', 'th');
await enPage.waitForTimeout(400);
check('タイ語に切り替わる', (await enPage.textContent('#btnOpen')) === 'เปิด', await enPage.textContent('#btnOpen'));
await enPage.selectOption('#setLanguage', 'ar');
await enPage.waitForTimeout(400);
check('アラビア語に切り替えると向きも変わる', (await enPage.getAttribute('html', 'dir')) === 'rtl');
await enPage.selectOption('#setLanguage', 'ja');
await enPage.waitForTimeout(400);
check('選んだ言語にすぐ切り替わる', (await enPage.textContent('#btnOpen')) === '開く', await enPage.textContent('#btnOpen'));
check('切り替えると向きも戻る', (await enPage.getAttribute('html', 'dir')) === 'ltr');
check('開いたままの画面も切り替わる', (await enPage.textContent('#settingsTitle')) === '設定');
await enPage.click('#settingsClose');
await enPage.waitForTimeout(200);
check('既定のファイル名も付け替わる', (await enPage.textContent('#fileName')) === '無題.txt');
check('件数表示も日本語になる', (await enPage.textContent('#statusCount')) === '2 行 / 7 文字');

await enPage.reload({ waitUntil: 'networkidle' });
await enPage.waitForTimeout(400);
await dismissDraft(enPage);
check('選んだ言語は次回も残る', (await enPage.textContent('#btnOpen')) === '開く');

await enPage.click('#btnSearch');
await enPage.fill('#searchQuery', 'zzz');
await enPage.waitForTimeout(250);
await enPage.click('#btnFindNext');
await enPage.waitForTimeout(300);
check('通知の文言も選んだ言語になる', (await enPage.textContent('#toastArea')).includes('見つかりません'), await enPage.textContent('#toastArea'));

check('言語切り替えでエラーが出ない', enErrors.length === 0, enErrors.join(' | '));
await enContext.close();

/* ---------- 後片付け ---------- */

await browser.close();
stopServer();

const failed = results.filter((r) => !r.ok);
console.log('-'.repeat(46));
console.log(`${BROWSER_NAME}: ${results.length - failed.length}/${results.length} 件 通過`);
if (failed.length > 0) {
  console.log('失敗:', failed.map((f) => f.name).join(' / '));
  process.exit(1);
}
